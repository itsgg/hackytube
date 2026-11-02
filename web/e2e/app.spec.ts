import { expect, test, type Page } from '@playwright/test'

// Keep tests hermetic: no YouTube player, thumbnails or web fonts from the network.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())
})

const tiles = (page: Page) => page.locator('[data-tile]')

test('front page leads with a real recommendation and the ranking', async ({ page }) => {
  await page.goto('/')
  // The hero rotates daily among top videos that have a pull quote; whichever it is, it must read like one.
  await expect(page.locator('.hero-q p')).toHaveText(/\w{4,}/)
  await expect(page.locator('.hero-q footer')).toHaveText(/^\S+ in \d{4}, one of \d+ people on HN/)
  await expect(page.locator('.topten-list li')).toHaveCount(6)
  await expect(page.locator('.rank').first()).toHaveText('1')
})

test('search finds a video by what people said and opens it', async ({ page, isMobile }) => {
  await page.goto('/')
  await expect(page.locator('.hero-q')).toBeVisible() // shortcuts attach once the catalog has loaded
  if (isMobile) await page.getByRole('button', { name: /search/i }).click()
  else await page.keyboard.press('/')
  await page.getByPlaceholder(/search titles/i).fill('prescient')
  await expect(page.locator('.results li')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/watch\/CCCCCCCCCCC$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Birth & Death of JavaScript')
})

test('watch page explains why, with chapters, timeline and thread links', async ({ page }) => {
  await page.goto('/watch/AAAAAAAAAAA')
  await expect(page.getByRole('heading', { name: /Why 40 people on HN recommended it/ })).toBeVisible()
  await expect(page.locator('.comment')).toHaveCount(2)
  await expect(page.locator('.comment mark').first()).toHaveText('the most important computing demo ever given')
  await expect(page.locator('.comment a[href="https://example.org/notes"]')).toBeVisible()
  await expect(page.locator('.c-thread').first()).toContainText('512 points')
  await expect(page.getByRole('navigation', { name: 'Chapters' }).locator('li')).toHaveCount(3)
  await expect(page.locator('.tl-dot')).toHaveCount(2)
  await expect(page.locator('.c-seek')).toHaveText('▶ 7:00')
})

test('the uploader title is one click away from the DeArrow title', async ({ page }) => {
  await page.goto('/watch/AAAAAAAAAAA')
  const h1 = page.getByRole('heading', { level: 1 })
  await expect(h1).toHaveText(/Engelbart demos/)
  await page.getByRole('button', { name: /Uploader's title/ }).click()
  await expect(h1).toHaveText('The Mother of All Demos')
})

test('not interested and block channel remove videos everywhere, and settings undo it', async ({ page }) => {
  await page.goto('/watch/DDDDDDDDDDD')
  await page.getByRole('button', { name: 'Block BBC' }).click()
  await page.goto('/all')
  await expect(page.locator('[href="/watch/DDDDDDDDDDD"]')).toHaveCount(0)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Unblock' }).click()
  await page.goto('/all')
  await expect(page.locator('[href="/watch/DDDDDDDDDDD"]')).toHaveCount(1)
})

test('filters and sorts on the everything page', async ({ page }) => {
  await page.goto('/all')
  await expect(tiles(page)).toHaveCount(6)
  await page.getByRole('button', { name: 'Under 10 min' }).click()
  await expect(tiles(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Any length' }).click()
  await page.getByLabel('Sort').selectOption('newest')
  await expect(tiles(page).first()).toHaveAttribute('href', '/watch/EEEEEEEEEEE')
  await expect(page.getByRole('link', { name: /Play 6 on YouTube/ })).toHaveAttribute('href', /watch_videos\?video_ids=/)
})

test('topics, channels and years all lead to videos', async ({ page }) => {
  await page.goto('/topics')
  await page.getByRole('link', { name: /Physics/ }).click()
  await expect(tiles(page)).toHaveCount(2)
  await page.goto('/channel/infoq')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('InfoQ')
  await page.goto('/year/2015')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What HN was recommending in 2015')
})

test('watching shapes the For you shelf and history', async ({ page }) => {
  await page.goto('/watch/CCCCCCCCCCC')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Birth & Death of JavaScript') // visit recorded on render
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  await page.goto('/history')
  await expect(tiles(page)).toHaveCount(1)
})

test('dark theme setting applies and persists', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('keyboard shortcuts open help and surprise me', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcuts are a desktop feature')
  await page.goto('/')
  await expect(page.locator('.hero-q')).toBeVisible() // shortcuts attach once the catalog has loaded
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('r')
  await expect(page).toHaveURL(/\/watch\//)
})

test('no page scrolls sideways and none throws', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const path of ['/', '/all', '/topics', '/channels', '/watch/AAAAAAAAAAA', '/settings', '/saved', '/missing']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeAttached()
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
    expect(scroll, path).toBeLessThanOrEqual(width)
  }
  expect(errors).toEqual([])
})
