import type { Catalog, Detail, Topic, Video } from '../src/data'

// A small, hand-written catalog: enough to exercise ranking, topics, channels, related videos and filters.
export const topics: Topic[] = [
  { id: 0, name: 'Programming languages', slug: 'programming-languages', count: 3 },
  { id: 1, name: 'Physics', slug: 'physics', count: 2 },
  { id: 2, name: 'Startups', slug: 'startups', count: 1 },
]

const base = { p: '2015-01', y0: 2015, y1: 2015, l: '2015-06-01', f: '2015-01-01', q: '', qa: '', qy: 0, rel: [] as number[] }

export const videos: Video[] = [
  { ...base, v: 'AAAAAAAAAAA', t: 'The Mother of All Demos', c: 'SRI', d: 6000, n: 40, w: 50, y0: 2008, y1: 2025, l: '2025-02-01', f: '2008-03-01', p: '2008-12', tp: [0], q: 'the most important computing demo ever given', qa: 'alan', qy: 2012, rel: [1, 2], ht: 'Engelbart demos the mouse, hypertext and video calls in 1968' },
  { ...base, v: 'BBBBBBBBBBB', t: 'Simple Made Easy', c: 'InfoQ', d: 3700, n: 30, w: 35, y0: 2011, y1: 2024, l: '2024-01-01', p: '2011-10', tp: [0], q: 'changed how I think about software design', qa: 'rich', qy: 2013, rel: [0] },
  { ...base, v: 'CCCCCCCCCCC', t: 'The Birth & Death of JavaScript', c: 'Destroy All Software', d: 1750, n: 20, w: 22, tp: [0, 2], q: 'hilarious and prescient', qa: 'gary', qy: 2014, rel: [0] },
  { ...base, v: 'DDDDDDDDDDD', t: 'Feynman on magnets', c: 'BBC', d: 470, n: 12, w: 13, l: '2023-05-05', p: '2009-04', tp: [1], q: 'he refuses to give a fake answer', qa: 'rf', qy: 2016 },
  { ...base, v: 'EEEEEEEEEEE', t: 'Veritasium: the bike paradox', c: 'Veritasium', d: 0, n: 8, w: 9, p: '2022-02', tp: [1], q: '', qa: '', qy: 0 },
  { ...base, v: 'FFFFFFFFFFF', t: 'How to Start a Startup', c: 'Y Combinator', d: 2900, n: 5, w: 6, l: '2016-01-01', p: '2014-09', tp: [2] },
]

export const details: Record<string, Detail> = {
  AAAAAAAAAAA: {
    chapters: [
      ['Introduction', 0],
      ['The mouse', 420],
      ['Collaboration', 3000],
    ],
    vouches: [
      { by: 'alan', at: '2012-01-02T10:00:00', cid: 101, sid: 900, st: 'Ask HN: best talks?', s: 3, q: 'the most important computing demo ever given', x: 'Honestly the most important computing demo ever given. See https://example.org/notes for context.', t: 420, sp: 512 },
      { by: 'grace', at: '2019-07-08T10:00:00', cid: 102, sid: 901, st: 'Engelbart dies', s: 2, q: '', x: 'Still worth watching all of it.', t: null, sp: 88 },
    ],
  },
}

export function catalog(): Catalog {
  return { topics, videos, built: '2026-11-01', byId: new Map(videos.map((v, i) => [v.v, i])) }
}

// Derived views, small and hand-written to match the fixture catalog.
export const map = {
  x: [5000, 5300, 5600, 2000, 2300, 8000],
  y: [5000, 5200, 4800, 2000, 2400, 8000],
  clusters: [
    { id: 0, x: 5300, y: 5000, r: 600, n: 3 },
    { id: 1, x: 2150, y: 2200, r: 400, n: 2 },
    { id: 2, x: 8000, y: 8000, r: 300, n: 1 },
  ],
}

export const trends = {
  years: [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022],
  total: [400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400],
  series: { '0': [40, 40, 40, 40, 40, 200, 200, 200, 200, 200, 200], '1': [100, 100, 100, 100, 100, 20, 20, 20, 20, 20, 20], '2': [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10] },
}

export const threads = [{ sid: 900, title: 'Ask HN: best talks?', points: 512, date: '2012-01-02', people: 3, videos: [0, 1, 2] }]
