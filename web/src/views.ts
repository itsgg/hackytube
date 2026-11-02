import type { Catalog } from './data'

const MAX_LEN = 3 * 3600 // marathons would hog a channel for hours

export type Channel = { no: number; name: string; items: number[]; total: number }

// Deterministic shuffle so every viewer gets the same lineup.
function lineup(items: number[], seed: number) {
  const key = (i: number) => Math.imul(i ^ (seed * 2654435761), 2246822519) >>> 0
  return [...items].sort((a, b) => key(a) - key(b))
}

export function channels(cat: Catalog): Channel[] {
  const ok = (i: number) => cat.videos[i].d > 60 && cat.videos[i].d <= MAX_LEN
  const make = (no: number, name: string, items: number[]) => {
    const order = lineup(items.filter(ok), no)
    return { no, name, items: order, total: order.reduce((a, i) => a + cat.videos[i].d, 0) }
  }
  const canon = make(0, 'The canon', cat.videos.slice(0, 300).map((_, i) => i))
  const topical = cat.topics.map((t, k) =>
    make(
      k + 1,
      t.name,
      cat.videos.flatMap((v, i) => (v.tp[0] === t.id ? [i] : [])),
    ),
  )
  return [canon, ...topical].filter((c) => c.items.length > 0)
}

/** What a channel is airing at a wall-clock moment: the program and how far into it. */
export function onAir(cat: Catalog, ch: Channel, nowSec: number) {
  let t = ch.total ? nowSec % ch.total : 0
  for (let k = 0; k < ch.items.length; k++) {
    const d = cat.videos[ch.items[k]].d
    if (t < d) return { slot: k, offset: Math.floor(t), left: d - Math.floor(t) }
    t -= d
  }
  return { slot: 0, offset: 0, left: cat.videos[ch.items[0]]?.d ?? 0 }
}

/** Shortest chain of co-recommendations between two videos (breadth-first over the related-video graph). */
export function shortestPath(cat: Catalog, from: number, to: number): number[] | null {
  if (from === to) return [from]
  const adj = new Map<number, Set<number>>()
  cat.videos.forEach((v, i) =>
    v.rel.forEach((j) => {
      if (!adj.has(i)) adj.set(i, new Set())
      if (!adj.has(j)) adj.set(j, new Set())
      adj.get(i)!.add(j)
      adj.get(j)!.add(i)
    }),
  )
  const prev = new Map<number, number>([[from, -1]])
  let frontier = [from]
  while (frontier.length) {
    const next: number[] = []
    for (const a of frontier)
      for (const b of adj.get(a) ?? []) {
        if (prev.has(b)) continue
        prev.set(b, a)
        if (b === to) {
          const path = [to]
          while (path[0] !== from) path.unshift(prev.get(path[0])!)
          return path
        }
        next.push(b)
      }
    frontier = next
  }
  return null
}

/** A well-known video as far from `from` as the graph allows, so the default chain is worth reading. */
export function farthest(cat: Catalog, from: number, pool = 300): number {
  let best = Math.min(1, cat.videos.length - 1)
  let bestLen = 0
  for (let j = 0; j < Math.min(pool, cat.videos.length); j += 7) {
    const p = shortestPath(cat, from, j)
    if (p && p.length > bestLen) {
      best = j
      bestLen = p.length
    }
  }
  return best
}

export type TrendData = { years: number[]; total: number[]; series: Record<string, number[]> }

export type Trend = { id: number; name: string; slug: string; share: number[]; counts: number[]; early: number; recent: number; delta: number }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/**
 * Each topic's share of all HN video recommendations per year, and how that share moved
 * between an early window and the last five complete years. Shares, not counts, so HN's growth doesn't read as interest.
 */
export function computeTrends(cat: Catalog, d: TrendData, thisYear = new Date().getFullYear()): { trends: Trend[]; full: number; partial: boolean; years: number[] } {
  // Years with too few recommendations swing wildly on a handful of comments; start where the signal is.
  const first = Math.max(0, d.total.findIndex((t) => t >= 200))
  d = { years: d.years.slice(first), total: d.total.slice(first), series: Object.fromEntries(Object.entries(d.series).map(([k, v]) => [k, v.slice(first)])) }
  const partial = d.years[d.years.length - 1] >= thisYear
  const full = partial ? d.years.length - 1 : d.years.length // index after the last complete year
  const recentIdx = d.years.map((_, k) => k).filter((k) => k < full && k >= full - 5)
  const earlyIdx = d.years.map((_, k) => k).filter((k) => k < full - 5)
  const trends = cat.topics.map((t) => {
    const counts = d.series[String(t.id)] ?? d.years.map(() => 0)
    const share = counts.map((c, k) => (d.total[k] ? c / d.total[k] : 0))
    const early = mean(earlyIdx.map((k) => share[k]))
    const recent = mean(recentIdx.map((k) => share[k]))
    return { id: t.id, name: t.name, slug: t.slug, share, counts, early, recent, delta: recent - early }
  })
  return { trends: trends.sort((a, b) => b.delta - a.delta), full, partial, years: d.years }
}

