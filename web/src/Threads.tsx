import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Grid } from './components'
import { hnItem, midFrame, youtubePlaylist, type Catalog } from './data'

export type Thread = { sid: number; title: string; points: number | null; date: string; people: number; videos: number[] }

let cache: Promise<Thread[]> | null = null
const loadThreads = () => (cache ??= fetch(`${import.meta.env.BASE_URL}data/threads.json`).then((r) => r.json()))

function useThreads() {
  const [t, setT] = useState<Thread[] | null>(null)
  useEffect(() => {
    loadThreads().then(setT)
  }, [])
  return t
}

/** The HN threads that turned into playlists: "Ask HN: best talks?" and friends. */
export function Threads({ cat }: { cat: Catalog }) {
  const threads = useThreads()
  return (
    <main className="browse">
      <header className="browse-head">
        <h1>Threads that became playlists</h1>
        {threads && <p className="count">{threads.length} HN threads where five or more of these videos were recommended</p>}
      </header>
      {!threads ? (
        <p className="empty-note">Loading threads</p>
      ) : (
        <ol className="thread-index">
          {threads.map((t) => (
            <li key={t.sid}>
              <Link to={`/thread/${t.sid}`}>
                <span className="ti-mosaic" aria-hidden>
                  {t.videos.slice(0, 6).map((i) => (
                    <img key={i} src={midFrame(cat.videos[i].v)} alt="" loading="lazy" />
                  ))}
                </span>
                <span className="ti-title">{t.title}</span>
                <span className="ti-meta">
                  {t.videos.length} videos from {t.people} people, {t.date.slice(0, 4)}
                  {t.points ? `, ${t.points} points` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}

export function ThreadPage({ cat }: { cat: Catalog }) {
  const { sid } = useParams()
  const threads = useThreads()
  const t = threads?.find((x) => String(x.sid) === sid)
  if (!threads) return <main className="browse"><p className="empty-note">Loading thread</p></main>
  if (!t)
    return (
      <main className="empty">
        <h1>That thread isn't one of the playlists</h1>
        <p>
          <Link to="/threads">See every thread that became a playlist</Link>
        </p>
      </main>
    )
  return (
    <main className="browse">
      <header className="browse-head">
        <h1>{t.title}</h1>
        <p className="count">
          {t.videos.length} videos recommended by {t.people} people, {t.date.slice(0, 7)}
          {t.points ? `, ${t.points} points` : ''}. <a href={hnItem(t.sid)}>Read the thread on HN</a>
        </p>
        <a className="play-all" href={youtubePlaylist(t.videos.map((i) => cat.videos[i].v))}>
          Play {Math.min(50, t.videos.length)} on YouTube
        </a>
      </header>
      <Grid items={t.videos} cat={cat} />
    </main>
  )
}
