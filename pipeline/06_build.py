"""Assemble the site catalog from candidates, labels, metadata, topics and DeArrow titles.

python 06_build.py --base   -> data/videos_base.json (input to 05_topics.py)
python 06_build.py          -> web/public/data/{catalog.json, feed.xml, v/*.json}

Set SITE_URL so the RSS feed links point at the deployed site.
"""

import json
import math
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime
from email.utils import format_datetime
from itertools import combinations
from pathlib import Path
from xml.sax.saxutils import escape

import duckdb

from common import chapters_from, clean

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
WEB = ROOT / "web" / "public" / "data"
MIN_SUB_SCORE = 30  # a story submission counts as a recommendation once HN upvoted it this far
MAX_THREAD = 250  # cap per-thread pairs so a megathread can't dominate related videos


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")).strip("-")


def shard_key(vid: str) -> str:
    """Two hex-encoded leading characters; web/src/data.ts computes the same key."""
    return f"{ord(vid[0]):x}{ord(vid[1]):x}"


def load_meta(lines) -> dict:
    """Latest settled record per video, keeping only ones that can play in the embedded player."""
    latest = {}
    for line in lines:
        r = json.loads(line)
        if r.get("status") in ("OK", "GONE", "PRIVATE", "ERROR", "UNPLAYABLE"):
            latest[r["vid"]] = r
    return {
        vid: r
        for vid, r in latest.items()
        if r["status"] == "OK" and r.get("embeddable", True) and not r.get("live") and r.get("title")
    }


def add_vouch(people: dict, e: dict) -> None:
    """Keep each person's strongest comment about a video, so one prolific fan counts once."""
    old = people.get(e["by"])
    if not old or (e["s"], len(e["q"])) > (old["s"], len(old["q"])):
        people[e["by"]] = e


def summarize(vid: str, es: list, m: dict) -> dict | None:
    """One catalog row, or None when the video doesn't clear the bar for inclusion."""
    strong = sum(1 for e in es if e["s"] == 3)
    pts = max((e.get("pts", 0) for e in es), default=0)
    if not (len(es) >= 2 or strong >= 1 or pts >= 100):
        return None
    years = [int(e["at"][:4]) for e in es]
    w = sum(1.5 if e["s"] == 3 else 1.0 for e in es) + (math.log10(pts) if pts else 0) + 0.15 * (max(years) - min(years))
    best = max((e for e in es if 20 <= len(e["q"]) <= 220), key=lambda e: (e["s"], min(len(e["q"]), 140)), default=None)
    return {
        "v": vid,
        "t": m["title"],
        "c": m.get("channel") or "",
        "d": int(m.get("seconds") or 0),
        "p": (m.get("published") or "")[:7],
        "n": len(es),
        "w": round(w, 2),
        "y0": min(years),
        "y1": max(years),
        "l": max(e["at"] for e in es)[:10],
        "f": min(e["at"] for e in es)[:10],
        "tp": [],
        "q": best["q"] if best else "",
        "qa": best["by"] if best else "",
        "qy": int(best["at"][:4]) if best else 0,
        "rel": [],
    }


def related(videos: list, vouch: dict, k: int = 20) -> list:
    """For each video, the videos most often recommended in the same HN threads, discounted by thread size."""
    index = {v["v"]: i for i, v in enumerate(videos)}
    by_story = defaultdict(set)
    for v in videos:
        for e in vouch[v["v"]].values():
            by_story[e["sid"]].add(index[v["v"]])
    rel = defaultdict(lambda: defaultdict(float))
    for members in by_story.values():
        if len(members) < 2:
            continue
        ms = sorted(members)[:MAX_THREAD]
        wgt = 1 / math.log2(1 + len(ms))
        for a, b in combinations(ms, 2):
            rel[a][b] += wgt
            rel[b][a] += wgt
    return [[j for j, _ in sorted(rel[i].items(), key=lambda kv: (-kv[1], kv[0]))[:k]] for i in range(len(videos))]


def feed(videos: list, site: str, limit: int = 100) -> str:
    """RSS of the videos HN started recommending most recently."""
    items = []
    for v in sorted(videos, key=lambda v: v["f"], reverse=True)[:limit]:
        when = format_datetime(datetime.fromisoformat(v["f"] + "T12:00:00+00:00"))
        who = f"{v['n']} {'person' if v['n'] == 1 else 'people'} on HN recommended this"
        body = f"“{v['q']}” ({v['qa']}). {who}." if v["q"] else f"{who}."
        items.append(
            f"<item><title>{escape(v['t'])}</title><link>{site}/watch/{v['v']}</link>"
            f'<guid isPermaLink="false">hackytube-{v["v"]}</guid><pubDate>{when}</pubDate>'
            f"<description>{escape(body)}</description></item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
        f"<title>hackytube: newly recommended on Hacker News</title><link>{site}/</link>"
        "<description>YouTube videos Hacker News commenters just started recommending</description>"
        + "".join(items)
        + "</channel></rss>\n"
    )


