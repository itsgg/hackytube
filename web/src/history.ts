import { useSyncExternalStore } from 'react'
import type { Catalog, Video } from './data'

// Everything personal lives in this browser only: no accounts, nothing sent anywhere.
export type Prefs = {
  theme: 'system' | 'light' | 'dark'
  thumbs: 'middle' | 'original'
  titles: 'dearrow' | 'original'
}
export type State = {
  watched: Record<string, number>
  saved: Record<string, number>
  hidden: Record<string, number>
  blocked: Record<string, number> // channel names
  prefs: Prefs
}

const KEY = 'hackytube.v1'
export const defaults: State = {
  watched: {},
  saved: {},
  hidden: {},
  blocked: {},
  prefs: { theme: 'system', thumbs: 'middle', titles: 'dearrow' },
}

function read(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { ...defaults, ...raw, prefs: { ...defaults.prefs, ...raw.prefs } }
  } catch {
    return defaults
  }
}

let state = read()
const listeners = new Set<() => void>()

function write(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // private window or storage disabled: keep the in-memory copy
  }
  listeners.forEach((l) => l())
}

export function useHistory() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
}

const toggle = (m: Record<string, number>, k: string) => {
  const next = { ...m }
  if (next[k]) delete next[k]
  else next[k] = Date.now()
  return next
}

export const markWatched = (vid: string) => write({ ...state, watched: { ...state.watched, [vid]: Date.now() } })
export const toggleSaved = (vid: string) => write({ ...state, saved: toggle(state.saved, vid) })
export const toggleHidden = (vid: string) => write({ ...state, hidden: toggle(state.hidden, vid) })
export const toggleBlocked = (channel: string) => write({ ...state, blocked: toggle(state.blocked, channel) })
export const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => write({ ...state, prefs: { ...state.prefs, [k]: v } })
export const forget = () => write({ ...defaults, prefs: state.prefs, blocked: state.blocked })

/** Videos the viewer chose not to see: hidden one by one, or from a blocked channel. */
export const isMuted = (v: Video, h: State) => !!(h.hidden[v.v] || h.blocked[v.c])

export const titleOf = (v: Video, h: State) => (h.prefs.titles === 'dearrow' && v.ht) || v.t

/**
 * For-you ranking from local history. Signals, strongest first:
 * co-recommended in the same HN threads as something you watched or saved,
 * topic affinity (recent views count more), and how widely HN vouched for it.
 */
export function forYou(cat: Catalog, h: State, limit = 24, now = Date.now()): number[] {
  const seeds = [
    ...Object.entries(h.watched).map(([v, at]) => ({ v, at, k: 1 })),
    ...Object.entries(h.saved).map(([v, at]) => ({ v, at, k: 2 })),
  ]
  const topic = new Map<number, number>()
  const near = new Map<number, number>()
  for (const s of seeds) {
    const i = cat.byId.get(s.v)
    if (i === undefined) continue
    const decay = s.k * Math.exp(-(now - s.at) / (14 * 864e5))
    for (const t of cat.videos[i].tp) topic.set(t, (topic.get(t) ?? 0) + decay)
    cat.videos[i].rel.forEach((r, rank) => near.set(r, (near.get(r) ?? 0) + decay * (1 - rank / 20)))
  }
  const skip = (v: Video) => !!h.watched[v.v] || isMuted(v, h)

  if (!seeds.length) {
    // Cold start: round-robin the strongest video of each topic so the first screen is varied.
    const out: number[] = []
    const used = new Set<number>()
    for (let round = 0; out.length < limit && round < 6; round++) {
      for (const t of cat.topics) {
        const i = cat.videos.findIndex((v, idx) => v.tp[0] === t.id && !used.has(idx) && !skip(v))
        if (i >= 0) {
          used.add(i)
          out.push(i)
        }
        if (out.length >= limit) break
      }
    }
    // Before topics exist, fall back to the ranking itself.
    for (let i = 0; out.length < limit && i < cat.videos.length; i++) if (!used.has(i) && !skip(cat.videos[i])) out.push(i)
    return out
  }

  const total = [...topic.values()].reduce((a, b) => a + b, 0) || 1
  return cat.videos
    .map((v, i): [number, number] => {
      if (skip(v)) return [i, -1]
      const aff = v.tp.reduce((a, t) => a + (topic.get(t) ?? 0), 0) / total
      return [i, 3 * (near.get(i) ?? 0) + 2 * aff + 0.15 * Math.log1p(v.w)]
    })
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([i]) => i)
}
