import { defineConfig, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { details, topics, videos } from './test/fixture'

// Write the fixture catalog where the dev server will serve it from, before the server starts.
const pub = join(import.meta.dirname, 'e2e', '.public')
mkdirSync(join(pub, 'data', 'v'), { recursive: true })
writeFileSync(join(pub, 'data', 'catalog.json'), JSON.stringify({ topics, videos, built: '2026-11-01' }))
const shards: Record<string, Record<string, unknown>> = {}
for (const v of videos) {
  const key = v.v.charCodeAt(0).toString(16) + v.v.charCodeAt(1).toString(16)
  ;(shards[key] ??= {})[v.v] = details[v.v] ?? { vouches: [], chapters: [] }
}
for (const [k, s] of Object.entries(shards)) writeFileSync(join(pub, 'data', 'v', `${k}.json`), JSON.stringify(s))

const port = 5181
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite',
    env: { HACKYTUBE_PUBLIC: pub, PORT: String(port) },
    url: `http://127.0.0.1:${port}/data/catalog.json`,
    reuseExistingServer: false,
  },
})
