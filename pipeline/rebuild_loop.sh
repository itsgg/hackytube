#!/bin/sh
# Rebuild the site catalog every 5 minutes while labeling and metadata fill in.
cd "$(dirname "$0")/.."
while true; do
  uv run python pipeline/06_build.py >> data/rebuild.log 2>&1
  sleep 300
done