def main():
    base_only = "--base" in sys.argv
    site = os.environ.get("SITE_URL", "http://127.0.0.1:5180").rstrip("/")
    c = duckdb.connect()
    c.execute(f"create table cand as select * from '{D / 'candidates.parquet'}'")
    c.execute(
        "create table lab as select split_part(k, ':', 1)::uinteger as id, split_part(k, ':', 2) as vid, s, quote"
        f" from read_json_auto('{D / 'labels.jsonl'}')"
    )
    recs = c.execute(
        """select c.vid, c."by", c.time::varchar, c.id, c.story_id, c.story_title, c.story_score, l.s, l.quote, c.text, c.t
           from cand c join lab l on l.id = c.id and l.vid = c.vid
           where c.type = 2 and l.s >= 2 and c."by" is not null"""
    ).fetchall()
    subs = c.execute(
        f"""select vid, "by", time::varchar, id, title, score from cand
            where type = 1 and score >= {MIN_SUB_SCORE} and "by" is not null"""
    ).fetchall()
    meta = load_meta((D / "meta.jsonl").open())

    vouch = defaultdict(dict)
    for vid, by, at, cid, sid, st, sp, s, quote, text, ts in recs:
        if vid in meta:
            add_vouch(vouch[vid], {"by": by, "at": at.replace(" ", "T"), "cid": cid, "sid": sid, "st": st or "",
                                   "sp": sp, "s": s, "q": (quote or "").strip(), "x": clean(text)[:2400], "t": ts})  # fmt: skip
    for vid, by, at, sid, title, score in subs:
        if vid in meta and by not in vouch[vid]:
            vouch[vid][by] = {"by": by, "at": at.replace(" ", "T"), "cid": sid, "sid": sid, "st": title or "", "sp": score,
                              "s": 2, "q": "", "x": f"Submitted to Hacker News as “{title}”.", "t": None, "pts": score}  # fmt: skip

    videos = [row for vid, people in vouch.items() if (row := summarize(vid, list(people.values()), meta[vid]))]
    videos.sort(key=lambda v: (-v["w"], -v["n"], v["v"]))
    print(len(videos), "videos;", sum(v["n"] for v in videos), "recommendations")

    if base_only:
        for v in videos:
            v["desc"] = (meta[v["v"]].get("desc") or "")[:300]
        (D / "videos_base.json").write_text(json.dumps(videos, ensure_ascii=False))
        return

    # Topics are optional so a preview can ship before the taxonomy exists.
    topics = json.loads((D / "topics.json").read_text()) if (D / "topics.json").exists() else []
    vt_file = D / "video_topics.jsonl"
    vt = {o["v"]: o["tp"] for o in map(json.loads, vt_file.open())} if vt_file.exists() else {}
    da_file = D / "dearrow.jsonl"
    honest = {o["vid"]: o["title"] for o in map(json.loads, da_file.open()) if o.get("title")} if da_file.exists() else {}
    counts = defaultdict(int)
    for v, rel in zip(videos, related(videos, vouch)):
        v["tp"] = vt.get(v["v"], [])
        v["rel"] = rel
        if honest.get(v["v"]) and honest[v["v"]] != v["t"]:
            v["ht"] = honest[v["v"]]
        for t in v["tp"]:
            counts[t] += 1
    topic_out = [
        {"id": i, "name": t["name"], "slug": slug(t["name"]), "count": counts[i]} for i, t in enumerate(topics) if counts[i]
    ]

    WEB.mkdir(parents=True, exist_ok=True)
    catalog = {"topics": topic_out, "videos": videos, "built": date.today().isoformat()}
    (WEB / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")))
    (WEB / "feed.xml").write_text(feed(videos, site))
    shards = defaultdict(dict)
    for v in videos:
        m = meta[v["v"]]
        es = sorted(vouch[v["v"]].values(), key=lambda e: e["at"])
        for e in es:
            e.pop("pts", None)
        shards[shard_key(v["v"])][v["v"]] = {"vouches": es, "chapters": m.get("chapters") or chapters_from(m.get("desc", ""))}
    (WEB / "v").mkdir(exist_ok=True)
    for k, s in shards.items():
        (WEB / "v" / f"{k}.json").write_text(json.dumps(s, ensure_ascii=False, separators=(",", ":")))
    print("topics:", len(topic_out), "shards:", len(shards), "catalog bytes:", (WEB / "catalog.json").stat().st_size)


if __name__ == "__main__":
    main()
