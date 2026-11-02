"""The constellation layout, topic trends and thread playlists the build derives from the catalog."""

import math

from views import layout, threads, trends


def video(v, tp, rel=(), n=2):
    return {"v": v, "tp": list(tp), "rel": list(rel), "n": n}


def vouches(*entries):
    return {by: {"by": by, "at": at, "sid": sid, "st": st, "sp": sp} for by, at, sid, st, sp in entries}


VIDEOS = (
    [video(f"a{i}", [0]) for i in range(30)]
    + [video(f"b{i}", [1, 0]) for i in range(20)]
    + [video(f"c{i}", [2]) for i in range(10)]
)
VIDEOS.append(video("unfiled", []))


def test_layout_places_filed_videos_and_skips_unfiled():
    m = layout(VIDEOS, iterations=200)
    assert len(m["x"]) == len(VIDEOS) and (m["x"][-1], m["y"][-1]) == (-1, -1)
    assert all(0 <= c <= 10000 for c in m["x"][:-1] + m["y"][:-1])
    assert {c["id"] for c in m["clusters"]} == {0, 1, 2}


def test_layout_clusters_do_not_overlap():
    cl = layout(VIDEOS, iterations=200)["clusters"]
    for i, a in enumerate(cl):
        for b in cl[i + 1 :]:
            assert math.hypot(a["x"] - b["x"], a["y"] - b["y"]) >= a["r"] + b["r"]


def test_layout_puts_the_most_recommended_at_the_core():
    m = layout(VIDEOS, iterations=200)
    core = next(c for c in m["clusters"] if c["id"] == 0)
    dist = [math.hypot(m["x"][i] - core["x"], m["y"][i] - core["y"]) for i in range(30)]
    assert dist[0] < dist[29]  # catalog order is rank order


def test_layout_is_deterministic():
    assert layout(VIDEOS, iterations=50) == layout(VIDEOS, iterations=50)


def test_trends_count_every_recommendation_by_year_and_primary_topic():
    vids = [video("x", [3]), video("y", [], n=1)]
    vv = {
        "x": vouches(("a", "2010-01-01", 1, "t", 1), ("b", "2012-05-05", 2, "t", 1)),
        "y": vouches(("c", "2012-01-01", 3, "t", 1)),
    }
    t = trends(vids, vv)
    assert t["years"] == [2010, 2011, 2012]
    assert t["total"] == [1, 0, 2]
    assert t["series"] == {"3": [1, 0, 1]}  # the unfiled video counts toward totals only


def test_threads_become_playlists_ordered_by_size():
    vids = [video(f"v{i}", [0]) for i in range(7)]
    vv = {f"v{i}": vouches((f"u{i}", f"2015-01-0{i + 1}", 100, "Ask HN: best talks?", 300)) for i in range(7)}
    vv["v6"] = vouches(("z", "2016-01-01", 200, "Show HN: small", 5))
    out = threads(vids, vv, min_videos=5)
    assert len(out) == 1
    t = out[0]
    assert (t["sid"], t["title"], t["points"], t["people"], t["date"], t["videos"]) == (
        100,
        "Ask HN: best talks?",
        300,
        6,
        "2015-01-01",
        [0, 1, 2, 3, 4, 5],
    )
