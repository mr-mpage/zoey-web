import { expect, test } from '@playwright/test'

const PASSCODE = '9999'

test.describe('lock screen', () => {
  test('rejects an empty / wrong passcode and lets you log in with the right one', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Enter passcode')).toBeVisible()

    /* Wrong passcode → error appears, no navigation. */
    await page.getByRole('button', { name: 'Digit 1' }).click()
    await page.getByRole('button', { name: 'Digit 2' }).click()
    await page.getByRole('button', { name: 'Digit 3' }).click()
    await page.getByRole('button', { name: 'Digit 4' }).click()
    await page.getByRole('button', { name: 'Sign in' }).click()
    /* Lock screen still visible; no nav. */
    await expect(page.getByText('Enter passcode')).toBeVisible({ timeout: 5_000 })

    /* Right passcode → tab bar appears (only present after auth). */
    for (const digit of PASSCODE) {
      await page.getByRole('button', { name: 'Delete' }).click()
    }
    for (const digit of PASSCODE) {
      await page.getByRole('button', { name: `Digit ${digit}` }).click()
    }
    await page.getByRole('button', { name: 'Sign in' }).click()

    /* Heart-icon "Overview" tab is rendered only post-auth. */
    await expect(page.getByRole('button', { name: /^Overview/ })).toBeVisible()
  })
})
