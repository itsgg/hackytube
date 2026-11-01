import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { duration, midFrame, poster, type Catalog, type Video } from './data'
import { isMuted, titleOf, toggleHidden, useHistory } from './history'

export function Vouches({ n, big }: { n: number; big?: boolean }) {
  return (
    <span className={big ? 'vouches big' : 'vouches'} title={`${n} Hacker News ${n === 1 ? 'person' : 'people'} recommended this`}>
      <span className="tri" aria-hidden>
        ▲
      </span>
      {n}
    </span>
  )
}

export function Tile({ v, cat, wide }: { v: Video; cat: Catalog; wide?: boolean }) {
  const h = useHistory()
  const topic = cat.topics.find((t) => t.id === v.tp[0])
  // YouTube keeps frames at 25%, 50% and 75% of every video; moving across the thumbnail flips through them.
  const [frame, setFrame] = useState(2)
  const scrub = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    setFrame(1 + Math.min(2, Math.floor(((e.clientX - r.left) / r.width) * 3)))
  }
  const still = h.prefs.thumbs === 'original' ? poster(v.v) : midFrame(v.v)
  const title = titleOf(v, h)
  return (
    <div className="tile-wrap">
    <Link to={`/watch/${v.v}`} className={`tile${wide ? ' wide' : ''}${h.watched[v.v] ? ' seen' : ''}`} data-tile title={title !== v.t ? `Original title: ${v.t}` : undefined}>
      <span className="thumb" onPointerMove={scrub} onPointerLeave={() => setFrame(2)}>
        <img src={frame === 2 ? still : `https://i.ytimg.com/vi/${v.v}/hq${frame}.jpg`} alt="" loading="lazy" decoding="async" />
        <span className="scrub" aria-hidden>
          <i className={frame === 1 ? 'on' : ''} />
          <i className={frame === 2 ? 'on' : ''} />
          <i className={frame === 3 ? 'on' : ''} />
        </span>
        {v.q && !wide && <span className="peek">“{v.q}”</span>}
        {v.d > 0 && <span className="dur">{duration(v.d)}</span>}
        {h.watched[v.v] && <span className="watched">Watched</span>}
      </span>
      <span className="tile-body">
        <span className="tile-title">{title}</span>
        <span className="tile-meta">
          <Vouches n={v.n} />
          <span className="chan">{v.c}</span>
          {topic && !wide && <span className="tile-topic">{topic.name}</span>}
        </span>
      </span>
      {v.q && wide && <span className="tile-quote">“{v.q}”</span>}
    </Link>
    {!wide && (
      <button className="hide-btn" onClick={() => toggleHidden(v.v)} aria-label={`Not interested in ${title}`} title="Not interested">
        ×
      </button>
    )}
    </div>
  )
}

function useVisible(items: number[], cat: Catalog) {
  const h = useHistory()
  return items.filter((i) => !isMuted(cat.videos[i], h))
}

export function Shelf({ title, to, items: all, cat, note }: { title: string; to?: string; items: number[]; cat: Catalog; note?: string }) {
  const track = useRef<HTMLDivElement>(null)
  const items = useVisible(all, cat)
  if (!items.length) return null
  const scroll = (dir: number) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: 'smooth' })
  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>{to ? <Link to={to}>{title}</Link> : title}</h2>
        {note && <p className="shelf-note">{note}</p>}
        <span className="shelf-nav">
          <button onClick={() => scroll(-1)} aria-label={`Scroll ${title} back`}>‹</button>
          <button onClick={() => scroll(1)} aria-label={`Scroll ${title} forward`}>›</button>
        </span>
      </header>
      <div className="track" ref={track}>
        {items.map((i) => (
          <Tile key={cat.videos[i].v} v={cat.videos[i]} cat={cat} />
        ))}
      </div>
    </section>
  )
}

export function Grid({ items: all, cat }: { items: number[]; cat: Catalog }) {
  const items = useVisible(all, cat)
  return (
    <div className="grid">
      {items.map((i) => (
        <Tile key={cat.videos[i].v} v={cat.videos[i]} cat={cat} />
      ))}
    </div>
  )
}
