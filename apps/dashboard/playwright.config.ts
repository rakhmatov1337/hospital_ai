import { defineConfig, devices } from '@playwright/test';

/**
 * Dashboard e2e (Dev Build Board: "Dashboard e2e tests (Playwright)").
 *
 * The API is mocked at the network layer (`page.route`), so the suite is
 * self-contained: it needs no backend, no database and no secrets, and therefore
 * runs unchanged in CI. It exercises the UI contract — the auth guard and the
 * queue's safety-critical rules (tier order, breach flag, never hiding an
 * unresolved urgent item).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'pnpm exec vite --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
