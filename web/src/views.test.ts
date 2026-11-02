import { describe, expect, it } from 'vitest'
import { catalog } from '../test/fixture'
import { channels, computeTrends, farthest, onAir, shortestPath, type TrendData } from './views'

const cat = catalog()

describe('TV schedule', () => {
  const lineup = channels(cat)
  it('has the canon on channel 0, then one channel per topic', () => {
    expect(lineup.map((c) => [c.no, c.name])).toEqual([
      [0, 'The canon'],
      [1, 'Programming languages'],
      [2, 'Physics'],
      [3, 'Startups'],
    ])
  })
  it('only airs videos with a known, sane duration', () => {
    const physics = lineup.find((c) => c.no === 2)!
    expect(physics.items.map((i) => cat.videos[i].v[0])).toEqual(['D']) // E has no known duration
    expect(physics.total).toBe(470)
  })
  it('is the same lineup for everyone', () => {
    expect(channels(cat)).toEqual(lineup)
  })
  it('knows what is on at any moment, and loops', () => {
    const ch = lineup[1]
    const [first, second] = ch.items.map((i) => cat.videos[i].d)
    expect(onAir(cat, ch, 0)).toEqual({ slot: 0, offset: 0, left: first })
    expect(onAir(cat, ch, first + 10)).toMatchObject({ slot: 1, offset: 10, left: second - 10 })
    expect(onAir(cat, ch, ch.total + 5)).toMatchObject({ slot: 0, offset: 5 })
  })
})

describe('six degrees', () => {
  it('links videos recommended in the same threads, in either direction', () => {
    expect(shortestPath(cat, 1, 2)).toEqual([1, 0, 2]) // B and C both share a thread with A
    expect(shortestPath(cat, 0, 0)).toEqual([0])
  })
  it('reports no chain when there is none', () => {
    expect(shortestPath(cat, 0, 3)).toBeNull()
  })
  it('defaults to a far, reachable video', () => {
    expect(shortestPath(cat, 1, farthest(cat, 1))!.length).toBeGreaterThan(1)
  })
})

describe('trends', () => {
  const d: TrendData = {
    years: [2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018],
    total: [50, 400, 400, 400, 400, 400, 400, 400, 400, 400, 100],
    series: { '0': [40, 40, 40, 40, 40, 40, 200, 200, 200, 200, 50], '1': [0, 100, 100, 100, 100, 100, 20, 20, 20, 20, 5] },
  }
  const r = computeTrends(cat, d, 2018)
  it('drops sparse early years and flags the current year as partial', () => {
    expect(r.years[0]).toBe(2009)
    expect(r.partial).toBe(true)
    expect(r.full).toBe(r.years.length - 1)
  })
  it('compares shares, not counts, and sorts rising first', () => {
    const [up] = r.trends
    expect(up.name).toBe('Programming languages')
    expect(up.early).toBeCloseTo(0.1)
    expect(up.recent).toBeCloseTo((0.1 + 0.5 * 4) / 5)
    expect(r.trends[r.trends.length - 1].delta).toBeLessThan(0)
  })
})
