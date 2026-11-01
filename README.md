# hackytube

A video library built from every YouTube video Hacker News commenters recommended to each other, 2007 to today. Each video comes with the comments that recommended it, so you can see why people pointed to it before you press play.

Inspired by Andrej Karpathy's [HackerTube](https://karpathy.bearblog.dev/hacker-tube/). What this version adds:

- **The reasons, not just the links.** Every watch page lists the HN comments that recommended the video, with the sentence that says why highlighted and a link back to the thread.
- **Timestamps.** When a commenter linked to a moment (`&t=1h2m`), a chip jumps the player there.
- **Recommended in the same threads.** Related videos come from HN co-recommendation, not from YouTube.
- **Ranking by people.** Videos rank by how many distinct people recommended them and for how many years, so a talk people kept citing for a decade beats one that trended for a week.
- **For you, with no account.** Watch history and saves stay in your browser and feed a local recommender.
- **Search** across titles, channels, topics and what people said, plus keyboard shortcuts for everything (`?` lists them).

## How the data is made

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `01_extract.py` | Reads the [open-index/hacker-news](https://huggingface.co/datasets/open-index/hacker-news) Parquet dump month by month, keeps items that mention YouTube, and writes a slim `(id, parent)` index of everything. |
| 2 | `02_candidates.py` | Parses video ids and timestamps out of comment HTML and walks each comment up to its thread. |
| 3 | `03_label.py` | An LLM scores each comment 0 to 3 for how strongly it recommends the video and pulls out a verbatim quote saying why. Most-recommended videos go first, so a partial run is already useful. |
| 4 | `04_meta.py` | Fetches title, channel, duration and availability from YouTube. Removed, private and non-embeddable videos are dropped. |
| 5 | `05_topics.py` | An LLM designs 36 to 48 shelves from the top videos, then files every video under one or two. |
| 6 | `06_build.py` | Writes `web/public/data/catalog.json` and per-video comment shards. |

A video makes the catalog when at least two different people recommended it, one person called it a must-watch, or its submission reached 100 points.

## Running it

Needs [uv](https://docs.astral.sh/uv/), Node 20+, and an OpenAI-compatible chat endpoint for steps 3 and 5 (`LLM_API`, default `http://localhost:8317/v1/chat/completions`; models via `LABEL_MODEL` and `TOPIC_MODEL`).

```sh
uv sync
cd web && npm install && cd ..
make data      # every step; each one resumes if interrupted
make dev       # http://127.0.0.1:5180
```

`make watch` rebuilds the catalog every 5 minutes, so the site fills in while labeling runs. `make site` produces a static build in `web/dist` that any file host can serve.

## Layout

```
pipeline/   data steps (Python, DuckDB)
web/        the site (React, Vite, no UI kit)
data/       intermediate files, not committed
```
