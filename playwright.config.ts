import { defineConfig, devices } from '@playwright/test'

const PORT = 8081
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false, // backend has shared state (single SQLite file)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    /* Match the deployed mobile-first viewport so layout assertions
     * (e.g. tab bar at the bottom) reflect real usage. */
    viewport: { width: 390, height: 844 },
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 7'],
        /* Pixel 7 ships with chromium engine — devices['iPhone 15'] would
         * pull webkit which we don't install in CI to keep the binary
         * footprint small. Mobile viewport is what we actually care about. */
      },
    },
  ],
  webServer: {
    command: './e2e/serve.sh',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
