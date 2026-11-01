"""Tiny client for the local OpenAI-compatible proxy."""

import json
import os
import time
import urllib.request

API = os.environ.get("LLM_API", "http://localhost:8317/v1/chat/completions")


def chat(model, system, user, max_tokens=8000, retries=6):
    body = json.dumps(
        {
            "model": model,
            "temperature": 0,
            "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
    ).encode()
    err = None
    for i in range(retries):
        try:
            req = urllib.request.Request(
                API, data=body, headers={"Content-Type": "application/json", "Authorization": "Bearer local"}
            )
            return json.loads(urllib.request.urlopen(req, timeout=300).read())["choices"][0]["message"]["content"]
        except Exception as e:  # noqa: BLE001 - retry anything transient
            err = e
            time.sleep(min(60, 2**i * 2))
    raise RuntimeError(f"giving up: {err}")


def json_block(content, kind="["):
    """First JSON array (or object) in a model reply that actually parses; empty when none does."""
    dec = json.JSONDecoder()
    for i, ch in enumerate(content):
        if ch == kind:
            try:
                return dec.raw_decode(content, i)[0]
            except json.JSONDecodeError:
                continue
    return [] if kind == "[" else {}
