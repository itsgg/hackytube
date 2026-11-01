import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Shelf, Tile, Vouches } from './components'
import { duration, loadVouches, midFrame, poster, type Catalog, type Vouch } from './data'
import { forYou, isMuted, titleOf, useHistory } from './history'

function Words({ text }: { text: string }) {
  // Word-by-word reveal; the stagger lives in CSS so reduced motion turns it off.
  return (
    <>
      {text.split(/(\s+)/).map((w, k) =>
        /\s/.test(w) ? w : (
          <span key={k} className="w" style={{ animationDelay: `${Math.min(k, 40) * 18}ms` }}>
            {w}
          </span>
        ),
      )}
    </>
  )
}

function Hero({ cat }: { cat: Catalog }) {
  const h = useHistory()
  // Pick from the ten most recommended you haven't muted, varying by day so the front page isn't static.
  const pool = cat.videos.slice(0, 30).filter((x) => x.q && !isMuted(x, h)).slice(0, 10)
  const v = pool[Math.floor(Date.now() / 864e5) % Math.max(1, pool.length)] ?? cat.videos[0]
  const [everyone, setEveryone] = useState<Vouch[]>([])
  const [i, setI] = useState(0)
  useEffect(() => {
    loadVouches(v.v).then(setEveryone)
  }, [v.v])
  const quotes = useMemo(() => everyone.filter((x) => x.q && x.q.length > 24 && x.s >= 2), [everyone])
  useEffect(() => {
    if (quotes.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setI((n) => (n + 1) % Math.min(quotes.length, 12)), 8000)
    return () => clearInterval(id)
  }, [quotes.length])
  const cur = quotes[i] ?? { q: v.q, by: v.qa, at: String(v.qy) }

  return (
    <section className="hero">
      {/* Every person who recommended this video, as the texture behind what one of them said. */}
      <div className="chorus" aria-hidden style={{ fontSize: `${Math.max(13, Math.min(40, Math.sqrt(52000 / Math.max(1, everyone.length))))}px` }}>
        {everyone.map((x) => (
          <span key={x.cid} className={x.by === cur.by ? 'on' : x.s === 3 ? 'loud' : undefined}>
            {x.by}
          </span>
        ))}
      </div>
      <div className="hero-quote">
        <blockquote key={cur.by + i} className={cur.q.length > 90 ? 'hero-q long' : 'hero-q'}>
          <p>
            <Words text={cur.q} />
          </p>
          <footer>
            <span className="by">{cur.by}</span> in {cur.at.slice(0, 4)}, one of {v.n} people on HN who recommended this
          </footer>
        </blockquote>
        {quotes.length > 1 && (
          <div className="hero-dots" role="tablist" aria-label="More recommendations for this video">
            {quotes.slice(0, 12).map((x, k) => (
              <button key={x.cid} role="tab" aria-selected={k === i} aria-label={`Quote by ${x.by}`} onClick={() => setI(k)} />
            ))}
          </div>
        )}
      </div>
      <Link to={`/watch/${v.v}`} className="hero-video">
        <span className="hero-thumb">
          <img src={poster(v.v)} alt="" />
          <span className="play" aria-hidden />
          {v.d > 0 && <span className="dur">{duration(v.d)}</span>}
        </span>
        <span className="hero-title">{titleOf(v, h)}</span>
        <span className="hero-meta">
          <Vouches n={v.n} big />
          <span>{v.c}</span>
          <span>recommended {v.y0 === v.y1 ? `in ${v.y0}` : `from ${v.y0} to ${v.y1}`}</span>
        </span>
      </Link>
    </section>
  )
}

function TopTen({ cat }: { cat: Catalog }) {
  return (
    <section className="topten">
      <header className="shelf-head">
        <h2>
          <Link to="/all">The ten HN recommended most</Link>
        </h2>
      </header>
      <ol className="topten-list">
        {cat.videos.slice(0, 10).map((v, k) => (
          <li key={v.v}>
            <span className="rank" aria-hidden>
              {k + 1}
            </span>
            <Tile v={v} cat={cat} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function YearStrip({ cat }: { cat: Catalog }) {
  const years = useMemo(() => {
    const m = new Map<number, { n: number; best: number }>()
    cat.videos.forEach((v, i) => {
      const e = m.get(v.y0)
      if (e) e.n++
      else m.set(v.y0, { n: 1, best: i }) // catalog is ranked, so the first seen is the strongest
    })
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [cat])
  const max = Math.max(...years.map(([, e]) => e.n))
  return (
    <nav className="years" aria-label="Browse by the year HN first recommended a video">
      {years.map(([y, e]) => (
        <Link key={y} to={`/year/${y}`} className="year">
          <span className="bar" style={{ height: `${Math.max(6, (e.n / max) * 100)}%` }} />
          <span className="yl">{String(y).slice(2)}</span>
          <span className="ytip" role="tooltip">
            <img src={midFrame(cat.videos[e.best].v)} alt="" loading="lazy" />
            <strong>{y}</strong>
            <span>
              {e.n.toLocaleString()} videos first recommended. Top pick: {cat.videos[e.best].t}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  )
}

export default function Home({ cat }: { cat: Catalog }) {
  const h = useHistory()
  const fy = useMemo(() => forYou(cat, h), [cat, h])
  const top = useMemo(() => cat.videos.slice(10, 40).map((_, i) => i + 10), [cat])
  const enduring = useMemo(
    () => cat.videos.map((v, i) => [i, v.y1 - v.y0] as const).filter(([, s]) => s >= 8).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 24).map(([i]) => i),
    [cat],
  )
  const short = useMemo(() => cat.videos.flatMap((v, i) => (v.d > 0 && v.d < 600 ? [i] : [])).slice(0, 24), [cat])
  const byTopic = useMemo(() => {
    const m = new Map<number, number[]>()
    cat.videos.forEach((v, i) => v.tp.slice(0, 1).forEach((t) => m.set(t, [...(m.get(t) ?? []), i])))
    return m
  }, [cat])
  const hasHistory = Object.keys(h.watched).length + Object.keys(h.saved).length > 0

  return (
    <main className="home">
      <h1 className="sr">hackytube: YouTube videos Hacker News recommended</h1>
      <Hero cat={cat} />
      <YearStrip cat={cat} />
      {hasHistory && <Shelf title="For you" note="From what you watched, and what HN recommended alongside it" items={fy} cat={cat} />}
      <TopTen cat={cat} />
      {!hasHistory && <Shelf title="Start anywhere" note="The strongest pick from each topic" items={fy} cat={cat} />}
      <Shelf title="Also near the top" to="/all" items={top} cat={cat} />
      <Shelf title="Still recommended a decade later" note="People kept pointing to these for 8+ years" items={enduring} cat={cat} />
      <Shelf title="Under ten minutes" items={short} cat={cat} />
      {cat.topics.map((t) => (
        <Shelf key={t.id} title={t.name} to={`/topic/${t.slug}`} items={(byTopic.get(t.id) ?? []).slice(0, 20)} cat={cat} />
      ))}
    </main>
  )
}
