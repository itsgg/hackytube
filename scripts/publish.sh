#!/bin/sh
# Rebuild the catalog and the site, then swap the new build in so the running server never serves a half-written one.
set -e
cd "$(dirname "$0")/.."
# Feed links point at the deployed site; keep its URL in an untracked .site-url file.
SITE_URL="${SITE_URL:-$(cat .site-url 2>/dev/null || echo http://127.0.0.1:5180)}"
export SITE_URL
uv run python pipeline/06_build.py
cd web
node node_modules/vite/bin/vite.js build --outDir dist.next --emptyOutDir --logLevel warn
[ -d dist ] && mv dist dist.old
mv dist.next dist
[ -d dist.old ] && rm -r dist.old
echo "published $(date '+%Y-%m-%d %H:%M')"
