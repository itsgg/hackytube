import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Vouches } from './components'
import { duration, midFrame, type Catalog } from './data'
import { isMuted, titleOf, useHistory } from './history'

type MapData = { x: number[]; y: number[]; clusters: { id: number; x: number; y: number; r: number; n: number }[] }
type View = { k: number; tx: number; ty: number } // screen = world * k + t

const WORLD = 10000
const CELL = 120 // spatial hash cell, world units

let mapData: Promise<MapData> | null = null
const loadMap = () => (mapData ??= fetch(`${import.meta.env.BASE_URL}data/map.json`).then((r) => r.json()))

/**
 * The constellation: every filed video is a star in its topic's cluster.
 * Brighter and bigger means more people on HN recommended it; the top 1% glow orange.
 */
export default function MapView({ cat }: { cat: Catalog }) {
  const h = useHistory()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [data, setData] = useState<MapData | null>(null)
  const [hover, setHover] = useState<{ i: number; sx: number; sy: number } | null>(null)
  const view = useRef<View>({ k: 1, tx: 0, ty: 0 })
  const frame = useRef(0)
  const thumbs = useRef(new Map<string, HTMLImageElement>())
  const hoverRef = useRef<number | null>(null)

  useEffect(() => {
    loadMap().then(setData)
  }, [])

  const names = useMemo(() => new Map(cat.topics.map((t) => [t.id, t])), [cat])
  const elite = Math.max(1, Math.floor(cat.videos.length / 100))

  const grid = useMemo(() => {
    const g = new Map<string, number[]>()
    if (!data) return g
    data.x.forEach((x, i) => {
      if (x < 0) return
      const key = `${Math.floor(x / CELL)},${Math.floor(data.y[i] / CELL)}`
      g.set(key, [...(g.get(key) ?? []), i])
    })
    return g
  }, [data])

  const radius = (i: number, k: number) => (0.9 + Math.sqrt(cat.videos[i].n) * 0.55) * Math.max(1, Math.sqrt(k / 0.12))

  // Draw only when something changed, batched to the next frame.
  const draw = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const c = canvas.current
      if (!c || !data) return
      const dpr = window.devicePixelRatio || 1
      const w = c.clientWidth
      const hgt = c.clientHeight
      if (c.width !== w * dpr) {
        c.width = w * dpr
        c.height = hgt * dpr
      }
      const ctx = c.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, hgt)
      const { k, tx, ty } = view.current
      const css = getComputedStyle(c)
      const star = css.getPropertyValue('--star').trim() || '#f1efe4'
      const hot = css.getPropertyValue('--orange').trim() || '#ff6600'

      const sel = hoverRef.current
      if (sel !== null) {
        ctx.strokeStyle = hot
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 1
        for (const j of cat.videos[sel].rel) {
          if (data.x[j] < 0) continue
          ctx.beginPath()
          ctx.moveTo(data.x[sel] * k + tx, data.y[sel] * k + ty)
          ctx.lineTo(data.x[j] * k + tx, data.y[j] * k + ty)
          ctx.stroke()
        }
      }

      const big: number[] = []
      for (let i = 0; i < data.x.length; i++) {
        if (data.x[i] < 0) continue
        const sx = data.x[i] * k + tx
        const sy = data.y[i] * k + ty
        if (sx < -40 || sy < -40 || sx > w + 40 || sy > hgt + 40) continue
        const v = cat.videos[i]
        const r = radius(i, k)
        if (r >= 16) {
          big.push(i)
          continue
        }
        ctx.globalAlpha = isMuted(v, h) ? 0.12 : Math.min(1, 0.35 + Math.sqrt(v.n) * 0.09)
        ctx.fillStyle = i < elite ? hot : star
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
        if (h.watched[v.v]) {
          ctx.globalAlpha = 0.9
          ctx.strokeStyle = hot
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // Up close, stars become thumbnails (a bounded number, loaded lazily).
      ctx.globalAlpha = 1
      for (const i of big.slice(0, 220)) {
        const v = cat.videos[i]
        const r = radius(i, k)
        const sx = data.x[i] * k + tx
        const sy = data.y[i] * k + ty
        let img = thumbs.current.get(v.v)
        if (!img) {
          img = new Image()
          img.src = midFrame(v.v)
          img.onload = draw
          thumbs.current.set(v.v, img)
        }
        const tw = r * 2.4
        const th = (tw * 9) / 16
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(sx - tw / 2, sy - th / 2, tw, th, 3)
        ctx.clip()
        if (img.complete && img.naturalWidth) ctx.drawImage(img, sx - tw / 2, sy - th / 2, tw, th)
        else {
          ctx.fillStyle = star
          ctx.globalAlpha = 0.25
          ctx.fill()
        }
        ctx.restore()
        if (i < elite || i === sel) {
          ctx.strokeStyle = hot
          ctx.lineWidth = 2
          ctx.strokeRect(sx - tw / 2, sy - th / 2, tw, th)
        }
      }

      // Cluster names: large when zoomed out, fading as you dive in. Biggest clusters claim space first; overlaps are skipped.
      const labelAlpha = Math.max(0, Math.min(1, 1.6 - k * 4))
      if (labelAlpha > 0) {
        ctx.globalAlpha = labelAlpha
        ctx.fillStyle = star
        ctx.textAlign = 'center'
        const taken: [number, number, number, number][] = []
        for (const cl of [...data.clusters].sort((a, b) => b.n - a.n)) {
          const t = names.get(cl.id)
          if (!t) continue
          const size = Math.max(11, Math.min(22, cl.r * k * 0.28))
          ctx.font = `650 ${size}px "Bricolage Grotesque", Verdana, sans-serif`
          const lw = ctx.measureText(t.name).width
          const lx = cl.x * k + tx
          const ly = (cl.y - cl.r) * k + ty - 6
          const box: [number, number, number, number] = [lx - lw / 2 - 4, ly - size, lx + lw / 2 + 4, ly + 4]
          if (taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue
          taken.push(box)
          ctx.fillText(t.name, lx, ly)
        }
      }
      ctx.globalAlpha = 1
    })
  }

  const fit = (x = WORLD / 2, y = WORLD / 2, zoom?: number) => {
    const c = canvas.current
    if (!c) return
    const k = zoom ?? Math.min(c.clientWidth, c.clientHeight) / WORLD
    view.current = { k, tx: c.clientWidth / 2 - x * k, ty: c.clientHeight / 2 - y * k }
    draw()
  }

  useEffect(() => {
    if (!data) return
    const focus = params.get('v')
    const i = focus ? cat.byId.get(focus) : undefined
    if (i !== undefined && data.x[i] >= 0) {
      fit(data.x[i], data.y[i], 0.9)
      hoverRef.current = i
    } else fit()
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(draw, [h]) // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = (sx: number, sy: number, factor: number) => {
    const v = view.current
    const k = Math.max(0.03, Math.min(3, v.k * factor))
    view.current = { k, tx: sx - ((sx - v.tx) * k) / v.k, ty: sy - ((sy - v.ty) * k) / v.k }
    draw()
  }

  const pick = (sx: number, sy: number) => {
    if (!data) return null
    const { k, tx, ty } = view.current
    const wx = (sx - tx) / k
    const wy = (sy - ty) / k
    const cx = Math.floor(wx / CELL)
    const cy = Math.floor(wy / CELL)
    let best: number | null = null
    let bestD = Infinity
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const i of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = Math.hypot(data.x[i] * k + tx - sx, data.y[i] * k + ty - sy)
          const reach = Math.max(10, radius(i, k) * 1.3)
          if (d < reach && d < bestD) {
            best = i
            bestD = d
          }
        }
    return best
  }

  // Pointer handling: drag to pan, wheel or pinch to zoom, hover to inspect, click to watch.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const moved = useRef(0)
  const onPointerDown = (e: React.PointerEvent) => {
    canvas.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = 0
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect()
    const prev = pointers.current.get(e.pointerId)
    if (prev) {
      const all = [...pointers.current.values()]
      if (all.length === 2) {
        const other = all.find((p) => p !== prev)!
        const before = Math.hypot(prev.x - other.x, prev.y - other.y)
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y)
        if (before > 0) zoomAt((e.clientX + other.x) / 2 - rect.left, (e.clientY + other.y) / 2 - rect.top, after / before)
      } else {
        view.current.tx += e.clientX - prev.x
        view.current.ty += e.clientY - prev.y
        draw()
      }
      moved.current += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y)
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      return
    }
    const i = pick(e.clientX - rect.left, e.clientY - rect.top)
    if (i !== hoverRef.current) {
      hoverRef.current = i
      draw()
    }
    setHover(i === null ? null : { i, sx: e.clientX - rect.left, sy: e.clientY - rect.top })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (moved.current < 6) {
      const rect = canvas.current!.getBoundingClientRect()
      const i = pick(e.clientX - rect.left, e.clientY - rect.top)
      if (i !== null) {
        if (e.pointerType === 'mouse' || hoverRef.current === i) nav(`/watch/${cat.videos[i].v}`)
        else {
          // First tap on touch shows the card; a second tap opens the video.
          hoverRef.current = i
          setHover({ i, sx: e.clientX - rect.left, sy: e.clientY - rect.top })
          draw()
        }
      }
    }
  }

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = c.getBoundingClientRect()
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015))
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const w = c.clientWidth / 2
      const hh = c.clientHeight / 2
      if (e.key === '+' || e.key === '=') zoomAt(w, hh, 1.4)
      if (e.key === '-') zoomAt(w, hh, 1 / 1.4)
      if (e.key === '0') fit()
      const pan = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[e.key]
      if (pan) {
        e.preventDefault()
        view.current.tx += pan[0]
        view.current.ty += pan[1]
        draw()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      c.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const v = hover ? cat.videos[hover.i] : null
  const placed = data ? data.x.filter((x) => x >= 0).length : 0

  return (
    <main className="mapview">
      <canvas
        ref={canvas}
        className="map-canvas"
        role="img"
        aria-label={`Map of ${placed} videos grouped by topic. Brighter stars were recommended by more people.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (hoverRef.current !== null && pointers.current.size === 0) {
            setHover(null)
          }
        }}
      />
      <div className="map-legend">
        <h1>The constellation</h1>
        <p>
          {placed.toLocaleString()} videos, one star each, grouped by topic. Bigger and brighter means more people on HN recommended it; the top 1% glow
          orange. <span className="on-pointer">Hover a star to see what HN recommended alongside it.</span>
          <span className="on-touch">Tap a star for its card, tap again to watch. Pinch to zoom.</span>
        </p>
        <p className="map-keys">
          <span>
            <kbd>+</kbd> <kbd>-</kbd> zoom
          </span>
          <span>
            <kbd>0</kbd> fit
          </span>
          <span>drag to pan</span>
          <button className="linkish" onClick={() => fit()}>
            Show everything
          </button>
        </p>
      </div>
      {v && hover && (
        <div className="map-card" style={{ left: Math.min(hover.sx + 16, (canvas.current?.clientWidth ?? 0) - 300), top: Math.max(8, hover.sy - 20) }}>
          <img src={midFrame(v.v)} alt="" />
          <strong>{titleOf(v, h)}</strong>
          <span className="mc-meta">
            <Vouches n={v.n} />
            <span>{v.c}</span>
            {v.d > 0 && <span>{duration(v.d)}</span>}
          </span>
          {v.q && <span className="mc-quote">“{v.q}”</span>}
          <Link to={`/watch/${v.v}`} className="mc-open">
            Watch
          </Link>
        </div>
      )}
      <nav className="sr" aria-label="Topics on the map">
        {cat.topics.map((t) => (
          <Link key={t.id} to={`/topic/${t.slug}`}>
            {t.name}
          </Link>
        ))}
      </nav>
    </main>
  )
}
