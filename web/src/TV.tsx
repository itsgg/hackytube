import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { duration, loadVouches, type Catalog, type Video, type Vouch } from './data'
import { isMuted, markWatched, titleOf, useHistory } from './history'
import { channels, onAir } from './views'

const ORIGIN = 'https://www.youtube-nocookie.com'
function Static({ show }: { show: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!show || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const c = ref.current!
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(c.width, c.height)
    let raf = 0
    const tick = () => {
      for (let p = 0; p < img.data.length; p += 4) {
        const n = Math.random() * 255
        img.data[p] = img.data[p + 1] = img.data[p + 2] = n
        img.data[p + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [show])
  return <canvas ref={ref} width={160} height={90} className={`tv-static${show ? ' on' : ''}`} aria-hidden />
}

export default function TV({ cat }: { cat: Catalog }) {
  const { ch: chParam } = useParams()
  const nav = useNavigate()
  const h = useHistory()
  const lineups = useMemo(() => channels(cat), [cat])
  const ch = lineups.find((c) => c.no === Number(chParam)) ?? lineups[0]
  const [tick, setTick] = useState(0) // bumps when a program ends, to re-tune to what's on now
  const air = useMemo(() => onAir(cat, ch, Math.floor(Date.now() / 1000)), [cat, ch, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const v: Video = cat.videos[ch.items[air.slot]]
  const [quote, setQuote] = useState<Vouch | null>(null)
  const [info, setInfo] = useState(true)
  const [guide, setGuide] = useState(false)
  const [sound, setSound] = useState(false)
  const [noise, setNoise] = useState(true)
  const [typed, setTyped] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)

  const tune = (no: number) => {
    const list = lineups.map((c) => c.no)
    const target = list.includes(no) ? no : list[(list.indexOf(ch.no) + (no > ch.no ? 1 : list.length - 1)) % list.length]
    nav(`/tv/${target}`, { replace: true })
  }
  const step = (dir: 1 | -1) => {
    const k = lineups.indexOf(ch)
    nav(`/tv/${lineups[(k + dir + lineups.length) % lineups.length].no}`, { replace: true })
  }

  // Each new program: a burst of static, the caption, and the strongest reason HN gave for it.
  useEffect(() => {
    setNoise(true)
    setInfo(true)
    const a = setTimeout(() => setNoise(false), 380)
    const b = setTimeout(() => setInfo(false), 12000)
    setQuote(null)
    // Same rule as the catalog's pull quote: strongest first, then the most substantial (up to a caption's length).
    loadVouches(v.v).then((vs) =>
      setQuote([...vs].filter((x) => x.q.length >= 20).sort((p, q) => q.s - p.s || Math.min(q.q.length, 140) - Math.min(p.q.length, 140))[0] ?? null),
    )
    markWatched(v.v)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [v.v])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== ORIGIN || typeof e.data !== 'string') return
      try {
        const d = JSON.parse(e.data)
        if (d.event === 'onStateChange' && d.info === 0) setTick((t) => t + 1)
      } catch {
        /* not ours */
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const post = (func: string, args: unknown[] = []) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), ORIGIN)
  const toggleSound = () => {
    post(sound ? 'mute' : 'unMute')
    post('playVideo')
    setSound(!sound)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        step(1)
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        step(-1)
      }
      else if (/^\d$/.test(e.key)) setTyped((t) => (t + e.key).slice(-2))
      else if (e.key === 'i') setInfo((x) => !x)
      else if (e.key === 'g') setGuide((x) => !x)
      else if (e.key === 'm') toggleSound()
      else if (e.key === 'Escape') {
        if (guide) setGuide(false)
        else nav('/')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Typed channel numbers tune after a short pause, like a remote.
  useEffect(() => {
    if (!typed) return
    const t = setTimeout(() => {
      tune(Number(typed))
      setTyped('')
    }, 900)
    return () => clearTimeout(t)
  }, [typed]) // eslint-disable-line react-hooks/exhaustive-deps

  const nowSec = Math.floor(Date.now() / 1000)
  const src = `${ORIGIN}/embed/${v.v}?autoplay=1&mute=1&start=${air.offset}&enablejsapi=1&controls=1&rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(location.origin)}`

  return (
    <main className="tv" onPointerMove={() => setInfo(true)}>
      <div className="tv-screen">
        <iframe
          ref={frame}
          key={`${ch.no}-${v.v}`}
          src={src}
          title={`Channel ${ch.no}: ${v.t}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          onLoad={() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), ORIGIN)}
        />
        <Static show={noise} />
      </div>

      <div className="tv-bug" aria-live="polite">
        <span className="tv-no">{typed || ch.no}</span>
        <span className="tv-name">{ch.name}</span>
      </div>

      <div className={`tv-third${info ? ' on' : ''}`}>
        {quote && (
          <p className="tv-quote">
            “{quote.q}” <span>{quote.by}, {quote.at.slice(0, 4)}</span>
          </p>
        )}
        <p className="tv-title">
          <span className="vouches">▲{v.n}</span> {titleOf(v, h)} <span className="tv-dim">{v.c}</span>
          <span className="tv-dim">{duration(air.left)} left on air</span>
        </p>
      </div>

      <div className="tv-controls">
        <button onClick={() => step(1)} aria-label="Next channel">
          ▲
        </button>
        <button onClick={() => step(-1)} aria-label="Previous channel">
          ▼
        </button>
        <button onClick={toggleSound} className={sound ? 'on' : ''}>
          {sound ? 'Sound on' : 'Turn sound on'}
        </button>
        <button onClick={() => setGuide(!guide)}>Guide</button>
        <button onClick={() => nav(`/watch/${v.v}`)}>Why HN loves it</button>
        <button onClick={() => nav('/')} aria-label="Leave TV">
          ×
        </button>
      </div>

      {guide && (
        <div className="tv-guide" role="dialog" aria-label="Channel guide">
          <h2>On now</h2>
          <ol>
            {lineups.map((c) => {
              const a = onAir(cat, c, nowSec)
              const p = cat.videos[c.items[a.slot]]
              const next = cat.videos[c.items[(a.slot + 1) % c.items.length]]
              return (
                <li key={c.no} className={c.no === ch.no ? 'cur' : undefined}>
                  <button
                    onClick={() => {
                      setGuide(false)
                      tune(c.no)
                    }}
                  >
                    <span className="g-no">{c.no}</span>
                    <span className="g-name">{c.name}</span>
                    <span className={`g-now${isMuted(p, h) ? ' muted' : ''}`}>{titleOf(p, h)}</span>
                    <span className="g-next">
                      next: {titleOf(next, h)} in {duration(a.left)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <p className="tv-help">
        <kbd>↑</kbd>
        <kbd>↓</kbd> or a number to change channel, <kbd>g</kbd> guide, <kbd>m</kbd> sound, <kbd>i</kbd> info, <kbd>Esc</kbd> leave
      </p>
    </main>
  )
}
