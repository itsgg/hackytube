"""YouTube metadata, DeArrow titles and LLM replies, with the network stubbed out."""

import json

import pytest
from llm import json_block


@pytest.fixture(scope="module")
def meta(step):
    return step("04_meta")


@pytest.mark.parametrize(
    ("iso", "n"), [("PT4M13S", 253), ("PT1H2M", 3720), ("P1DT1S", 86401), ("PT0S", 0), ("", 0), ("bogus", 0)]
)
def test_iso_duration(meta, iso, n):
    assert meta.iso_duration(iso) == n


def api_item(**over):
    item = {
        "id": "dQw4w9WgXcQ",
        "snippet": {
            "title": "T",
            "channelTitle": "C",
            "channelId": "UC1",
            "publishedAt": "2009-10-25T06:57:33Z",
            "description": "0:00 a\n1:00 b\n2:00 c",
            "liveBroadcastContent": "none",
        },
        "contentDetails": {"duration": "PT3M33S"},
        "status": {"privacyStatus": "public", "embeddable": True},
    }
    for k, v in over.items():
        item[k] = {**item[k], **v}
    return item


def test_api_record(meta):
    r = meta.from_api(api_item())
    assert (r["status"], r["embeddable"], r["seconds"], r["channel"]) == ("OK", True, 213, "C")
    assert r["chapters"] == [["a", 0], ["b", 60], ["c", 120]]


def test_api_age_restricted_is_not_embeddable(meta):
    assert meta.from_api(api_item(contentDetails={"contentRating": {"ytRating": "ytAgeRestricted"}}))["embeddable"] is False


def test_api_private_video(meta):
    assert meta.from_api(api_item(status={"privacyStatus": "private"}))["status"] == "PRIVATE"


@pytest.mark.parametrize(
    ("status", "body", "expected"),
    [
        (200, json.dumps({"title": "T", "author_name": "C"}).encode(), {"status": "OK", "embeddable": True, "title": "T"}),
        (401, b"", {"status": "OK", "embeddable": False}),
        (404, b"", {"status": "GONE"}),
        (400, b"", {"status": "GONE"}),
    ],
)
def test_oembed_outcomes(meta, monkeypatch, status, body, expected):
    monkeypatch.setattr(meta, "get", lambda url: (status, body))
    r = meta.fetch_oembed("dQw4w9WgXcQ")
    assert {k: r[k] for k in expected} == expected


def test_oembed_network_failure_is_retried_later(meta, monkeypatch):
    def boom(url):
        raise RuntimeError("down")

    monkeypatch.setattr(meta, "get", boom)
    r = meta.fetch_oembed("dQw4w9WgXcQ")
    assert r["status"] == "FETCHFAIL" and not meta.final(r)


@pytest.mark.parametrize(
    ("branding", "title"),
    [
        ({"titles": [{"title": "Honest", "original": False, "votes": 2, "locked": False}]}, "Honest"),
        ({"titles": [{"title": ">lowercase kept", "original": False, "votes": 0, "locked": True}]}, "lowercase kept"),
        ({"titles": [{"title": "Unvoted", "original": False, "votes": 0, "locked": False}]}, None),
        ({"titles": [{"title": "Orig", "original": True, "votes": 9, "locked": True}]}, None),
        ({"titles": []}, None),
    ],
)
def test_dearrow_display_rule(step, branding, title):
    assert step("07_dearrow").pick_title(branding) == title


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        ('[{"k": "1:a", "s": 2}]', [{"k": "1:a", "s": 2}]),
        ('Sure! Here you go:\n```json\n[{"k": "1:a", "s": 3}]\n```', [{"k": "1:a", "s": 3}]),
        ('Topics [see below]:\n[{"name": "x"}]', [{"name": "x"}]),
        ("[1, 2", []),
        ("no json here", []),
    ],
)
def test_json_block_finds_the_first_parseable_array(reply, expected):
    assert json_block(reply) == expected


def test_label_maps_replies_back_to_pairs(step, monkeypatch):
    label = step("03_label")
    reply = json.dumps([{"k": "2:BBBBBBBBBBB", "s": 3, "quote": "must watch"}, {"k": "9:ZZZZZZZZZZZ", "s": 1}])
    monkeypatch.setattr(label, "chat", lambda *a, **k: reply)
    batch = [
        {"id": 1, "vid": "AAAAAAAAAAA", "text": "meh", "story_title": ""},
        {"id": 2, "vid": "BBBBBBBBBBB", "text": "<i>must watch</i>", "story_title": "Ask HN"},
    ]
    # Pairs the model skipped are left out (and retried next run); keys it invented are ignored.
    assert label.label(batch) == [{"k": "2:BBBBBBBBBBB", "s": 3, "quote": "must watch"}]
