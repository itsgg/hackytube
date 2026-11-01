export type Topic = { id: number; name: string; slug: string; count: number }

export type Video = {
  v: string // youtube id
  t: string // title
  c: string // channel
  d: number // seconds
  p: string // published, yyyy-mm
  n: number // distinct HN recommenders
  w: number // ranking weight
  y0: number // first year recommended on HN
  y1: number // last year recommended on HN
  tp: number[] // topic ids
  q: string // best pull quote
  qa: string // quote author
  qy: number // quote year
  rel: number[] // indexes of videos recommended in the same threads
  l: string // last recommended on HN, yyyy-mm-dd
  f: string // first recommended on HN, yyyy-mm-dd
  ht?: string // DeArrow's crowd-voted title, when it differs from the uploader's
}

export type Vouch = {
  by: string
  at: string // iso date
  cid: number // comment id
  sid: number // story id
  st: string // story title
  s: number // strength 1-3
  q: string // pull quote
  x: string // comment text, plain
  t: number | null // timestamp the commenter linked to
  sp: number | null // points on the HN thread
}

export type Chapter = [title: string, start: number]
export type Detail = { vouches: Vouch[]; chapters: Chapter[] }

export type Catalog = { topics: Topic[]; videos: Video[]; byId: Map<string, number>; built: string }

let catalog: Promise<Catalog> | null = null

export function loadCatalog(): Promise<Catalog> {
  catalog ??= fetch(`${import.meta.env.BASE_URL}data/catalog.json`)
    .then((r) => r.json())
    .then((raw: Omit<Catalog, 'byId'>) => ({ ...raw, byId: new Map(raw.videos.map((v, i) => [v.v, i])) }))
  return catalog
}

const shards = new Map<string, Promise<Record<string, Detail>>>()

export function shardKey(vid: string) {
  return vid.charCodeAt(0).toString(16) + vid.charCodeAt(1).toString(16)
}

export async function loadDetail(vid: string): Promise<Detail> {
  const key = shardKey(vid)
  if (!shards.has(key)) {
    shards.set(
      key,
      fetch(`${import.meta.env.BASE_URL}data/v/${key}.json`).then((r) => (r.ok ? r.json() : {})),
    )
  }
  return (await shards.get(key)!)[vid] ?? { vouches: [], chapters: [] }
}

export const loadVouches = async (vid: string) => (await loadDetail(vid)).vouches

// Frame from the middle of the video rather than the uploader's thumbnail.
export const midFrame = (vid: string) => `https://i.ytimg.com/vi/${vid}/hq2.jpg`
export const poster = (vid: string) => `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`

export function duration(s: number) {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function lengthBucket(s: number) {
  if (!s) return 'unknown'
  if (s < 600) return 'short'
  if (s < 2400) return 'medium'
  if (s < 7200) return 'long'
  return 'xlong'
}

export const channelSlug = (c: string) =>
  c
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'channel'

// YouTube plays up to 50 ids as an anonymous playlist, which opens in the app on phones and TVs.
export const youtubePlaylist = (vids: string[]) => `https://www.youtube.com/watch_videos?video_ids=${vids.slice(0, 50).join(',')}`

export const hnItem = (id: number) => `https://news.ycombinator.com/item?id=${id}`
export const hnUser = (by: string) => `https://news.ycombinator.com/user?id=${by}`
