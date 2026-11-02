"""Turning HN comment HTML into video ids, timestamps, plain text and chapters."""

import pytest
from common import chapters_from, clean, seconds


@pytest.fixture(scope="module")
def cand(step):
    return step("02_candidates")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ('<a href="https:&#x2F;&#x2F;www.youtube.com&#x2F;watch?v=dQw4w9WgXcQ">x</a>', [("dQw4w9WgXcQ", None)]),
        ("https://youtu.be/dQw4w9WgXcQ", [("dQw4w9WgXcQ", None)]),
        ("https://www.youtube.com/embed/dQw4w9WgXcQ", [("dQw4w9WgXcQ", None)]),
        ("https://www.youtube.com/shorts/dQw4w9WgXcQ", [("dQw4w9WgXcQ", None)]),
        ("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", [("dQw4w9WgXcQ", None)]),
        ("https://m.youtube.com/watch?feature=share&amp;v=dQw4w9WgXcQ", [("dQw4w9WgXcQ", None)]),
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s", [("dQw4w9WgXcQ", 3723)]),
        ("https://youtu.be/dQw4w9WgXcQ?t=90", [("dQw4w9WgXcQ", 90)]),
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=4m", [("dQw4w9WgXcQ", 240)]),
        ("https://www.youtube.com/embed/dQw4w9WgXcQ?start=75", [("dQw4w9WgXcQ", 75)]),
    ],
)
def test_finds_video_ids_and_timestamps(cand, text, expected):
    assert cand.videos_in(text) == expected


def test_dedupes_and_keeps_order(cand):
    text = "https://youtu.be/AAAAAAAAAAA and https://youtu.be/BBBBBBBBBBB then https://youtu.be/AAAAAAAAAAA?t=5"
    assert [v for v, _ in cand.videos_in(text)] == ["AAAAAAAAAAA", "BBBBBBBBBBB"]


def test_ignores_non_video_youtube_links(cand):
    assert cand.videos_in("https://www.youtube.com/playlist?list=PL123 https://www.youtube.com/@3blue1brown") == []


def test_reads_url_and_text_fields_together(cand):
    assert [v for v, _ in cand.videos_in("https://youtu.be/AAAAAAAAAAA", None, "see youtu.be/BBBBBBBBBBB")] == [
        "AAAAAAAAAAA",
        "BBBBBBBBBBB",
    ]


def test_clean_turns_comment_html_into_text():
    html = 'First &amp; best.<p>Watch <a href="x">this</a> &#x2F; now<p><i>really</i>'
    assert clean(html) == "First & best.\n\nWatch this / now\n\nreally"
    assert clean(None) == ""


@pytest.mark.parametrize(("stamp", "n"), [("0:00", 0), ("4:05", 245), ("1:02:03", 3723)])
def test_seconds(stamp, n):
    assert seconds(stamp) == n


def test_chapters_follow_youtube_rules():
    desc = "Great talk.\n0:00 Intro\n2:15 - The problem\n(10:00) Results\n1:02:03 Q&A\nthanks"
    assert chapters_from(desc) == [["Intro", 0], ["The problem", 135], ["Results", 600], ["Q&A", 3723]]


@pytest.mark.parametrize(
    "desc",
    [
        "1:00 Intro\n2:00 Middle\n3:00 End",  # must start at 0:00
        "0:00 Intro\n2:00 End",  # needs at least three
        "",
    ],
)
def test_no_chapters_when_rules_fail(desc):
    assert chapters_from(desc) == []


def test_chapters_skip_out_of_order_stamps():
    assert chapters_from("0:00 A\n5:00 B\n3:00 back-reference\n9:00 C") == [["A", 0], ["B", 300], ["C", 540]]


def test_comments_walk_up_to_their_story_not_past_it(cand):
    import duckdb

    c = duckdb.connect()
    # story 10 (parent 0, as in the dump) <- comment 11 <- comment 12; story 20 with a null parent <- comment 21
    c.execute("create table idx as select * from (values (10, 0), (11, 10), (12, 11), (20, null), (21, 20)) t(id, parent)")
    c.execute("create table cand as select * from (values (12, 2), (21, 2), (10, 1)) t(id, type)")
    cand.find_roots(c)
    assert dict(c.execute("select start, root from roots").fetchall()) == {12: 10, 21: 20}
