"""Design a topic taxonomy from the most-recommended videos, then file every video under 1-2 topics.

Inputs: data/videos_base.json (written by 06_build.py --base). Outputs: data/topics.json, data/video_topics.jsonl.
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from llm import chat, json_block

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "data" / "videos_base.json"
TOPICS = ROOT / "data" / "topics.json"
OUT = ROOT / "data" / "video_topics.jsonl"
MODEL = os.environ.get("TOPIC_MODEL", "claude-sonnet-5-5")

TAXONOMY = """You are organising a video library: YouTube videos that Hacker News commenters recommended to each other from 2007 to 2026.
Design the shelves. Propose 36 to 48 topics that together cover the sample, the way a sharp librarian who reads HN would:
specific enough to browse ("Compilers & language design", "Startups & fundraising", "Retro computing", "Woodworking & making"), never vague ("Technology", "Other", "Misc").
Names: sentence case, at most 4 words, ampersand allowed. Put the topics in the order a visitor should meet them on the front page, broadest appeal first.
Return only JSON: [{"name": "...", "covers": "one line on what belongs here"}]"""

ASSIGN = """File each video under the topic list below. Give 1 topic, or 2 when the video truly straddles two. First topic is the primary shelf.
Use the title, channel, description and what HN said about it. Return only JSON: [{"v": "<video id>", "tp": [<topic number>, ...]}]

Topics:
"""


def main():
    vids = json.loads(BASE.read_text())
    if not TOPICS.exists():
        sample = "\n".join(f"{v['t']} | {v['c']}" for v in vids[:1800])
        topics = [t for t in json_block(chat(MODEL, TAXONOMY, sample, max_tokens=6000)) if isinstance(t, dict) and t.get("name")]
        if len(topics) < 10:
            raise SystemExit(f"taxonomy came back with {len(topics)} topics; not caching it, rerun to retry")
        TOPICS.write_text(json.dumps(topics, indent=1, ensure_ascii=False))
        print(len(topics), "topics:", ", ".join(t["name"] for t in topics))
    topics = json.loads(TOPICS.read_text())
    listing = "\n".join(f"{i}. {t['name']}: {t['covers']}" for i, t in enumerate(topics))

    done = {json.loads(line)["v"] for line in OUT.open()} if OUT.exists() else set()
    todo = [v for v in vids if v["v"] not in done]
    batches = [todo[i : i + 60] for i in range(0, len(todo), 60)]
    print(len(todo), "videos to file in", len(batches), "calls")

    def run(batch):
        lines = "\n".join(
            json.dumps(
                {"v": v["v"], "title": v["t"], "channel": v["c"], "desc": v.get("desc", "")[:240], "hn": v["q"][:200]},
                ensure_ascii=False,
            )
            for v in batch
        )
        try:
            got = json_block(chat(MODEL, ASSIGN + listing, lines))
        except RuntimeError as e:  # the proxy gave up; the rerun picks this batch up
            print("batch failed:", e, flush=True)
            return []
        ok = {v["v"] for v in batch}
        return [o for o in got if isinstance(o, dict) and o.get("v") in ok and o.get("tp")]

    with OUT.open("a") as f, ThreadPoolExecutor(int(os.environ.get("WORKERS", "8"))) as ex:
        for n, res in enumerate(ex.map(run, batches), 1):
            for o in res:
                o["tp"] = [int(t) for t in o["tp"][:2] if 0 <= int(t) < len(topics)]
                f.write(json.dumps(o) + "\n")
            f.flush()
            if n % 20 == 0:
                print(n, "/", len(batches), flush=True)


if __name__ == "__main__":
    main()
