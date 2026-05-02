import { expect, test } from '@playwright/test'
import { login } from '../fixtures'

test('logs a weight and sees it reflected on the Weight tab', async ({ page }) => {
  await login(page)

  /* Trends tab → Weight sub-tab. */
  await page.getByRole('button', { name: /^Trends/ }).click()
  await page.getByRole('button', { name: 'Weight' }).click()

  /* Open the add-weight modal. */
  await page.getByRole('button', { name: '+ Add weight' }).click()

  /* WeightModal: weight (grams) input has placeholder "2400". */
  await page.getByPlaceholder('2400').fill('2480')
  await page.getByRole('button', { name: 'Save' }).click()

  /* Headline "Current weight" should now show 2480 — that bare number
   * lives in a div whose " g" sibling is a separate node, so search by
   * the number substring rather than 2480g as a single token. */
  await expect(page.getByText('Current weight')).toBeVisible()
  /* The history list shows "2480 g" combined as visible text on the row.
   * That's the cleanest assertion. */
  await expect(page.getByText(/2480\s*g/).first()).toBeVisible()
})
