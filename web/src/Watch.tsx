import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Tile, Vouches } from './components'
import { channelSlug, duration, hnItem, hnUser, loadDetail, type Catalog, type Detail, type Vouch } from './data'
import { isMuted, markWatched, toggleBlocked, toggleHidden, toggleSaved, useHistory } from './history'

const ORIGIN = 'https://www.youtube-nocookie.com'
const URL_RE = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g

/** Plain comment text with its URLs made clickable. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} rel="noopener noreferrer nofollow" target="_blank">
            {p.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
            {p.length > 70 ? '…' : ''}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

function Comment({ x, onSeek }: { x: Vouch; onSeek: (t: number) => void }) {
  const [open, setOpen] = useState(false)
  const long = x.x.length > 420
  // Show the comment with its pull quote marked, so the reason to watch is the first thing you read.
  const at = x.q ? x.x.indexOf(x.q) : -1
  const body = open || !long ? x.x : x.x.slice(0, 420).replace(/\s+\S*$/, '') + '…'
  const marked = at >= 0 && (open || at + x.q.length <= body.length)
  return (
    <li className={`comment s${x.s}`}>
      <div className="c-head">
        <a href={hnUser(x.by)} className="c-by">
          {x.by}
        </a>
        <a href={hnItem(x.cid)} className="c-when" title="Open this comment on Hacker News">
          {new Date(x.at).toLocaleDateString('en', { year: 'numeric', month: 'short' })}
        </a>
        {x.t != null && (
          <button className="c-seek" onClick={() => onSeek(x.t!)} title="Jump to the moment this comment linked">
            ▶ {duration(x.t) || '0:00'}
          </button>
        )}
      </div>
      <p className="c-text">
        {marked ? (
          <>
            <Linkified text={body.slice(0, at)} />
            <mark>{body.slice(at, at + x.q.length)}</mark>
            <Linkified text={body.slice(at + x.q.length)} />
          </>
        ) : (
          <Linkified text={body} />
        )}
      </p>
      <div className="c-foot">
        {long && (
          <button className="c-more" onClick={() => setOpen(!open)}>
            {open ? 'Show less' : 'Read the whole comment'}
          </button>
        )}
        <a href={hnItem(x.sid)} className="c-thread">
          in “{x.st}”{x.sp ? `, ${x.sp} points` : ''}
        </a>
      </div>
    </li>
  )
}

/** One dot per recommendation, placed by date: shows whether HN kept coming back to a video. */
function Timeline({ vouches }: { vouches: Vouch[] }) {
  const years = vouches.map((x) => new Date(x.at).getFullYear() + new Date(x.at).getMonth() / 12)
  if (years.length < 2) return null
  const lo = Math.floor(Math.min(...years))
  const hi = Math.ceil(Math.max(...years)) + 1
  const span = Math.max(1, hi - lo)
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((y, i, a) => a.length < 12 || i % 2 === 0 || y === hi)
  return (
    <figure className="timeline" aria-label={`Recommended ${vouches.length} times between ${lo} and ${hi - 1}`}>
      <div className="tl-track">
        {vouches.map((x, i) => (
          <a
            key={x.cid}
            href={hnItem(x.cid)}
            className={`tl-dot s${x.s}`}
            style={{ left: `${((years[i] - lo) / span) * 100}%` }}
            title={`${x.by}, ${x.at.slice(0, 7)}`}
          />
        ))}
      </div>
      <div className="tl-axis" aria-hidden>
        {ticks.map((y) => (
          <span key={y} style={{ left: `${((y - lo) / span) * 100}%` }}>
            {y}
          </span>
        ))}
      </div>
    </figure>
  )
}

