import { type Page, expect } from '@playwright/test'

export const PASSCODE = '9999'

/** Drives the lock-screen keypad and waits until the main UI has rendered. */
export async function login(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Enter passcode')).toBeVisible()
  for (const digit of PASSCODE) {
    await page.getByRole('button', { name: `Digit ${digit}` }).click()
  }
  await page.getByRole('button', { name: 'Sign in' }).click()
  /* The Overview tab button only renders post-auth. */
  await expect(page.getByRole('button', { name: /^Overview/ })).toBeVisible()
}
