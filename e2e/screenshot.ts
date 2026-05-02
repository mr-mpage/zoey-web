/**
 * Ad-hoc screenshot tool. Boots the same backend the E2E suite uses
 * (./e2e/serve.sh on port 8081 with test passcode 9999), logs in, and
 * captures the routes you list as PNGs under e2e/screenshots/.
 *
 *   npx tsx e2e/screenshot.ts                  # full set
 *   npx tsx e2e/screenshot.ts today overview   # just these
 *
 * Captures cover the five top-level tabs (today, overview, trends, meds,
 * settings) plus the three Trends sub-tabs (pumps, weight, vitals).
 */

import { chromium, devices } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE_URL = process.env.ZOEY_URL ?? process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:8081'
const PASSCODE = process.env.ZOEY_PASSCODE ?? process.env.SCREENSHOT_PASSCODE ?? '9999'
const OUT_DIR = path.resolve(process.cwd(), 'e2e/screenshots')

/** Per-shot navigation:
 *   - parent: top-level nav tab to click
 *   - subtab: optional Trends sub-tab to click after parent
 *   - ready:  text marker that only appears once data has rendered
 *             (TanStack Query's idle state precedes render by a few frames). */
type Capture = { parent: RegExp; subtab?: RegExp; ready: RegExp }

const CAPTURES: Record<string, Capture> = {
  today: { parent: /^Today/, ready: /ml today/ },
  overview: { parent: /^Overview/, ready: /How is .* doing\?/ },
  trends: { parent: /^Trends/, ready: /\d+\s+ml\/kg\/day|No feeds logged yet/ },
  meds: { parent: /^Meds/, ready: /^TODAY$/ },
  settings: { parent: /^Settings/, ready: /^Settings$/ },
  pumps: { parent: /^Trends/, subtab: /^Pumps$/, ready: /Supply vs intake|No pumps logged yet/ },
  weight: { parent: /^Trends/, subtab: /^Weight$/, ready: /Weight history/ },
  vitals: {
    parent: /^Trends/,
    subtab: /^Vitals$/,
    ready: /Heart rate|Vitals integration not configured|Waiting for first readings/,
  },
}

async function main() {
  const requested = process.argv.slice(2)
  const tabs = requested.length ? requested : Object.keys(CAPTURES)
  const unknown = tabs.filter((t) => !(t in CAPTURES))
  if (unknown.length) {
    console.error(`unknown tab(s): ${unknown.join(', ')}`)
    console.error(`valid: ${Object.keys(CAPTURES).join(', ')}`)
    process.exit(1)
  }

  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const context = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await context.newPage()

  await page.goto(BASE_URL)
  for (const digit of PASSCODE) {
    await page.getByRole('button', { name: `Digit ${digit}` }).click()
  }
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: /^Overview/ }).waitFor()

  for (const tab of tabs) {
    const cap = CAPTURES[tab]
    await page.getByRole('button', { name: cap.parent }).click()
    await page.waitForLoadState('networkidle')
    if (cap.subtab) {
      await page.getByRole('button', { name: cap.subtab }).click()
      await page.waitForLoadState('networkidle')
    }
    await page.getByText(cap.ready).first().waitFor({ timeout: 8_000 })
    /* Tab buttons use a Tailwind `transition` (~150ms) on the active-state
     * background fill; let it settle so the highlighted tab in the
     * screenshot actually matches the rendered content. */
    await page.waitForTimeout(250)
    const out = path.join(OUT_DIR, `${tab}.png`)
    await page.screenshot({ path: out, fullPage: false })
    console.log(`✓ ${tab} → ${path.relative(process.cwd(), out)}`)
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
