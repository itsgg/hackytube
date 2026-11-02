"""Derived views the site draws: the constellation layout and topic trends over time."""

import math
from collections import defaultdict

GOLDEN = math.pi * (3 - math.sqrt(5))  # golden angle: spirals that pack evenly, like sunflower seeds
SPACING = 1.0  # distance unit between neighbouring stars in a cluster
GAP = 6.0  # empty space kept between clusters


def _members(videos: list) -> dict:
    groups = defaultdict(list)  # primary topic -> catalog indexes, already in rank order
    for i, v in enumerate(videos):
        if v["tp"]:  # unfiled videos stay off the map until they have a shelf
            groups[v["tp"][0]].append(i)
    return groups


def _affinity(videos: list, groups: dict) -> dict:
    """How strongly two topics belong together: shared videos plus co-recommendations across them."""
    primary = {i: t for t, ms in groups.items() for i in ms}
    aff = defaultdict(float)
    for i, v in enumerate(videos):
        a = primary.get(i)
        if a is None:
            continue
        for b in v["tp"][1:]:
            aff[frozenset((a, b))] += 1
        for j in v["rel"][:5]:
            b = primary.get(j)
            if b is not None and b != a:
                aff[frozenset((a, b))] += 0.5
    return aff


def layout(videos: list, iterations: int = 400, scale: int = 10000) -> dict:
    """Place every filed video as a star: clusters per primary topic, brightest (most recommended) at each core.

    Returns integer coordinates in [0, scale] aligned with the catalog order (-1 for unfiled videos),
    plus each cluster's centre and radius.
    """
    groups = _members(videos)
    topics = sorted(groups)
    radius = {t: SPACING * math.sqrt(len(groups[t]) + 1) for t in topics}
    aff = _affinity(videos, groups)
    top = max(aff.values(), default=1)

    # Start on a circle in topic order, then let related topics drift together without overlapping.
    ring = sum(radius.values()) / math.pi
    pos = {
        t: [ring * math.cos(2 * math.pi * k / len(topics)), ring * math.sin(2 * math.pi * k / len(topics))]
        for k, t in enumerate(topics)
    }
    for step in range(iterations):
        cool = 1 - step / iterations
        move = {t: [0.0, 0.0] for t in topics}
        for ai, a in enumerate(topics):
            for b in topics[ai + 1 :]:
                dx, dy = pos[b][0] - pos[a][0], pos[b][1] - pos[a][1]
                d = math.hypot(dx, dy) or 1e-6
                want = radius[a] + radius[b] + GAP
                pull = 0.02 * aff.get(frozenset((a, b)), 0) / top * (d - want) if d > want else 0
                push = 0.5 * (want - d) if d < want else 0
                f = (pull - push) / d
                move[a][0] += f * dx
                move[a][1] += f * dy
                move[b][0] -= f * dx
                move[b][1] -= f * dy
        for t in topics:  # gentle gravity keeps the whole map compact
            move[t][0] -= 0.002 * pos[t][0]
            move[t][1] -= 0.002 * pos[t][1]
            pos[t][0] += move[t][0] * cool
            pos[t][1] += move[t][1] * cool

    xy = [None] * len(videos)
    for t in topics:
        cx, cy = pos[t]
        for k, i in enumerate(groups[t]):
            r = SPACING * math.sqrt(k + 0.5)
            x, y = cx + r * math.cos(k * GOLDEN), cy + r * math.sin(k * GOLDEN)
            if len(videos[i]["tp"]) > 1 and videos[i]["tp"][1] in pos:  # lean toward a second shelf
                sx, sy = pos[videos[i]["tp"][1]]
                x, y = x + 0.08 * (sx - x), y + 0.08 * (sy - y)
            xy[i] = (x, y)

    placed = [p for p in xy if p is not None]
    xs, ys = [p[0] for p in placed] or [0], [p[1] for p in placed] or [0]
    lo_x, lo_y = min(xs) - GAP, min(ys) - GAP
    span = max(max(xs) - lo_x, max(ys) - lo_y) + GAP or 1
    q = lambda v, lo: round((v - lo) / span * scale)
    return {
        "x": [q(p[0], lo_x) if p else -1 for p in xy],
        "y": [q(p[1], lo_y) if p else -1 for p in xy],
        "clusters": [
            {"id": t, "x": q(pos[t][0], lo_x), "y": q(pos[t][1], lo_y), "r": round(radius[t] / span * scale), "n": len(groups[t])}
            for t in topics
        ],
    }


def trends(videos: list, vouch: dict) -> dict:
    """Recommendations per year for each primary topic, from the date of every recommending comment."""
    years = sorted({int(e["at"][:4]) for v in videos for e in vouch[v["v"]].values()})
    if not years:
        return {"years": [], "total": [], "series": {}}
    span = list(range(years[0], years[-1] + 1))
    at = {y: k for k, y in enumerate(span)}
    total = [0] * len(span)
    series = defaultdict(lambda: [0] * len(span))
    for v in videos:
        t = v["tp"][0] if v["tp"] else None
        for e in vouch[v["v"]].values():
            k = at[int(e["at"][:4])]
            total[k] += 1
            if t is not None:
                series[t][k] += 1
    return {"years": span, "total": total, "series": {str(t): s for t, s in sorted(series.items())}}


def threads(videos: list, vouch: dict, min_videos: int = 5, limit: int = 300) -> list:
    """HN threads that turned into playlists: every thread where several catalog videos were recommended."""
    index = {v["v"]: i for i, v in enumerate(videos)}
    by = defaultdict(lambda: {"videos": set(), "people": set(), "title": "", "points": None, "first": "9999"})
    for v in videos:
        for e in vouch[v["v"]].values():
            t = by[e["sid"]]
            t["videos"].add(index[v["v"]])
            t["people"].add(e["by"])
            t["title"] = t["title"] or e["st"]
            t["points"] = t["points"] or e.get("sp")
            t["first"] = min(t["first"], e["at"][:10])
    out = [
        {
            "sid": sid,
            "title": t["title"],
            "points": t["points"],
            "date": t["first"],
            "people": len(t["people"]),
            "videos": sorted(t["videos"]),
        }
        for sid, t in by.items()
        if len(t["videos"]) >= min_videos and t["title"]
    ]
    return sorted(out, key=lambda t: (-len(t["videos"]), -t["people"], t["sid"]))[:limit]
