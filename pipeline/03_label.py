"""Label each comment-video pair: is it a genuine recommendation, and what's the best verbatim pull quote.

Resumable: results append to data/labels.jsonl and finished comment ids are skipped on rerun.
"""

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import duckdb
from common import clean
from llm import chat, json_block

ROOT = Path(__file__).resolve().parent.parent
CAND = ROOT / "data" / "candidates.parquet"
OUT = ROOT / "data" / "labels.jsonl"
MODEL = os.environ.get("LABEL_MODEL", "claude-sonnet-5-5")
BATCH = 25
WORKERS = int(os.environ.get("WORKERS", "12"))

PROMPT = """You label Hacker News comments that link to YouTube videos.

For each (comment, video) pair decide how strongly the commenter recommends that specific video to others:
3 = enthusiastic, explicit recommendation ("must watch", "best talk on X", "changed how I think")
2 = clear recommendation or positive pointer ("great talk on this", "worth watching")
1 = neutral reference or citation (link as evidence, "here's the video", source for a claim)
0 = not a recommendation: criticism, joke/meme link, music in passing, spam, self-promotion, ad, or the video is mocked

Also return "quote": the shortest verbatim span (max 30 words) from the comment that says WHY the video is good, copied exactly, without HTML. Use "" if there is no such span.

Return only a JSON array, one object per pair, in input order: [{"k": "<key>", "s": <0-3>, "quote": "..."}]"""


def label(batch):
    lines = []
    for r in batch:
        lines.append(
            json.dumps(
                {"k": f"{r['id']}:{r['vid']}", "thread": r["story_title"], "video": r["vid"], "comment": clean(r["text"])[:1500]},
                ensure_ascii=False,
            )
        )
    content = chat(MODEL, PROMPT, "\n".join(lines))
    got = {o["k"]: o for o in json_block(content) if isinstance(o, dict) and "k" in o}
    return [
        {"k": f"{r['id']}:{r['vid']}", "s": int(got[k]["s"]), "quote": got[k].get("quote", "")}
        for r in batch
        if (k := f"{r['id']}:{r['vid']}") in got
    ]


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    done = set()
    if OUT.exists():
        done = {json.loads(line)["k"] for line in OUT.open()}
    c = duckdb.connect()
    # Most-recommended videos first, so a partial run already covers the videos people will see.
    min_people = int(os.environ.get("MIN_PEOPLE", "1"))
    rows = c.execute(
        f"""with p as (select vid, count(distinct "by") as people from '{CAND}' where type = 2 group by vid)
            select c.id, c.vid, c.text, c.story_title from '{CAND}' c join p using (vid)
            where c.type = 2 and p.people >= {min_people} order by p.people desc, c.vid, c.id"""
    ).fetchall()
    todo = [{"id": a, "vid": b, "text": t, "story_title": s or ""} for a, b, t, s in rows if f"{a}:{b}" not in done]
    if limit:
        todo = todo[:limit]
    batches = [todo[i : i + BATCH] for i in range(0, len(todo), BATCH)]
    print(f"{len(done)} done, {len(todo)} to label in {len(batches)} calls with {MODEL}", flush=True)
    n, t0 = 0, time.time()
    with OUT.open("a") as f, ThreadPoolExecutor(WORKERS) as ex:
        for fut in as_completed(ex.submit(label, b) for b in batches):
            try:
                res = fut.result()
            except Exception as e:  # noqa: BLE001
                print("batch failed:", e, flush=True)
                continue
            for o in res:
                f.write(json.dumps(o, ensure_ascii=False) + "\n")
            f.flush()
            n += 1
            if n % 50 == 0:
                print(f"{n}/{len(batches)} calls, {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
