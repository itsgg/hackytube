#!/bin/sh
# Serve the production build on 127.0.0.1:5180. Run by the LaunchAgent that `make service` installs.
cd "$(dirname "$0")/../web" || exit 1
exec node node_modules/vite/bin/vite.js preview --port 5180 --strictPort --host 127.0.0.1
