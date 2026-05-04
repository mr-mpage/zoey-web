/**
 * Seed a deployment with realistic *thriving* preterm-baby data:
 * 21 days of birth context, weights, feeds, pumps, and diapers tuned
 * so all three Overview indicators land in 'good', the trends headline
 * reads 'solidly in target zone', and the Today pace chip shows
 * on-track.
 *
 * Two use cases:
 *
 *   1. Fresh-deployment evaluation — fill an empty install so you can
 *      poke around with realistic numbers:
 *
 *        ZOEY_URL=http://127.0.0.1:18087 \
 *        ZOEY_PASSCODE=123456 \
 *            npx tsx e2e/seed-demo.ts
 *
 *      Add `ZOEY_DB_PATH=<path-to-zoey.db>` if you also want vitals
 *      seeded (the Vitals tab pulls from raw rows that have no API).
 *
 *   2. README screenshots — `./e2e/serve.sh` boots the bundled e2e
 *      backend on :8081 with passcode 9999, which the script also
 *      defaults to (legacy `SCREENSHOT_URL`/`SCREENSHOT_PASSCODE` env
 *      vars are still honoured for the existing pipeline).
 *
 * Not idempotent: re-running stacks duplicate rows. Use a fresh DB.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const BASE_URL = process.env.ZOEY_URL ?? process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:8081'
const PASSCODE = process.env.ZOEY_PASSCODE ?? process.env.SCREENSHOT_PASSCODE ?? '9999'
const DB_SENTINEL = '/tmp/zoey-e2e-db.path'
const HERE = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  /* Drive everything through a Page so Secure cookies set by the login
   * endpoint are accepted and replayed on subsequent requests — a bare
   * APIRequestContext over HTTP drops Secure cookies and every write
   * route 401s. page.request inherits the page's cookie jar. */
  const browser = await chromium.launch()
  const browserCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await browserCtx.newPage()
  await page.goto(BASE_URL)
  for (const digit of PASSCODE) {
    await page.getByRole('button', { name: `Digit ${digit}` }).click()
  }
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: /^Overview/ }).waitFor()

  /* The login cookie has Secure=true; over http://localhost playwright
   * stores it but won't auto-send it on subsequent requests. Pull it
   * out and pass as an explicit header. */
  const cookies = await browserCtx.cookies()
  const session = cookies.find((c) => c.name === 'zoey_session')
  if (!session) throw new Error('no session cookie after login')
  const headers = { Cookie: `zoey_session=${session.value}` }
  const ctxRaw = page.request
  const ctx = {
    post: (url: string, opts: { data: unknown }) => ctxRaw.post(url, { ...opts, headers }),
    patch: (url: string, opts: { data: unknown }) => ctxRaw.patch(url, { ...opts, headers }),
  }

  /* Birth context — 35w preterm 21 days ago (PMA ≈ 38w, expected
   * gain band 12–17 g/kg/day). Numbers a viewer recognises as
   * "preterm but doing well". */
  const today = new Date()
  const birth = new Date(today.getTime() - 21 * 86_400_000)
  const birthIso = birth.toISOString().slice(0, 10)
  await ctx.patch(`${BASE_URL}/api/settings`, {
    data: {
      birth_date: birthIso,
      gestational_age_weeks: 35,
      birth_weight_grams: 2455,
    },
  })

  /* Weight trajectory aimed so the trailing 7-day gain rate lands at
   * ~12 g/kg/day — solidly inside the 10–15 band the app expects at
   * PMA 38w, so the Overview growth indicator reads 'On track' rather
   * than 'watch'. The auto-fill regenerator interpolates the days
   * between for the headline 'estimated' display. */
  type W = { grams: number; daysAgo: number; notes: string }
  const weights: W[] = [
    { grams: 2680, daysAgo: 14, notes: 'discharge weigh-in' },
    { grams: 2880, daysAgo: 7, notes: 'one-week check' },
    { grams: 3140, daysAgo: 0, notes: 'morning weigh-in' },
  ]
  for (const w of weights) {
    const r = await ctx.post(BASE_URL + '/api/weight', {
      data: { weight_grams: w.grams, ml_per_kg_per_day: 165, notes: w.notes },
    })
    if (!r.ok()) throw new Error(`weight ${w.grams} failed: ${r.status()}`)
    /* Backdate non-today rows. */
    if (w.daysAgo > 0) {
      const id = (await r.json()).id
      const at = new Date(today.getTime() - w.daysAgo * 86_400_000)
      at.setHours(9, 0, 0, 0)
      await ctx.patch(`${BASE_URL}/api/weight/${id}`, { data: { recorded_at: at.toISOString() } })
    }
  }

  /* Daily feed schedule: 8 feeds q3h. Per-feed volume scales with
   * weight so the headline ml/kg/day stays flat as Zoey grows —
   * otherwise the trends-tab narrative reads "trending down" purely
   * because the kg denominator is increasing. Helper picks a base
   * volume from the day's interpolated weight to keep ~165
   * ml/kg/day. */
  /* All eight feeds within the same feeding day (anchor 02:30) — a
   * 00:00 feed would bucket into the *previous* feeding day, leaving
   * each historical day with 7 feeds and pulling the trends sparkline
   * down ~10 ml/kg/day vs. the no-rollover days. The 23:30 slot keeps
   * everything in one bucket. */
  const baseHours: Array<[number, number]> = [
    [3, 0], [6, 0], [9, 0], [12, 0], [15, 0], [18, 0], [21, 0], [23, 30],
  ]
  function feedsForDay(daysAgo: number): Array<[number, number, number]> {
    /* Linear interp between known weights for the per-feed kg. */
    const points = [
      { daysAgo: 21, kg: 2.455 },
      { daysAgo: 14, kg: 2.680 },
      { daysAgo: 7, kg: 2.880 },
      { daysAgo: 0, kg: 3.140 },
    ]
    let kg = points[points.length - 1].kg
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1]
      if (daysAgo <= a.daysAgo && daysAgo >= b.daysAgo) {
        const t = (a.daysAgo - daysAgo) / (a.daysAgo - b.daysAgo)
        kg = a.kg + (b.kg - a.kg) * t
        break
      }
    }
    const dailyMl = 165 * kg
    const perFeed = Math.round(dailyMl / 8)
    return baseHours.map(([h, m]) => [h, m, perFeed])
  }
  const fullDay = feedsForDay(0)

  /* Today: only the early-morning + mid-day feeds done so the
   * progress ring is partway and the 'next feed' card has work to
   * show. Picking the four feeds that land before ~13:30. */
  const todayFeeds = fullDay.filter(([h]) => h >= 3 && h <= 12)
  for (const [h, m, ml] of todayFeeds) {
    const at = new Date()
    at.setHours(h, m, 0, 0)
    if (at > today) at.setDate(at.getDate() - 1)
    await ctx.post(BASE_URL + '/api/feeds', {
      data: { amount_ml: ml, fed_at: at.toISOString(), method: 'bottle' },
    })
  }

  /* Diapers — 7 wet + 2 dirty so far today (well above the 6-wet
   * hydration floor the Overview indicator looks for). */
  const todayDiapers: Array<[number, number, 'wet' | 'dirty']> = [
    [3, 30, 'wet'], [5, 0, 'wet'], [6, 30, 'wet'], [8, 0, 'dirty'],
    [9, 30, 'wet'], [11, 0, 'wet'], [11, 30, 'dirty'], [12, 30, 'wet'], [13, 0, 'wet'],
  ]
  for (const [h, m, kind] of todayDiapers) {
    const at = new Date()
    at.setHours(h, m, 0, 0)
    if (at > today) at.setDate(at.getDate() - 1)
    await ctx.post(BASE_URL + '/api/diapers', { data: { kind, recorded_at: at.toISOString() } })
  }

  /* Pumps — 5/day, total ~520 ml so the supply chart trends near
   * intake (slightly above, building a small reserve). */
  for (let day = 0; day < 14; day++) {
    for (const [h, m, ml] of [[6, 0, 110], [10, 0, 100], [14, 0, 105], [19, 0, 110], [23, 0, 95]] as const) {
      const at = new Date(today.getTime() - day * 86_400_000)
      at.setHours(h, m, 0, 0)
      await ctx.post(BASE_URL + '/api/pumps', { data: { amount_ml: ml, pumped_at: at.toISOString() } })
    }
  }

  /* Backdate the full 8-feed schedule across the last 14 days so the
   * Trends grid + per-feed-of-day comparisons + sparkline all have
   * history. Per-feed volume is sized for that day's weight so
   * ml/kg/day stays flat. Small random jitter so the grid doesn't
   * read as obviously synthetic. */
  for (let day = 1; day <= 14; day++) {
    const daySchedule = feedsForDay(day)
    for (const [h, m, ml] of daySchedule) {
      const at = new Date(today.getTime() - day * 86_400_000)
      at.setHours(h, m, 0, 0)
      /* No jitter: small day-over-day fluctuations push the
       * trends-tab "trending down" detector over its 5 ml/kg/day
       * threshold even when the underlying schedule is flat. */
      await ctx.post(BASE_URL + '/api/feeds', {
        data: { amount_ml: ml, fed_at: at.toISOString(), method: 'bottle' },
      })
    }
  }

  /* Diapers across the last 14 days too — 8 wet + 3 dirty, tilted
   * toward 'in target' for the Hydration indicator. */
  for (let day = 1; day <= 14; day++) {
    const pattern: Array<[number, number, 'wet' | 'dirty']> = [
      [3, 30, 'wet'], [6, 0, 'wet'], [8, 0, 'dirty'], [9, 30, 'wet'],
      [12, 0, 'wet'], [14, 30, 'wet'], [16, 0, 'dirty'], [18, 0, 'wet'],
      [20, 30, 'wet'], [23, 0, 'dirty'], [1, 0, 'wet'],
    ]
    for (const [h, m, kind] of pattern) {
      const at = new Date(today.getTime() - day * 86_400_000)
      at.setHours(h, m, 0, 0)
      await ctx.post(BASE_URL + '/api/diapers', { data: { kind, recorded_at: at.toISOString() } })
    }
  }

  /* Vitals — there's no API for inserting raw samples (the Owlet poller
   * writes them in production), so shell out to a Python helper that
   * does it via direct sqlite3. Need the DB path: prefer an explicit
   * ZOEY_DB_PATH override (fresh-deployment use case), fall back to
   * the e2e harness sentinel, otherwise skip cleanly. */
  const dbPath = process.env.ZOEY_DB_PATH
    ?? (existsSync(DB_SENTINEL) ? readFileSync(DB_SENTINEL, 'utf8').trim() : null)
  if (dbPath) {
    const repoRoot = path.resolve(HERE, '..')
    const py = path.join(repoRoot, '.venv', 'bin', 'python')
    const script = path.join(HERE, 'seed-vitals.py')
    execFileSync(py, [script], { env: { ...process.env, DB_PATH: dbPath }, stdio: 'inherit' })
  } else {
    console.warn('vitals seed: skipped (set ZOEY_DB_PATH to seed vitals, or run via ./e2e/serve.sh)')
  }

  console.log('demo seed: ok')
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
