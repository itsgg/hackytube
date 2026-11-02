import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Tile } from './components'
import { hnItem, loadVouches, midFrame, type Catalog } from './data'
import { titleOf, useHistory } from './history'
import { farthest, shortestPath } from './views'

type Link = { sid: number; st: string; sp: number | null; a: string; b: string } | null

/** The HN thread where both videos were recommended: the evidence for each hop. */
async function sharedThread(a: string, b: string): Promise<Link> {
  const [va, vb] = await Promise.all([loadVouches(a), loadVouches(b)])
  const bySid = new Map(vb.map((x) => [x.sid, x]))
  const hit = va.map((x) => [x, bySid.get(x.sid)] as const).find(([, y]) => y)
  return hit ? { sid: hit[0].sid, st: hit[0].st, sp: hit[0].sp, a: hit[0].by, b: hit[1]!.by } : null
}

function Picker({ cat, label, value, onPick }: { cat: Catalog; label: string; value: number; onPick: (i: number) => void }) {
  const h = useHistory()
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    return cat.videos.flatMap((v, i) => ((v.t + ' ' + (v.ht ?? '') + ' ' + v.c).toLowerCase().includes(s) ? [i] : [])).slice(0, 8)
  }, [q, cat])
  const v = cat.videos[value]
  return (
    <div className="picker">
      <span className="picker-label">{label}</span>
      <div className="picker-cur">
        <img src={midFrame(v.v)} alt="" />
        <span>{titleOf(v, h)}</span>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for another video" aria-label={`${label}: search`} />
      {hits.length > 0 && (
        <ul className="picker-hits">
          {hits.map((i) => (
            <li key={i}>
              <button
                onClick={() => {
                  onPick(i)
                  setQ('')
                }}
              >
                {titleOf(cat.videos[i], h)} <span>{cat.videos[i].c}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Path({ cat }: { cat: Catalog }) {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const pick = (key: string, fallback: number) => cat.byId.get(params.get(key) ?? '') ?? fallback
  const from = pick('from', 0)
  const to = pick('to', farthest(cat, from))
  const path = useMemo(() => shortestPath(cat, from, to), [cat, from, to])
  const [links, setLinks] = useState<Link[]>([])

  useEffect(() => {
    setLinks([])
    if (!path) return
    Promise.all(path.slice(1).map((j, k) => sharedThread(cat.videos[path[k]].v, cat.videos[j].v))).then(setLinks)
  }, [path, cat])

  const set = (key: 'from' | 'to', i: number) => {
    const next = new URLSearchParams(params)
    next.set(key, cat.videos[i].v)
    setParams(next, { replace: true })
  }
  const shuffle = () => {
    const r = () => Math.floor(Math.random() * Math.min(1500, cat.videos.length))
    nav(`/path?from=${cat.videos[r()].v}&to=${cat.videos[r()].v}`, { replace: true })
  }

  return (
    <main className="browse path">
      <header className="browse-head">
        <h1>Six degrees of Hacker News</h1>
        <button className="pill" onClick={shuffle}>
          Try a random pair
        </button>
      </header>
      <p className="trend-note">
        Two videos are linked when HN recommended them in the same thread. Pick any two and see the shortest chain of threads between them.
      </p>
      <div className="pickers">
        <Picker cat={cat} label="From" value={from} onPick={(i) => set('from', i)} />
        <Picker cat={cat} label="To" value={to} onPick={(i) => set('to', i)} />
      </div>

      {!path ? (
        <p className="empty-note">No chain of shared threads connects these two yet. Try another pair.</p>
      ) : (
        <>
          <p className="degrees">
            {path.length - 1 === 0 ? 'Same video.' : `${path.length - 1} ${path.length === 2 ? 'degree' : 'degrees'} apart`}
          </p>
          <ol className="chain">
            {path.map((i, k) => (
              <li key={i}>
                <Tile v={cat.videos[i]} cat={cat} wide />
                {k < path.length - 1 && (
                  <div className="hop">
                    {links[k] ? (
                      <>
                        both recommended in{' '}
                        <a href={hnItem(links[k]!.sid)}>
                          {links[k]!.st ? `“${links[k]!.st}”` : 'an HN thread'}
                          {links[k]!.sp ? `, ${links[k]!.sp} points` : ''}
                        </a>
                        <span className="hop-by">
                          by {links[k]!.a}
                          {links[k]!.b !== links[k]!.a ? ` and ${links[k]!.b}` : ''}
                        </span>
                      </>
                    ) : (
                      'recommended in the same thread'
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  )
}
