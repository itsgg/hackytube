import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())
})

test('TV tunes to a channel, captions it with what HN said, and surfs', async ({ page, isMobile }) => {
  await page.goto('/tv/1')
  await expect(page.locator('.tv-bug')).toContainText('Programming languages')
  await expect(page.locator('.tv-title')).toContainText('left on air')
  await expect(page.locator('.topbar')).toHaveCount(0) // lean-back: no site chrome
  if (isMobile) await page.getByRole('button', { name: 'Next channel' }).click()
  else await page.keyboard.press('ArrowUp')
  await expect(page).toHaveURL(/\/tv\/2$/)
  await page.getByRole('button', { name: 'Guide' }).click()
  await expect(page.getByRole('dialog', { name: 'Channel guide' }).locator('li')).toHaveCount(4)
})

test('the map draws every placed video and opens a card on hover', async ({ page, isMobile }) => {
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: 'The constellation' })).toBeVisible()
  await expect(page.locator('canvas.map-canvas')).toHaveAttribute('aria-label', /Map of 6 videos/)
  test.skip(isMobile, 'hover is a pointer feature')
  const box = (await page.locator('canvas.map-canvas').boundingBox())!
  // The fixture's top video sits at the centre of the fitted map.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('.map-card')).toContainText('Engelbart demos the mouse')
})

test('trends lead with the biggest mover and offer a table', async ({ page }) => {
  await page.goto('/trends')
  await expect(page.locator('.trend-lede')).toContainText('Programming languages went from 16.7% of the videos HN recommended in its early years to 50.0%')
  await expect(page.locator('.spark')).toHaveCount(3)
  await page.getByRole('button', { name: 'Show as a table' }).click()
  await expect(page.locator('.trend-table tbody tr')).toHaveCount(3)
})

test('six degrees shows the chain and the thread behind each hop', async ({ page }) => {
  await page.goto('/path?from=BBBBBBBBBBB&to=CCCCCCCCCCC')
  await expect(page.locator('.degrees')).toHaveText('2 degrees apart')
  await expect(page.locator('.chain > li')).toHaveCount(3)
  await expect(page.locator('.hop').first()).toContainText('recommended in')
})

test('threads turn into playlists', async ({ page }) => {
  await page.goto('/threads')
  await page.getByRole('link', { name: /Ask HN: best talks/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ask HN: best talks?')
  await expect(page.locator('[data-tile]')).toHaveCount(3)
  await expect(page.getByRole('link', { name: 'Play 3 on YouTube' })).toBeVisible()
})

test('time budget suggests videos that fit', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '10 minutes' }).click()
  await expect(page.locator('.budget-picks [data-tile]')).toHaveCount(1) // only the 7:50 Feynman clip fits
})

test('wide screens keep paragraphs readable', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a desktop-width check')
  await page.setViewportSize({ width: 2400, height: 1000 })
  for (const path of ['/', '/path', '/trends', '/threads', '/topics', '/channels', '/settings', '/all']) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeAttached()
    // Any paragraph with a sentence or more of text must get at least a few words per line.
    const squeezed = await page.evaluate(() =>
      [...document.querySelectorAll('main p')]
        .filter((p) => (p.textContent ?? '').length > 60 && p.getBoundingClientRect().width > 0)
        .filter((p) => p.getBoundingClientRect().width - parseFloat(getComputedStyle(p).paddingLeft) - parseFloat(getComputedStyle(p).paddingRight) < 260)
        .map((p) => (p.textContent ?? '').slice(0, 40)),
    )
    expect(squeezed, path).toEqual([])
  }
})
