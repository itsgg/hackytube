import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { channelSlug } from './data'
import { defaults, forget, setPref, toggleBlocked, useHistory, type Prefs, type State } from './history'

function Choice<K extends keyof Prefs>({ k, label, options }: { k: K; label: string; options: [Prefs[K], string][] }) {
  const h = useHistory()
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([value, text]) => (
          <button key={value} aria-pressed={h.prefs[k] === value} onClick={() => setPref(k, value)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Settings() {
  const h = useHistory()
  const file = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const blocked = Object.keys(h.blocked).sort((a, b) => a.localeCompare(b))

  const exportData = () => {
    const blob = new Blob([JSON.stringify(h, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'hackytube-history.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importData = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text()) as Partial<State>
      const merged = { ...defaults, ...h }
      for (const key of ['watched', 'saved', 'hidden', 'blocked'] as const) merged[key] = { ...h[key], ...(raw[key] ?? {}) }
      localStorage.setItem('hackytube.v1', JSON.stringify(merged))
      location.reload()
    } catch {
      setNote('That file is not a hackytube export. Choose the hackytube-history.json file you exported.')
    }
  }

  return (
    <main className="browse settings">
      <header className="browse-head">
        <h1>Settings</h1>
      </header>
      <section className="settings-body">
        <Choice k="theme" label="Theme" options={[['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']]} />
        <Choice k="titles" label="Titles" options={[['dearrow', 'DeArrow, when voted'], ['original', "Uploader's"]]} />
        <Choice k="thumbs" label="Thumbnails" options={[['middle', 'Frame from the middle'], ['original', "Uploader's"]]} />

        <div className="setting col">
          <span className="setting-label">Blocked channels</span>
          {blocked.length === 0 ? (
            <p className="empty-note flush">None. Block a channel from any of its videos and it leaves every shelf.</p>
          ) : (
            <ul className="blocked-list">
              {blocked.map((c) => (
                <li key={c}>
                  <Link to={`/channel/${channelSlug(c)}`}>{c}</Link>
                  <button className="linkish" onClick={() => toggleBlocked(c)}>
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="setting col">
          <span className="setting-label">Your data</span>
          <p className="empty-note flush">
            {Object.keys(h.watched).length} watched, {Object.keys(h.saved).length} saved, {Object.keys(h.hidden).length} hidden. It all stays in this
            browser. Move it to another device with a file.
          </p>
          <div className="row">
            <button className="pill" onClick={exportData}>
              Export
            </button>
            <button className="pill" onClick={() => file.current?.click()}>
              Import
            </button>
            <button className="pill" onClick={forget}>
              Clear history and saved
            </button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </div>
          {note && <p className="error">{note}</p>}
        </div>
      </section>
    </main>
  )
}
