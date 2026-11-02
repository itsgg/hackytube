# Each step is resumable: rerun any target and it picks up where it stopped.
PY := uv run python pipeline

.PHONY: data extract candidates label meta topics build watch dev site lint test publish refresh service unservice

data: extract candidates label meta topics build

extract:     ## HN dump -> YouTube-mentioning items + slim thread index (data/raw)
	$(PY)/01_extract.py
candidates:  ## parse video ids and timestamps, find each comment's root thread
	$(PY)/02_candidates.py
label:       ## LLM labels: is it a recommendation, and the verbatim reason
	MIN_PEOPLE=$${MIN_PEOPLE:-2} $(PY)/03_label.py
meta:        ## YouTube title, channel, duration, availability
	$(PY)/04_meta.py
topics:      ## LLM-designed shelves, then file every video under them
	$(PY)/06_build.py --base && $(PY)/05_topics.py
build:       ## write web/public/data (catalog + per-video comment shards)
	$(PY)/06_build.py
watch:       ## rebuild the catalog every 5 minutes while long steps run
	./pipeline/rebuild_loop.sh

dev:
	cd web && npm run dev
site:
	cd web && npm run build
lint:
	uv run ruff check pipeline tests && uv run ruff format --check pipeline tests && cd web && npm run lint && npm run typecheck
test:
	uv run pytest -q && cd web && npm test && npm run e2e

publish:     ## rebuild catalog + site and swap it in under the running server
	./scripts/publish.sh
refresh:     ## run the remaining data steps in the background, publishing as they land
	nohup ./scripts/refresh.sh >> data/refresh.log 2>&1 &

# Keep the site up across sessions and reboots with a macOS LaunchAgent (serves web/dist on 127.0.0.1:5180).
AGENT := $(HOME)/Library/LaunchAgents/com.itsgg.hackytube.plist
service:
	@mkdir -p $(HOME)/Library/LaunchAgents
	@printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>' \
	  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' \
	  '<plist version="1.0"><dict>' \
	  '<key>Label</key><string>com.itsgg.hackytube</string>' \
	  '<key>ProgramArguments</key><array><string>$(CURDIR)/scripts/serve.sh</string></array>' \
	  '<key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dir $(shell node -p process.execPath)):/usr/bin:/bin</string></dict>' \
	  '<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>' \
	  '<key>StandardOutPath</key><string>$(CURDIR)/data/serve.log</string>' \
	  '<key>StandardErrorPath</key><string>$(CURDIR)/data/serve.log</string>' \
	  '</dict></plist>' > $(AGENT)
	launchctl bootout gui/$$(id -u) $(AGENT) 2>/dev/null || true
	launchctl bootstrap gui/$$(id -u) $(AGENT)
	@echo "serving on http://127.0.0.1:5180"
unservice:
	launchctl bootout gui/$$(id -u) $(AGENT) && rm $(AGENT)
