"""Turn raw YouTube-mentioning items into (item, video_id) candidate rows with thread context."""

import html
import re
import time
from pathlib import Path

import duckdb
import pyarrow as pa

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "candidates.parquet"

YT = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/(?:watch\?(?:[^\"\s<>]*?&(?:amp;)?)?v=|embed/|shorts/|live/|v/)|youtu\.be/)"
    r"([A-Za-z0-9_-]{11})([^\"\s<>]*)"
)
T = re.compile(r"[?&#](?:amp;)?(?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(\d+)?s?")


def parse_t(rest: str):
    m = T.search(rest)
    if not m or not any(m.groups()):
        return None
    h, mi, s = (int(g) if g else 0 for g in m.groups())
    return h * 3600 + mi * 60 + s or None


def videos_in(*fields: str | None) -> list[tuple[str, int | None]]:
    """Distinct YouTube ids linked in an item's url/text, in order, each with the timestamp the link starts at."""
    src = html.unescape(" ".join(x for x in fields if x))
    out, seen = [], set()
    for m in YT.finditer(src):
        if m.group(1) not in seen:
            seen.add(m.group(1))
            out.append((m.group(1), parse_t(m.group(2))))
    return out


def finished():
    """Months whose extraction is complete (both files present and idx no longer being written)."""
    out = []
    for yt in sorted(RAW.glob("yt_*.parquet")):
        idx = RAW / yt.name.replace("yt_", "idx_")
        if idx.exists() and time.time() - idx.stat().st_mtime > 20:
            out.append((str(yt), str(idx)))
    return out


def main():
    c = duckdb.connect()
    months = finished()
    print(len(months), "finished months")
    c.execute("create table yt as select * from read_parquet(?)", [[a for a, _ in months]])
    rows = c.execute('select id, type, "by", time, text, url, score, title, parent from yt').fetchall()
    out = []
    for id_, typ, by, at, text, url, score, title, parent in rows:
        for vid, t in videos_in(url, text):
            out.append((id_, typ, by, at, text, score, title, parent, vid, t))
    cols = ["id", "type", "by", "time", "text", "score", "title", "parent", "vid", "t"]
    arrow = pa.table({k: [r[i] for r in out] for i, k in enumerate(cols)})  # noqa: F841 - read by duckdb below
    c.execute("create table cand as select * from arrow")
    print("candidate rows", len(out), "distinct videos", c.execute("select count(distinct vid) from cand").fetchone()[0])

    # Walk each comment up to its root story using the slim id/parent index.
    c.execute("create table idx as select id, parent, title, score from read_parquet(?)", [[b for _, b in months]])
    c.execute(
        """create table roots as
           with recursive up(start, cur, depth) as (
             select distinct id, id, 0 from cand where type = 2
             union all
             select u.start, i.parent, u.depth + 1 from up u join idx i on i.id = u.cur
             where i.parent is not null and u.depth < 200
           )
           select start, arg_max(cur, depth) as root from up group by start"""
    )
    c.execute(
        f"""copy (
          select cand.*, coalesce(r.root, cand.id) as story_id,
                 coalesce(s.title, cand.title) as story_title, s.score as story_score
          from cand left join roots r on r.start = cand.id
          left join idx s on s.id = coalesce(r.root, cand.id)
        ) to '{OUT}' (format parquet)"""
    )
    print(c.execute(f"select type, count(*), count(story_title) from '{OUT}' group by 1").fetchall())


if __name__ == "__main__":
    main()
