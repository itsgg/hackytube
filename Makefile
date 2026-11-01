# Each step is resumable: rerun any target and it picks up where it stopped.
PY := uv run python pipeline

.PHONY: data extract candidates label meta topics build watch dev site lint

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
	uvx ruff check pipeline && cd web && npm run lint && npm run typecheck
