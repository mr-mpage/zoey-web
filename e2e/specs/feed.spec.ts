import { expect, test } from '@playwright/test'
import { login, PASSCODE } from '../fixtures'

test('logs a feed via the API and sees it on Today after refresh', async ({ page, request }) => {
  await login(page)

  /* The Save button is disabled when the suggested amount is 0, which
   * is the case on a fresh DB with no weight set. Driving the React-
   * controlled slider via JS doesn't trigger the change handler, so
   * we'd need a chain of "+" clicks; cleaner to POST through the API
   * (cookie carries over from the page session) and verify the UI
   * picks it up. The flow being verified is: feed -> render. */
  const cookies = await page.context().cookies()
  const sessionCookie = cookies.find((c) => c.name === 'zoey_session')
  expect(sessionCookie, 'session cookie should be set after login').toBeTruthy()

  const r = await request.post('/api/feeds', {
    data: { amount_ml: 60 },
    headers: { Cookie: `zoey_session=${sessionCookie!.value}` },
  })
  expect(r.status()).toBe(201)

  /* Reload to pick up the new feed via the dashboard query. */
  await page.reload()
  await expect(page.getByText("TODAY'S FEEDS")).toBeVisible()
  /* The feed row shows "60 ml" along with comparison/time metadata. */
  await expect(page.getByText(/\b60 ml\b/).first()).toBeVisible()
})

test('+ Feed button opens the log-feed modal', async ({ page }) => {
  /* UI smoke: a real user would tap this; we only verify the modal
   * opens. Saving from the modal needs a non-zero suggested amount,
   * which requires a logged weight — covered by the API path above. */
  await login(page)
  await page.getByRole('button', { name: /\+ Feed/ }).click()
  await expect(page.getByText('Log feed')).toBeVisible()
})
