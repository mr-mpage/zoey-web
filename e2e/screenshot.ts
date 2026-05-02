/**
 * Ad-hoc screenshot tool. Boots the same backend the E2E suite uses
 * (./e2e/serve.sh on port 8081 with test passcode 9999), logs in, and
 * captures the routes you list as PNGs under e2e/screenshots/.
 *
 *   npx tsx e2e/screenshot.ts                  # full set
 *   npx tsx e2e/screenshot.ts today overview   # just these
 *
 * Routes are tab names ('today' | 'overview' | 'trends' | 'meds' |
 * 'settings'); the script clicks the matching tab button and waits for
 * a network-idle moment before snapping. Use this when you need to see
 * the rendered UI without firing up the dev server by hand.
 */

import { chromium, devices } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE_URL = process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:8081'
const PASSCODE = process.env.SCREENSHOT_PASSCODE ?? '9999'
const OUT_DIR = path.resolve(process.cwd(), 'e2e/screenshots')

const TAB_LABELS: Record<string, RegExp> = {
  today: /^Today/,
  overview: /^Overview/,
  trends: /^Trends/,
  meds: /^Meds/,
  settings: /^Settings/,
}

/** Per-tab marker that only appears once the screen has finished
 *  fetching + rendering. Without this the screenshot fires while
 *  'Loading…' is still on screen, because TanStack Query's idle
 *  state precedes the data render by a few frames. Markers picked
 *  to be above-the-fold so they're in the visible viewport. */
const READY_MARKERS: Record<string, RegExp> = {
  today: /ml today/,
  overview: /How is .* doing\?/,
  trends: /\d+\s+ml\/kg\/day|No feeds logged yet/,
  meds: /^TODAY$/,
  settings: /^Settings$/,
}

async function main() {
  const requested = process.argv.slice(2)
  const tabs = requested.length ? requested : Object.keys(TAB_LABELS)
  const unknown = tabs.filter((t) => !(t in TAB_LABELS))
  if (unknown.length) {
    console.error(`unknown tab(s): ${unknown.join(', ')}`)
    console.error(`valid: ${Object.keys(TAB_LABELS).join(', ')}`)
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
    await page.getByRole('button', { name: TAB_LABELS[tab] }).click()
    await page.waitForLoadState('networkidle')
    /* Wait for tab-specific content; networkidle fires before TanStack
     * Query's data render lands. */
    await page.getByText(READY_MARKERS[tab]).first().waitFor({ timeout: 8_000 })
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
