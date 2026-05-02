/**
 * Seed a demo DB with realistic feeds + weights + diapers so the
 * README screenshots show a populated app rather than the empty
 * first-run state. Talks to the same backend the screenshot tool
 * uses (./e2e/serve.sh on :8081, passcode 9999).
 *
 *   npx tsx e2e/seed-demo.ts
 *
 * Idempotent-ish: appends; if the DB already has data the new rows
 * stack on top. Use a fresh DB (kill+restart serve.sh) if you want a
 * clean slate.
 */

import { chromium } from '@playwright/test'

const BASE_URL = process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:8081'
const PASSCODE = process.env.SCREENSHOT_PASSCODE ?? '9999'

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

  /* Set sensible birth context first so the PMA/age-aware bands
   * have something realistic to chew on. 35w preterm, 17 days ago,
   * 2455 g birth weight — typical numbers a viewer would recognise. */
  const today = new Date()
  const birth = new Date(today.getTime() - 17 * 86_400_000)
  const birthIso = birth.toISOString().slice(0, 10)
  await ctx.patch(`${BASE_URL}/api/settings`, {
    data: {
      birth_date: birthIso,
      gestational_age_weeks: 35,
      birth_weight_grams: 2455,
    },
  })

  /* Two manual weights so the auto-fill regenerator has a slope to
   * extrapolate from; the rest of the days fill in automatically. */
  const earlierWeight = await ctx.post(BASE_URL + '/api/weight', {
    data: { weight_grams: 2280, ml_per_kg_per_day: 160, notes: 'imported from medical records' },
  })
  if (!earlierWeight.ok()) throw new Error(`earlier weight failed: ${earlierWeight.status()}`)

  /* Backdate the first weight by patching its recorded_at (POST always
   * uses now). */
  const earlier = await earlierWeight.json()
  const earlierAt = new Date(today.getTime() - 9 * 86_400_000).toISOString()
  await ctx.patch(`${BASE_URL}/api/weight/${earlier.id}`, { data: { recorded_at: earlierAt } })

  await ctx.post(BASE_URL + '/api/weight', {
    data: { weight_grams: 2480, ml_per_kg_per_day: 160, notes: 'morning weigh-in' },
  })

  /* Today's feeds — a typical day pattern of ~50 ml every 3 hours
   * starting at 04:00, ending at 13:00 (so the day is in progress and
   * the progress ring + next-feed card both have something to show). */
  const feedTimes = [
    [4, 30, 45], [7, 35, 60], [10, 30, 55], [13, 25, 60],
  ]
  for (const [h, m, ml] of feedTimes) {
    const at = new Date()
    at.setHours(h, m, 0, 0)
    if (at > today) at.setDate(at.getDate() - 1)
    await ctx.post(BASE_URL + '/api/feeds', {
      data: { amount_ml: ml, fed_at: at.toISOString(), method: 'bottle' },
    })
  }

  /* A handful of diapers so the Today counters aren't all zero. */
  for (const [h, m, kind] of [[5, 0, 'wet'], [8, 0, 'wet'], [11, 0, 'wet'], [9, 0, 'dirty']] as const) {
    const at = new Date()
    at.setHours(h, m, 0, 0)
    if (at > today) at.setDate(at.getDate() - 1)
    await ctx.post(BASE_URL + '/api/diapers', { data: { kind, recorded_at: at.toISOString() } })
  }

  /* A few pumps for the supply chart. */
  for (let day = 0; day < 7; day++) {
    for (const [h, m, ml] of [[6, 0, 90], [12, 0, 75], [18, 0, 80], [22, 0, 70]] as const) {
      const at = new Date(today.getTime() - day * 86_400_000)
      at.setHours(h, m, 0, 0)
      await ctx.post(BASE_URL + '/api/pumps', { data: { amount_ml: ml, pumped_at: at.toISOString() } })
    }
  }

  /* Backdate feeds across the last 7 days too so per-feed-of-day
   * comparisons have history. */
  for (let day = 1; day <= 7; day++) {
    for (const [h, m, ml] of feedTimes) {
      const at = new Date(today.getTime() - day * 86_400_000)
      at.setHours(h, m, 0, 0)
      await ctx.post(BASE_URL + '/api/feeds', { data: { amount_ml: ml + Math.round((Math.random() - 0.5) * 8), fed_at: at.toISOString(), method: 'bottle' } })
    }
  }

  console.log('demo seed: ok')
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
