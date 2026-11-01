"""Pull YouTube-mentioning items plus a slim (id, parent, title) index from the HN dump."""

import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import duckdb

OUT = Path(__file__).resolve().parent.parent / "data" / "raw"
BASE = "https://huggingface.co/datasets/open-index/hacker-news/resolve/main/"


def files():
    d = json.loads(urllib.request.urlopen("https://huggingface.co/api/datasets/open-index/hacker-news").read())
    return sorted(
        s["rfilename"] for s in d["siblings"] if s["rfilename"].startswith("data/") and s["rfilename"].endswith(".parquet")
    )


def one(f):
    stem = Path(f).stem
    yt, idx = OUT / f"yt_{stem}.parquet", OUT / f"idx_{stem}.parquet"
    if yt.exists() and idx.exists():
        return f, "skip"
    c = duckdb.connect()
    c.sql("load httpfs")
    for attempt in range(4):
        try:
            c.sql(
                f"create or replace temp table t as select id, type, \"by\", time, text, parent, url, score, title, descendants, deleted, dead from '{BASE}{f}'"
            )
            break
        except Exception as e:
            if attempt == 3:
                return f, f"fail {e}"
    c.sql(f"""copy (select * from t where coalesce(deleted,0)=0 and coalesce(dead,0)=0 and
                (text ilike '%youtu%' or url ilike '%youtu%')) to '{yt}' (format parquet)""")
    c.sql(
        f"copy (select id, parent, case when title is not null then title end as title, score from t) to '{idx}' (format parquet)"
    )
    n = c.execute(f"select count(*) from '{yt}'").fetchone()[0]
    return f, n


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    duckdb.connect().sql("install httpfs")
    fs = files()
    print(len(fs), "files", flush=True)
    with ThreadPoolExecutor(8) as ex:
        for f, r in ex.map(one, fs):
            print(f, r, flush=True)
