import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Catalog } from './data'
import { computeTrends, type Trend, type TrendData } from './views'

const pct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`
const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} pts`

function Spark({ t, years, full }: { t: Trend; years: number[]; full: number }) {
  const [at, setAt] = useState<number | null>(null)
  const W = 260
  const H = 72
  const pad = { l: 2, r: 2, t: 8, b: 16 }
  const max = Math.max(...t.share, 0.0001)
  const x = (k: number) => pad.l + (k / (years.length - 1)) * (W - pad.l - pad.r)
  const y = (s: number) => pad.t + (1 - s / max) * (H - pad.t - pad.b)
  const solid = t.share.slice(0, full)
  const line = solid.map((s, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(s).toFixed(1)}`).join('')
  const area = `${line}L${x(solid.length - 1).toFixed(1)},${H - pad.b}L${x(0).toFixed(1)},${H - pad.b}Z`
  const tail = full < years.length ? `M${x(full - 1)},${y(t.share[full - 1])}L${x(full)},${y(t.share[full])}` : ''
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const k = Math.round(((e.clientX - r.left) / r.width) * (W / (W - pad.l - pad.r)) * (years.length - 1))
    setAt(Math.max(0, Math.min(years.length - 1, k)))
  }
  return (
    <figure className="spark">
      <figcaption>
        <Link to={`/topic/${t.slug}`}>{t.name}</Link>
        <span className={`delta ${t.delta >= 0 ? 'up' : 'down'}`}>{pts(t.delta)}</span>
        <span className="peak">peak {pct(max)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setAt(null)} role="img" aria-label={`${t.name}: ${pct(t.early)} of recommendations early on, ${pct(t.recent)} in the last five years`}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="sp-axis" />
        <path d={area} className="sp-area" />
        <path d={line} className="sp-line" />
        {tail && <path d={tail} className="sp-line partial" />}
        <text x={pad.l} y={H - 3} className="sp-tick">
          {years[0]}
        </text>
        <text x={W - pad.r} y={H - 3} className="sp-tick" textAnchor="end">
          {years[years.length - 1]}
        </text>
        {at !== null && (
          <g>
            <line x1={x(at)} x2={x(at)} y1={pad.t} y2={H - pad.b} className="sp-cross" />
            <circle cx={x(at)} cy={y(t.share[at])} r={4} className="sp-dot" />
          </g>
        )}
      </svg>
      {at !== null && (
        <div className="sp-tip" style={{ left: `${(x(at) / W) * 100}%` }}>
          <strong>{years[at]}</strong> {pct(t.share[at])} of recommendations, {t.counts[at].toLocaleString()} comments
          {at >= full ? ' (year so far)' : ''}
        </div>
      )}
    </figure>
  )
}

export default function Trends({ cat }: { cat: Catalog }) {
  const [data, setData] = useState<TrendData | null>(null)
  const [table, setTable] = useState(false)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/trends.json`)
      .then((r) => r.json())
      .then(setData)
  }, [])
  const result = useMemo(() => (data ? computeTrends(cat, data) : null), [cat, data])
  if (!data || !result) return <main className="browse"><p className="loading empty-note">Loading trends</p></main>
  const { trends, full, partial, years } = result
  const up = trends[0]
  const down = trends[trends.length - 1]
  const recentFrom = years[Math.max(0, full - 5)]
  const recentTo = years[full - 1]

  return (
    <main className="browse trends">
      <header className="browse-head">
        <h1>How HN's taste moved</h1>
        <button className="pill" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? 'Show charts' : 'Show as a table'}
        </button>
      </header>
      <p className="trend-lede">
        <strong>{up.name}</strong> went from {pct(up.early)} of the videos HN recommended in its early years to {pct(up.recent)} in {recentFrom} to {recentTo}.{' '}
        <strong>{down.name}</strong> moved the other way, from {pct(down.early)} to {pct(down.recent)}.
      </p>
      <p className="trend-note">
        Each line is a topic's share of that year's recommending comments, so HN's own growth doesn't count as interest. Topics are sorted from rising to
        fading; each chart is scaled to its own peak.{partial ? ` ${years[years.length - 1]} is dashed because the year isn't over.` : ''} Charts start in {years[0]}, the first year with enough recommendations to read.
      </p>
      {table ? (
        <div className="trend-table-wrap">
          <table className="trend-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Early share</th>
                <th>
                  {recentFrom} to {recentTo}
                </th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {trends.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/topic/${t.slug}`}>{t.name}</Link>
                  </td>
                  <td>{pct(t.early)}</td>
                  <td>{pct(t.recent)}</td>
                  <td>{pts(t.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="spark-grid">
          {trends.map((t) => (
            <Spark key={t.id} t={t} years={years} full={full} />
          ))}
        </div>
      )}
    </main>
  )
}
