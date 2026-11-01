import MiniSearch from 'minisearch'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Browse, { Channels, Topics } from './Browse'
import { Vouches } from './components'
import { duration, loadCatalog, midFrame, type Catalog } from './data'
import { isMuted, titleOf, useHistory } from './history'
import Home from './Home'
import Settings from './Settings'
import Watch from './Watch'

function Search({ cat, open, onClose }: { cat: Catalog; open: boolean; onClose: () => void }) {
  const h = useHistory()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const index = useMemo(() => {
    const ms = new MiniSearch({ fields: ['t', 'c', 'q', 'topic'], storeFields: [], searchOptions: { boost: { t: 3, c: 2 }, prefix: true, fuzzy: 0.15 } })
    ms.addAll(
      cat.videos.map((v, id) => ({ id, t: `${v.t} ${v.ht ?? ''}`, c: v.c, q: v.q, topic: v.tp.map((t) => cat.topics.find((x) => x.id === t)?.name).join(' ') })),
    )
    return ms
  }, [cat])
  // Blend text relevance with how many people recommended the video.
  const hits = useMemo(
    () =>
      q.trim()
        ? index
            .search(q)
            .map((r) => [r.id as number, r.score * (1 + 0.25 * Math.log1p(cat.videos[r.id].n))] as const)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([i]) => i)
        : [],
    [q, index, cat],
  )
  useEffect(() => {
    if (open) {
      setQ('')
      requestAnimationFrame(() => input.current?.focus())
    }
  }, [open])
  useEffect(() => setSel(0), [q])
  if (!open) return null

  const go = (i: number) => {
    onClose()
    nav(`/watch/${cat.videos[i].v}`)
  }
  return (
    <div className="search-scrim" onMouseDown={onClose}>
      <div className="search" role="dialog" aria-label="Search videos" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, channels, topics and what people said"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(hits.length - 1, s + 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(0, s - 1))
            }
            if (e.key === 'Enter' && hits[sel] !== undefined) go(hits[sel])
          }}
        />
        {q.trim() && (
          <ul className="results">
            {hits.length === 0 && <li className="no-hit">No videos match “{q}”.</li>}
            {hits.map((i, k) => {
              const v = cat.videos[i]
              return (
                <li key={v.v}>
                  <button className={k === sel ? 'sel' : ''} onMouseEnter={() => setSel(k)} onClick={() => go(i)}>
                    <img src={midFrame(v.v)} alt="" />
                    <span className="r-title">{titleOf(v, h)}</span>
                    <span className="r-meta">
                      <Vouches n={v.n} />
                      <span>{v.c}</span>
                      <span>{duration(v.d)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

const KEYS: [string, string][] = [
  ['/', 'Search'],
  ['j  k', 'Move between videos'],
  ['Enter', 'Open the focused video'],
  ['n', 'Next video, on a watch page'],
  ['s', 'Save or unsave, on a watch page'],
  ['r', 'Random well-loved video'],
  ['g h', 'Front page'],
  ['g t', 'Topics'],
  ['g c', 'Channels'],
  ['g s', 'Saved'],
  ['?', 'This list'],
]

function Shell({ cat }: { cat: Catalog }) {
  const [searching, setSearching] = useState(false)
  const [help, setHelp] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const pending = useRef('')
  const h = useHistory()

  useEffect(() => {
    setSearching(false)
    setHelp(false)
  }, [loc.pathname])

  // Theme preference: "system" defers to the OS through the CSS media query.
  useEffect(() => {
    if (h.prefs.theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = h.prefs.theme
  }, [h.prefs.theme])

  // Going back returns to where you were on the page, instead of the top of a reshuffled feed.
  const positions = useRef(new Map<string, number>())
  useEffect(() => {
    const key = loc.key
    const map = positions.current
    const saved = map.get(key)
    if (saved !== undefined) requestAnimationFrame(() => window.scrollTo(0, saved))
    return () => {
      map.set(key, window.scrollY)
    }
  }, [loc.key])

  const surprise = () => {
    const pool = cat.videos.slice(0, 1500).filter((v) => !h.watched[v.v] && !isMuted(v, h))
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? cat.videos[0]
    nav(`/watch/${pick.v}`)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (pending.current === 'g') {
        pending.current = ''
        if (k === 'h') nav('/')
        if (k === 't') nav('/topics')
        if (k === 'c') nav('/channels')
        if (k === 's') nav('/saved')
        return
      }
      if (k === 'g') pending.current = 'g'
      else if (k === '/') {
        e.preventDefault()
        setSearching(true)
      }
      else if (k === '?') setHelp((x) => !x)
      else if (k === 'Escape') {
        setHelp(false)
        setSearching(false)
      }
      else if (k === 'r') surprise()
      else if (k === 'j' || k === 'k') {
        const tiles = [...document.querySelectorAll<HTMLElement>('[data-tile]')]
        const at = tiles.indexOf(document.activeElement as HTMLElement)
        const next = tiles[Math.max(0, Math.min(tiles.length - 1, at + (k === 'j' ? 1 : -1)))]
        next?.focus()
        next?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="hackytube front page">
          <span className="logo" aria-hidden>
            Y
          </span>
          <span className="word">hackytube</span>
        </Link>
        <nav className="nav">
          <NavLink to="/topics">topics</NavLink>
          <NavLink to="/channels">channels</NavLink>
          <NavLink to="/all">everything</NavLink>
          <NavLink to="/saved">saved</NavLink>
          <NavLink to="/history">watched</NavLink>
          <NavLink to="/settings">settings</NavLink>
        </nav>
        <button className="surprise" onClick={surprise} title="Play a random well-loved video you haven't seen (r)">
          Surprise me
        </button>
        <button className="search-btn" onClick={() => setSearching(true)}>
          <span>Search {cat.videos.length.toLocaleString()} videos</span>
          <kbd>/</kbd>
        </button>
      </header>

      <Routes>
        <Route path="/" element={<Home cat={cat} />} />
        <Route path="/watch/:vid" element={<Watch cat={cat} />} />
        <Route path="/all" element={<Browse cat={cat} mode="all" />} />
        <Route path="/topics" element={<Topics cat={cat} />} />
        <Route path="/topic/:slug" element={<Browse key={loc.pathname} cat={cat} mode="topic" />} />
        <Route path="/year/:year" element={<Browse key={loc.pathname} cat={cat} mode="year" />} />
        <Route path="/saved" element={<Browse cat={cat} mode="saved" />} />
        <Route path="/history" element={<Browse cat={cat} mode="history" />} />
        <Route path="/channels" element={<Channels cat={cat} />} />
        <Route path="/channel/:slug" element={<Browse key={loc.pathname} cat={cat} mode="channel" />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<main className="empty"><h1>Nothing here</h1><p><Link to="/">Go to the front page</Link></p></main>} />
      </Routes>

      <footer className="foot">
        <p>
          Titles marked by <a href="https://dearrow.ajay.app">DeArrow</a> users replace clickbait where the community voted. Every video here was recommended in a Hacker News comment between {Math.min(...cat.videos.map((v) => v.y0))} and{' '}
          {Math.max(...cat.videos.map((v) => v.y1))}. Inspired by Andrej Karpathy's HackerTube. Press <kbd>?</kbd> for shortcuts.
        </p>
        <p>
          <a href={`${import.meta.env.BASE_URL}data/feed.xml`}>RSS of newly recommended videos</a>
          <a href={`${import.meta.env.BASE_URL}data/catalog.json`}>Download the catalog as JSON</a>
          <a href="https://github.com/itsgg/hackytube">Source on GitHub</a>
        </p>
      </footer>

      <Search cat={cat} open={searching} onClose={() => setSearching(false)} />
      {help && (
        <div className="search-scrim" onMouseDown={() => setHelp(false)}>
          <div className="keys" role="dialog" aria-label="Keyboard shortcuts">
            <h2>Keyboard shortcuts</h2>
            <dl>
              {KEYS.map(([k, d]) => (
                <div key={k}>
                  <dt>
                    {k.split('  ').map((x) => (
                      <kbd key={x}>{x}</kbd>
                    ))}
                  </dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  )
}

export default function App() {
  const [cat, setCat] = useState<Catalog | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    loadCatalog().then(setCat, () => setErr(true))
  }, [])
  if (err) return <main className="empty"><h1>The catalog didn't load</h1><p>Check that data/catalog.json exists, then reload.</p></main>
  if (!cat) return <div className="boot" aria-label="Loading" />
  return (
    <BrowserRouter>
      <Shell cat={cat} />
    </BrowserRouter>
  )
}
