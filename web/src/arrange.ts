import { lengthBucket, type Video } from './data'

export const SORTS = {
  rec: 'Most recommended',
  recent: 'Recently recommended',
  newest: 'Newest uploads',
  oldest: 'Oldest uploads',
  long: 'Longest',
  short: 'Shortest',
  shuffle: 'Shuffled',
} as const
export const LENGTHS = { any: 'Any length', short: 'Under 10 min', medium: '10 to 40 min', long: '40 min to 2 h', xlong: 'Over 2 h' } as const
export type Sort = keyof typeof SORTS
export type Length = keyof typeof LENGTHS

// One seed per visit: shuffle stays put while you browse, and a reload deals a new hand.
const SEED = Math.floor(Math.random() * 2 ** 31)
const shuffleKey = (i: number) => Math.imul(i ^ SEED, 2654435761) >>> 0

/** Order and filter a list of catalog indexes. Unknown durations sort last and drop out of length filters. */
export function arrange(videos: Video[], items: number[], sort: Sort, len: Length): number[] {
  const V = videos
  let out = len === 'any' ? items : items.filter((i) => lengthBucket(V[i].d) === len)
  const by = (f: (a: number, b: number) => number) => (out = [...out].sort(f))
  if (sort === 'recent') by((a, b) => V[b].l.localeCompare(V[a].l) || a - b)
  if (sort === 'newest') by((a, b) => (V[b].p || '0').localeCompare(V[a].p || '0') || a - b)
  if (sort === 'oldest') by((a, b) => (V[a].p || '9').localeCompare(V[b].p || '9') || a - b)
  if (sort === 'long') by((a, b) => V[b].d - V[a].d)
  if (sort === 'short') out = out.filter((i) => V[i].d > 0).sort((a, b) => V[a].d - V[b].d)
  if (sort === 'shuffle') by((a, b) => shuffleKey(a) - shuffleKey(b))
  return out
}
