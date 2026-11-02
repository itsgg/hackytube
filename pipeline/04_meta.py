"""Fetch YouTube metadata for every recommended video; resumable via data/meta.jsonl.

With YOUTUBE_API_KEY set, uses the Data API (videos.list, 50 ids a call): title, channel, duration,
upload date, embeddability, age restriction and chapters from the description.
Without it, uses the public oEmbed endpoint: title, channel and availability, but no duration.

Which videos: MIN_PEOPLE=N picks videos linked by N+ distinct commenters (no labels needed);
otherwise every video with a label of 2+.
"""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb
from common import chapters_from

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "meta.jsonl"
KEY = os.environ.get("YOUTUBE_API_KEY")
ISO = re.compile(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


def iso_duration(d: str) -> int:
    m = ISO.fullmatch(d or "")
    if not m:
        return 0
    days, h, mi, s = (int(g) if g else 0 for g in m.groups())
    return days * 86400 + h * 3600 + mi * 60 + s


def get(url: str, retries: int = 4):
    err = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "hackytube/0.1 (+https://github.com/itsgg/hackytube)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 403, 404):
                return e.code, b""
            err = e
        except Exception as e:  # noqa: BLE001 - retry anything transient
            err = e
        time.sleep(2**i)
    raise RuntimeError(err)


def from_api(item: dict) -> dict:
    sn, cd, st = item.get("snippet", {}), item.get("contentDetails", {}), item.get("status", {})
    return {
        "vid": item["id"],
        "status": "OK" if st.get("privacyStatus") in ("public", "unlisted") else "PRIVATE",
        "embeddable": st.get("embeddable", True) and cd.get("contentRating", {}).get("ytRating") != "ytAgeRestricted",
        "title": sn.get("title"),
        "channel": sn.get("channelTitle"),
        "channel_id": sn.get("channelId"),
        "seconds": iso_duration(cd.get("duration", "")),
        "desc": (sn.get("description") or "")[:600],
        "published": sn.get("publishedAt"),
        "live": sn.get("liveBroadcastContent", "none") != "none",
        "chapters": chapters_from(sn.get("description", "")),
        "source": "api",
    }


def fetch_api(batch: list) -> list:
    q = urllib.parse.urlencode({"part": "snippet,contentDetails,status", "id": ",".join(batch), "key": KEY})
    status, body = get(f"https://www.googleapis.com/youtube/v3/videos?{q}")
    if status != 200:
        raise RuntimeError(f"Data API returned {status}; check YOUTUBE_API_KEY and quota")
    found = {it["id"]: from_api(it) for it in json.loads(body).get("items", [])}
    return [found.get(v, {"vid": v, "status": "GONE", "source": "api"}) for v in batch]


def fetch_oembed(vid: str) -> dict:
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}")
    try:
        status, body = get(url)
    except RuntimeError as e:
        return {"vid": vid, "status": "FETCHFAIL", "err": str(e)}
    if status == 401:  # exists, but the uploader disabled embedding
        return {"vid": vid, "status": "OK", "embeddable": False, "source": "oembed"}
    if status != 200:
        return {"vid": vid, "status": "GONE", "source": "oembed"}
    o = json.loads(body)
    return {
        "vid": vid,
        "status": "OK",
        "embeddable": True,
        "title": o.get("title"),
        "channel": o.get("author_name"),
        "seconds": 0,
        "chapters": [],
        "source": "oembed",
    }


def wanted(c) -> list:
    cand = ROOT / "data" / "candidates.parquet"
    if os.environ.get("MIN_PEOPLE"):
        sql = f"""select vid from '{cand}' where type = 2 group by vid
                  having count(distinct "by") >= {int(os.environ["MIN_PEOPLE"])} order by count(distinct "by") desc"""
    else:
        labels = ROOT / "data" / "labels.jsonl"
        sql = f"""select distinct split_part(k, ':', 2) from read_json_auto('{labels}') where s >= 2
                  union select distinct vid from '{cand}' where type = 1 and score >= 20"""
    return [r[0] for r in c.execute(sql).fetchall()]


def final(record: dict) -> bool:
    """Settled records are skipped on rerun; failed or bot-walled fetches are retried."""
    return record.get("status") in ("OK", "GONE", "PRIVATE", "ERROR", "UNPLAYABLE")


def main():
    vids = wanted(duckdb.connect())
    done = {r["vid"] for r in map(json.loads, OUT.open()) if final(r)} if OUT.exists() else set()
    todo = [v for v in vids if v not in done]
    print(len(vids), "videos,", len(todo), "to fetch via", "Data API" if KEY else "oEmbed", flush=True)
    with OUT.open("a") as f:
        if KEY:
            for i in range(0, len(todo), 50):
                for r in fetch_api(todo[i : i + 50]):
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
                f.flush()
        else:
            with ThreadPoolExecutor(4) as ex:
                for i, r in enumerate(ex.map(fetch_oembed, todo), 1):
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
                    if i % 200 == 0:
                        f.flush()
                        print(i, flush=True)


if __name__ == "__main__":
    main()