export default function Watch({ cat }: { cat: Catalog }) {
  const { vid = '' } = useParams()
  const nav = useNavigate()
  const h = useHistory()
  const idx = cat.byId.get(vid)
  const v = idx !== undefined ? cat.videos[idx] : undefined
  const [detail, setDetail] = useState<Detail | null>(null)
  const [sort, setSort] = useState<'best' | 'old' | 'new'>('best')
  const [showOriginal, setShowOriginal] = useState(false)
  const [now, setNow] = useState(0)
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    setDetail(null)
    setShowOriginal(false)
    setNow(0)
    loadDetail(vid).then(setDetail)
    markWatched(vid)
    window.scrollTo(0, 0)
  }, [vid])

  const ok = (i: number) => !isMuted(cat.videos[i], h)
  const related = useMemo(() => (v ? v.rel.filter(ok).slice(0, 12) : []), [v, h]) // eslint-disable-line react-hooks/exhaustive-deps
  const sameTopic = useMemo(
    () => (v ? cat.videos.flatMap((o, i) => (i !== idx && o.tp[0] === v.tp[0] && !v.rel.includes(i) && ok(i) ? [i] : [])).slice(0, 12) : []),
    [cat, v, idx, h], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const next = related.find((i) => !h.watched[cat.videos[i].v]) ?? sameTopic[0]

  // The iframe API's postMessage channel: autoplay the next pick at the end, and track time for chapters.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== ORIGIN || typeof e.data !== 'string') return
      try {
        const d = JSON.parse(e.data)
        if (d.event === 'onStateChange' && d.info === 0 && next !== undefined) nav(`/watch/${cat.videos[next].v}`)
        if (d.event === 'infoDelivery' && typeof d.info?.currentTime === 'number') setNow(d.info.currentTime)
      } catch {
        /* not ours */
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [next, nav, cat])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || e.metaKey || e.ctrlKey) return
      if (e.key === 'n' && next !== undefined) nav(`/watch/${cat.videos[next].v}`)
      if (e.key === 's') toggleSaved(vid)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, nav, cat, vid])

  if (!v) {
    return (
      <main className="empty">
        <h1>This video isn't in the collection</h1>
        <p>
          It may have been removed from YouTube since HN recommended it. <Link to="/">Go to the front page</Link>.
        </p>
      </main>
    )
  }

  const post = (func: string, args: unknown[] = []) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), ORIGIN)
  const seek = (t: number) => {
    post('seekTo', [t, true])
    post('playVideo')
    frame.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), ORIGIN)

  const vouches = detail?.vouches ?? []
  const chapters = detail?.chapters ?? []
  const sorted = [...vouches].sort((a, b) =>
    sort === 'best' ? b.s - a.s || b.x.length - a.x.length : sort === 'old' ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at),
  )
  const topics = v.tp.map((t) => cat.topics.find((x) => x.id === t)).filter((t) => t !== undefined)
  const honest = h.prefs.titles === 'dearrow' && v.ht && !showOriginal
  const current = chapters.reduce((c, ch, i) => (ch[1] <= now ? i : c), 0)
  const blocked = !!h.blocked[v.c]

  return (
    <main className="watch">
      <section className="theater">
        <div className="player">
          <iframe
            ref={frame}
            key={v.v}
            src={`${ORIGIN}/embed/${v.v}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&origin=${encodeURIComponent(location.origin)}`}
            title={v.t}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={listen}
          />
        </div>
      </section>

      <div className="watch-body">
        <div className="watch-main">
          <h1 className="watch-title">{honest ? v.ht : v.t}</h1>
          {v.ht && h.prefs.titles === 'dearrow' && (
            <button className="title-swap" onClick={() => setShowOriginal(!showOriginal)}>
              {showOriginal ? 'Show the DeArrow title' : `Uploader's title: “${v.t}”`}
            </button>
          )}
          <div className="watch-meta">
            <Vouches n={v.n} big />
            {v.c && <Link to={`/channel/${channelSlug(v.c)}`}>{v.c}</Link>}
            {v.d > 0 && <span>{duration(v.d)}</span>}
            {v.p && <span>uploaded {v.p.slice(0, 4)}</span>}
            {topics.map((t) => (
              <Link key={t.id} to={`/topic/${t.slug}`} className="chip">
                {t.name}
              </Link>
            ))}
          </div>
          <div className="watch-actions">
            <button className={`save${h.saved[v.v] ? ' on' : ''}`} onClick={() => toggleSaved(v.v)} aria-pressed={!!h.saved[v.v]}>
              {h.saved[v.v] ? 'Saved' : 'Save'}
            </button>
            <a className="yt" href={`https://www.youtube.com/watch?v=${v.v}`}>
              Open on YouTube
            </a>
            <button className="quiet" onClick={() => toggleHidden(v.v)}>
              {h.hidden[v.v] ? 'Show in feeds again' : 'Not interested'}
            </button>
            {v.c && (
              <button className="quiet" onClick={() => toggleBlocked(v.c)}>
                {blocked ? `Unblock ${v.c}` : `Block ${v.c}`}
              </button>
            )}
          </div>

          {chapters.length > 0 && (
            <nav className="chapters" aria-label="Chapters">
              <h2>Chapters</h2>
              <ol>
                {chapters.map(([title, t], i) => (
                  <li key={t} className={i === current && now > 0 ? 'on' : undefined}>
                    <button onClick={() => seek(t)}>
                      <span className="ch-t">{duration(t) || '0:00'}</span>
                      <span className="ch-name">{title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <section className="why">
            <header className="why-head">
              <h2>Why {v.n === 1 ? 'one person' : `${v.n} people`} on HN recommended it</h2>
              <div className="seg" role="group" aria-label="Sort comments">
                {(['best', 'old', 'new'] as const).map((k) => (
                  <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>
                    {k === 'best' ? 'Strongest' : k === 'old' ? 'Oldest' : 'Newest'}
                  </button>
                ))}
              </div>
            </header>
            <Timeline vouches={vouches} />
            {detail === null ? (
              <p className="loading">Loading comments</p>
            ) : (
              <ol className="comments">
                {sorted.map((x) => (
                  <Comment key={x.cid} x={x} onSeek={seek} />
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="watch-side">
          {next !== undefined && (
            <div className="up-next">
              <h2>
                Up next <kbd>n</kbd>
              </h2>
              <Tile v={cat.videos[next]} cat={cat} wide />
            </div>
          )}
          {related.length > 0 && (
            <>
              <h2>Recommended in the same threads</h2>
              <div className="side-list">
                {related
                  .filter((i) => i !== next)
                  .map((i) => (
                    <Tile key={i} v={cat.videos[i]} cat={cat} wide />
                  ))}
              </div>
            </>
          )}
          {sameTopic.length > 0 && topics[0] && (
            <>
              <h2>More in {topics[0].name}</h2>
              <div className="side-list">
                {sameTopic
                  .filter((i) => i !== next)
                  .slice(0, 8)
                  .map((i) => (
                    <Tile key={i} v={cat.videos[i]} cat={cat} wide />
                  ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </main>
  )
}
