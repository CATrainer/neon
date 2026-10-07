/**
 * Screenshot the running dev server, driving the copy of Edge that ships with
 * Windows so nothing has to be downloaded.
 *
 *   node scripts/shot.mjs filament 1440 900
 *   node scripts/shot.mjs filament 1440 900 evidence
 *
 * Actions: evidence | list | ready  (anything else = the resting state)
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const [, , direction = 'filament', w = '1440', h = '900', action = ''] = process.argv
const out = process.env.SHOT_DIR ?? './.shots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 2,
})
await page.goto(`http://localhost:5173/?bare=1#${direction}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)

if (action === 'evidence') {
  await page.getByText('Why it failed').click()
  await page.waitForTimeout(600)
} else if (action === 'list') {
  await page.getByText(/All \d+ work orders/).click()
  await page.waitForTimeout(600)
} else if (action === 'repos' || action === 'plugin' || action === 'done') {
  const clicks = { repos: 2, plugin: 3, done: 4 }[action]
  const labels = ['Continue with GitHub', /^Register \d+/, 'I have run it']
  await page.getByText(labels[0]).click()
  await page.getByText('Install on meridianops').click()
  if (clicks > 2) await page.getByText(labels[1]).click()
  if (clicks > 3) await page.getByText(labels[2]).click()
  await page.waitForTimeout(600)
} else if (action === 'ready') {
  // Focus a ready, unclaimed bead so the hero shows the claim path.
  await page.getByRole('button', { name: /^DSP-424/ }).first().focus()
  await page.waitForTimeout(600)
}

const slug = direction.replace(/[^a-zA-Z0-9]+/g, '-')
const file = `${out}/${slug}-${w}x${h}${action ? `-${action}` : ''}.png`
await page.screenshot({ path: file, fullPage: process.env.SHOT_FULL === '1' })
console.log(file)
await browser.close()
