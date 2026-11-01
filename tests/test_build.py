"""Catalog assembly: which videos get in, how they rank, related videos, and the RSS feed."""

import json
import xml.etree.ElementTree as ET

import pytest


@pytest.fixture(scope="module")
def build(step):
    return step("06_build")


def vouch(by, s=2, at="2015-06-01T10:00:00", sid=1, q="", pts=None):
    e = {
        "by": by,
        "at": at,
        "cid": hash((by, at)) % 10**6,
        "sid": sid,
        "st": "Thread",
        "sp": 10,
        "s": s,
        "q": q,
        "x": q,
        "t": None,
    }
    if pts is not None:
        e["pts"] = pts
    return e


META = {"title": "A talk", "channel": "Chan", "seconds": 600, "published": "2012-03-04T00:00:00Z"}


def test_load_meta_keeps_latest_settled_playable_record(build):
    lines = [
        json.dumps({"vid": "a", "status": "OK", "title": "old"}),
        json.dumps({"vid": "a", "status": "FETCHFAIL"}),  # transient failures never replace a good record
        json.dumps({"vid": "a", "status": "OK", "title": "new"}),
        json.dumps({"vid": "b", "status": "OK", "title": "T", "embeddable": False}),
        json.dumps({"vid": "c", "status": "GONE"}),
        json.dumps({"vid": "d", "status": "OK", "title": "T", "live": True}),
    ]
    assert {k: v["title"] for k, v in build.load_meta(lines).items()} == {"a": "new"}


def test_one_person_counts_once_with_their_strongest_comment(build):
    people = {}
    build.add_vouch(people, vouch("pg", s=2, q="nice"))
    build.add_vouch(people, vouch("pg", s=3, q="the best talk on this"))
    build.add_vouch(people, vouch("pg", s=2, q="nice again"))
    assert list(people) == ["pg"] and people["pg"]["s"] == 3


@pytest.mark.parametrize(
    ("es", "included"),
    [
        ([vouch("a")], False),  # one ordinary pointer is not enough
        ([vouch("a"), vouch("b")], True),  # two people
        ([vouch("a", s=3)], True),  # one emphatic must-watch
        ([vouch("a", pts=150)], True),  # a submission HN upvoted to 100+
        ([vouch("a", pts=40)], False),
    ],
)
def test_inclusion_bar(build, es, included):
    assert (build.summarize("vid", es, META) is not None) is included


def test_summary_fields(build):
    es = [
        vouch("a", at="2011-01-01T00:00:00", q="short"),
        vouch("b", s=3, at="2020-05-02T00:00:00", q="the clearest explanation of this I know"),
    ]
    row = build.summarize("vid", es, META)
    assert (row["n"], row["y0"], row["y1"], row["f"], row["l"], row["p"]) == (
        2,
        2011,
        2020,
        "2011-01-01",
        "2020-05-02",
        "2012-03",
    )
    assert (row["q"], row["qa"], row["qy"]) == ("the clearest explanation of this I know", "b", 2020)


def test_enduring_and_emphatic_videos_rank_higher(build):
    flash = build.summarize("x", [vouch("a"), vouch("b")], META)
    lasting = build.summarize("y", [vouch("a", at="2010-01-01T00:00:00"), vouch("b", at="2020-01-01T00:00:00")], META)
    loud = build.summarize("z", [vouch("a", s=3), vouch("b", s=3)], META)
    assert lasting["w"] > flash["w"] and loud["w"] > flash["w"]


def test_related_comes_from_shared_threads(build):
    videos = [{"v": v} for v in "abcd"]
    vouches = {
        "a": {"u1": vouch("u1", sid=1), "u2": vouch("u2", sid=2)},
        "b": {"u3": vouch("u3", sid=1), "u4": vouch("u4", sid=2)},  # shares two threads with a
        "c": {"u5": vouch("u5", sid=2)},  # shares one with a and b
        "d": {"u6": vouch("u6", sid=9)},  # shares none
    }
    rel = build.related(videos, vouches)
    assert rel[0] == [1, 2] and rel[3] == []


def test_big_threads_count_for_less(build):
    videos = [{"v": v} for v in ["a", "b"] + [f"m{i}" for i in range(10)]]
    vouches = {"a": {"x": vouch("x", sid=1), "y": vouch("y", sid=99)}, "b": {"z": vouch("z", sid=1)}}
    vouches |= {f"m{i}": {f"p{i}": vouch(f"p{i}", sid=99)} for i in range(10)}  # a megathread with 11 videos
    assert build.related(videos, vouches)[0][0] == 1  # the small shared thread beats the megathread


def test_shard_key_matches_the_web_client(build):
    # web/src/data.ts: vid.charCodeAt(0).toString(16) + vid.charCodeAt(1).toString(16)
    assert build.shard_key("dQw4w9WgXcQ") == "6451" and build.shard_key("-_abc") == "2d5f"


def test_feed_is_valid_rss_newest_first(build):
    rows = [
        {**build.summarize("old", [vouch("a"), vouch("b")], META), "f": "2010-01-01"},
        {
            **build.summarize(
                "new", [vouch("a"), vouch("b", q="worth every minute & more <3")], {**META, "title": "Tom & Jerry <live>"}
            ),
            "f": "2025-01-01",
        },
    ]
    rss = ET.fromstring(build.feed(rows, "https://example.org"))
    items = rss.findall("./channel/item")
    assert [i.findtext("title") for i in items] == ["Tom & Jerry <live>", "A talk"]
    assert items[0].findtext("link") == "https://example.org/watch/new"
    assert "2 people on HN recommended this" in items[0].findtext("description")
