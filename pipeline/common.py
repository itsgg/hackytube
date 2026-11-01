"""Helpers shared by the pipeline steps."""

import html
import re

TAG = re.compile(r"<[^>]+>")
STAMP = re.compile(r"^\s*[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*[-–:|]?\s*(.+?)\s*$")


def clean(text: str | None) -> str:
    """HN comment HTML to plain text: paragraphs become blank lines, tags go, entities decode."""
    text = (text or "").replace("<p>", "\n\n")
    return html.unescape(TAG.sub("", text)).strip()


def seconds(stamp: str) -> int:
    """'1:02:03' -> 3723."""
    n = 0
    for part in stamp.split(":"):
        n = n * 60 + int(part)
    return n


def chapters_from(description: str) -> list:
    """YouTube's rule: chapters exist when the description lists 3+ ascending timestamps starting at 0:00."""
    out = []
    for line in (description or "").splitlines():
        m = STAMP.match(line)
        if m:
            t = seconds(m.group(1))
            if not out or t > out[-1][1]:
                out.append([m.group(2), t])
    return out if len(out) >= 3 and out[0][1] == 0 else []
