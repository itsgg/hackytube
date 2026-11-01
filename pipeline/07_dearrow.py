"""Fetch DeArrow's crowd-voted, de-clickbaited titles for every video in the catalog.

DeArrow (https://dearrow.ajay.app) lets viewers submit accurate titles and vote on them.
Resumable via data/dearrow.jsonl; run after 06_build.py, then rebuild to pick the titles up.
"""

import json
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "dearrow.jsonl"
CATALOG = ROOT / "web" / "public" / "data" / "catalog.json"


def pick_title(branding: dict) -> str | None:
    """DeArrow's own display rule: a title shows if it is locked or has a positive vote, and isn't the original."""
    for t in branding.get("titles", []):
        if t.get("original"):
            continue
        if t.get("locked") or t.get("votes", 0) >= 1:
            return t["title"].lstrip(">").strip() or None  # a leading ">" opts the title out of auto-formatting
    return None


def fetch(vid: str) -> dict:
    url = f"https://sponsor.ajay.app/api/branding?videoID={vid}"
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "hackytube/0.1 (+https://github.com/itsgg/hackytube)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return {"vid": vid, "title": pick_title(json.loads(r.read()))}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"vid": vid, "title": None}
        except Exception:  # noqa: BLE001, S110 - transient; retried below
            pass
    return {"vid": vid, "error": True}


def main():
    vids = [v["v"] for v in json.loads(CATALOG.read_text())["videos"]]
    done = {r["vid"] for r in map(json.loads, OUT.open()) if not r.get("error")} if OUT.exists() else set()
    todo = [v for v in vids if v not in done]
    print(len(todo), "videos to look up on DeArrow", flush=True)
    with OUT.open("a") as f, ThreadPoolExecutor(4) as ex:
        for r in ex.map(fetch, todo):
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
