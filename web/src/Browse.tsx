import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Grid } from './components'
import { arrange, LENGTHS, SORTS, type Length, type Sort } from './arrange'
import { channelSlug, midFrame, youtubePlaylist, type Catalog } from './data'
import { forget, isMuted, useHistory } from './history'

type Mode = 'all' | 'topic' | 'year' | 'channel' | 'saved' | 'history'

export default function Browse({ cat, mode }: { cat: Catalog; mode: Mode }) {
  const { slug, year } = useParams()
  const h = useHistory()
  const [sort, setSort] = useState<Sort>('rec')
  const [len, setLen] = useState<Length>('any')
  const [hideSeen, setHideSeen] = useState(false)
  const [shown, setShown] = useState(60)

  const topic = mode === 'topic' ? cat.topics.find((t) => t.slug === slug) : undefined
  const channel = mode === 'channel' ? cat.videos.find((v) => v.c && channelSlug(v.c) === slug)?.c : undefined
  const y = Number(year)
  const personal = mode === 'saved' || mode === 'history'

  const base = useMemo(() => {
    const all = cat.videos.map((_, i) => i)
    const recent = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).flatMap(([v]) => cat.byId.get(v) ?? [])
    if (mode === 'topic') return all.filter((i) => topic && cat.videos[i].tp.includes(topic.id))
    if (mode === 'year') return all.filter((i) => cat.videos[i].y0 <= y && cat.videos[i].y1 >= y)
    if (mode === 'channel') return all.filter((i) => cat.videos[i].c === channel)
    if (mode === 'saved') return recent(h.saved)
    if (mode === 'history') return recent(h.watched)
    return all
  }, [cat, mode, topic, y, channel, h.saved, h.watched])

  const items = useMemo(() => {
    const keep = base.filter((i) => !(hideSeen && h.watched[cat.videos[i].v]) && (personal || mode === 'channel' || !isMuted(cat.videos[i], h)))
    return personal ? keep : arrange(cat.videos, keep, sort, len)
  }, [base, hideSeen, h, personal, mode, cat, sort, len])

  const title =
    mode === 'topic' ? (topic?.name ?? 'Unknown topic')
    : mode === 'year' ? `What HN was recommending in ${y}`
    : mode === 'channel' ? (channel ?? 'Unknown channel')
    : mode === 'saved' ? 'Saved'
    : mode === 'history' ? 'Watched'
    : 'Everything HN recommended'

  const years = useMemo(() => [...new Set(cat.videos.map((v) => v.y0))].sort(), [cat])
  const people = useMemo(() => items.reduce((a, i) => a + cat.videos[i].n, 0), [items, cat])

  return (
    <main className="browse">
      <header className="browse-head">
        <h1>{title}</h1>
        <p className="count">
          {items.length.toLocaleString()} {items.length === 1 ? 'video' : 'videos'}
          {mode === 'channel' && `, recommended ${people.toLocaleString()} times on HN`}
        </p>
        {mode === 'year' && (
          <nav className="year-pager">
            {years.includes(y - 1) && <Link to={`/year/${y - 1}`}>{y - 1}</Link>}
            {years.includes(y + 1) && <Link to={`/year/${y + 1}`}>{y + 1}</Link>}
          </nav>
        )}
        {items.length > 1 && (
          <a className="play-all" href={youtubePlaylist(items.map((i) => cat.videos[i].v))} title="Opens the first 50 as a playlist on YouTube, phones and TVs included">
            Play {Math.min(50, items.length)} on YouTube
          </a>
        )}
      </header>

      {mode === 'channel' && channel && (
        <p className="privacy">{h.blocked[channel] ? 'You blocked this channel, so it stays out of your feeds.' : null}</p>
      )}

      {!personal && (
        <div className="filters">
          <label>
            <span className="sr">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {Object.entries(SORTS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="seg" role="group" aria-label="Length">
            {Object.entries(LENGTHS).map(([k, l]) => (
              <button key={k} aria-pressed={len === k} onClick={() => setLen(k as Length)}>
                {l}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={hideSeen} onChange={(e) => setHideSeen(e.target.checked)} /> Hide watched
          </label>
        </div>
      )}

      {mode === 'history' && items.length > 0 && (
        <p className="privacy">
          Your history stays in this browser and only shapes your For you shelf.{' '}
          <button className="linkish" onClick={forget}>
            Clear history and saved videos
          </button>
        </p>
      )}

      {items.length === 0 ? (
        <p className="empty-note">
          {mode === 'saved'
            ? 'Press s on any video to save it here.'
            : mode === 'history'
              ? 'Videos you open will show up here.'
              : 'Nothing matches these filters. Try another length.'}
        </p>
      ) : (
        <Grid items={items.slice(0, shown)} cat={cat} />
      )}
      {items.length > shown && (
        <button className="more" onClick={() => setShown(shown + 90)}>
          Show {Math.min(90, items.length - shown)} more
        </button>
      )}
    </main>
  )
}

export function Topics({ cat }: { cat: Catalog }) {
  return (
    <main className="browse">
      <header className="browse-head">
        <h1>Topics</h1>
      </header>
      {cat.topics.length === 0 ? (
        <p className="empty-note">Topics appear once the catalog has been filed into shelves.</p>
      ) : (
        <ul className="topic-index">
          {cat.topics.map((t) => {
            const lead = cat.videos.find((v) => v.tp[0] === t.id)
            return (
              <li key={t.id}>
                <Link to={`/topic/${t.slug}`}>
                  {lead && <img src={midFrame(lead.v)} alt="" loading="lazy" />}
                  <span className="ti-name">{t.name}</span>
                  <span className="ti-count">{t.count}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

/** Channels HN keeps coming back to, ranked by how many people recommended their videos. */
export function Channels({ cat }: { cat: Catalog }) {
  const h = useHistory()
  const rows = useMemo(() => {
    const m = new Map<string, { n: number; videos: number[] }>()
    cat.videos.forEach((v, i) => {
      if (!v.c) return
      const e = m.get(v.c) ?? { n: 0, videos: [] }
      e.n += v.n
      e.videos.push(i)
      m.set(v.c, e)
    })
    return [...m.entries()].filter(([, e]) => e.videos.length >= 2).sort((a, b) => b[1].n - a[1].n)
  }, [cat])
  const [shown, setShown] = useState(60)
  return (
    <main className="browse">
      <header className="browse-head">
        <h1>Channels HN keeps recommending</h1>
        <p className="count">{rows.length.toLocaleString()} channels with two or more recommended videos</p>
      </header>
      <ol className="channel-index">
        {rows.slice(0, shown).map(([name, e]) => (
          <li key={name} className={h.blocked[name] ? 'blocked' : undefined}>
            <Link to={`/channel/${channelSlug(name)}`}>
              <span className="ci-strip" aria-hidden>
                {e.videos.slice(0, 4).map((i) => (
                  <img key={i} src={midFrame(cat.videos[i].v)} alt="" loading="lazy" />
                ))}
              </span>
              <span className="ci-name">{name}</span>
              <span className="ci-meta">
                {e.videos.length} videos, recommended {e.n} times
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {rows.length > shown && (
        <button className="more" onClick={() => setShown(shown + 90)}>
          Show more channels
        </button>
      )}
    </main>
  )
}
