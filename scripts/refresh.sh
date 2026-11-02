#!/bin/sh
# Bring every data step up to date, publishing after each one so the live site improves as it goes.
# Safe to rerun: every step resumes. Logs to data/refresh.log.
cd "$(dirname "$0")/.."
log() { echo "== $(date '+%H:%M:%S') $*"; }
log meta; uv run python pipeline/04_meta.py
log publish; ./scripts/publish.sh
log topics; uv run python pipeline/06_build.py --base && uv run python pipeline/05_topics.py
log publish; ./scripts/publish.sh
log dearrow; uv run python pipeline/07_dearrow.py
log publish; ./scripts/publish.sh
log done
