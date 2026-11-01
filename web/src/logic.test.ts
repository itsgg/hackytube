import { describe, expect, it } from 'vitest'
import { catalog } from '../test/fixture'
import { arrange } from './arrange'
import { channelSlug, duration, lengthBucket, shardKey, youtubePlaylist } from './data'
import { defaults, forYou, isMuted, titleOf, type State } from './history'

const cat = catalog()
const all = cat.videos.map((_, i) => i)
const ids = (xs: number[]) => xs.map((i) => cat.videos[i].v[0])
const state = (over: Partial<State> = {}): State => ({ ...defaults, ...over, prefs: { ...defaults.prefs, ...over.prefs } })

describe('formatting helpers', () => {
  it('formats durations like YouTube', () => {
    expect([duration(0), duration(59), duration(245), duration(3723)]).toEqual(['', '0:59', '4:05', '1:02:03'])
  })
  it('buckets lengths, with unknown durations kept apart', () => {
    expect([0, 300, 1200, 4000, 9000].map(lengthBucket)).toEqual(['unknown', 'short', 'medium', 'long', 'xlong'])
  })
  it('computes the same shard key as the pipeline', () => {
    expect(shardKey('dQw4w9WgXcQ')).toBe('6451') // pipeline/06_build.py shard_key, see tests/test_build.py
    expect(shardKey('-_abc')).toBe('2d5f')
  })
  it('slugs channel names', () => {
    expect(channelSlug('Destroy All Software')).toBe('destroy-all-software')
    expect(channelSlug('Café Physik!')).toBe('cafe-physik')
    expect(channelSlug('東京')).toBe('channel')
  })
  it('caps a YouTube playlist at 50 videos', () => {
    const url = youtubePlaylist(Array.from({ length: 80 }, (_, i) => `v${i}`))
    expect(new URL(url).searchParams.get('video_ids')!.split(',')).toHaveLength(50)
  })
})

describe('arrange', () => {
  it('keeps catalog rank by default', () => {
    expect(ids(arrange(cat.videos, all, 'rec', 'any'))).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })
  it('sorts by most recent HN recommendation', () => {
    expect(ids(arrange(cat.videos, all, 'recent', 'any')).slice(0, 3)).toEqual(['A', 'B', 'D'])
  })
  it('sorts by upload date both ways', () => {
    expect(ids(arrange(cat.videos, all, 'newest', 'any'))[0]).toBe('E')
    expect(ids(arrange(cat.videos, all, 'oldest', 'any'))[0]).toBe('A')
  })
  it('drops unknown durations from shortest and length filters', () => {
    expect(ids(arrange(cat.videos, all, 'short', 'any'))).toEqual(['D', 'C', 'F', 'B', 'A'])
    expect(ids(arrange(cat.videos, all, 'rec', 'long'))).toEqual(['A', 'B', 'F']) // 1:40, 1:01 and 0:48
    expect(ids(arrange(cat.videos, all, 'rec', 'xlong'))).toEqual([])
    expect(ids(arrange(cat.videos, all, 'rec', 'short'))).toEqual(['D'])
  })
  it('shuffles into a stable permutation', () => {
    const a = arrange(cat.videos, all, 'shuffle', 'any')
    expect([...a].sort()).toEqual(all)
    expect(arrange(cat.videos, all, 'shuffle', 'any')).toEqual(a)
  })
})

describe('muting and titles', () => {
  it('mutes hidden videos and blocked channels', () => {
    const h = state({ hidden: { BBBBBBBBBBB: 1 }, blocked: { BBC: 1 } })
    expect(cat.videos.filter((v) => isMuted(v, h)).map((v) => v.v[0])).toEqual(['B', 'D'])
  })
  it('prefers the DeArrow title unless asked for the original', () => {
    const v = cat.videos[0]
    expect(titleOf(v, state())).toBe(v.ht)
    expect(titleOf(v, state({ prefs: { ...defaults.prefs, titles: 'original' } }))).toBe(v.t)
    expect(titleOf(cat.videos[1], state())).toBe('Simple Made Easy')
  })
})

describe('for you', () => {
  it('starts with one strong pick per topic', () => {
    expect(ids(forYou(cat, state(), 3))).toEqual(['A', 'D', 'F']) // C files under programming first, so F leads startups
  })
  it('puts videos from the same threads first, and skips what you watched or muted', () => {
    const now = 1_000_000_000_000
    const h = state({ watched: { CCCCCCCCCCC: now }, blocked: { InfoQ: 1 } })
    const picks = ids(forYou(cat, h, 6, now))
    expect(picks[0]).toBe('A') // C was co-recommended with A
    expect(picks).not.toContain('C')
    expect(picks).not.toContain('B')
  })
})
