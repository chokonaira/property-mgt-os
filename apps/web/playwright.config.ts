import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright runs the wizard's happy path end-to-end. The web + api
 * are NOT started by Playwright — the spec assumes the reviewer has
 * already run `pnpm dev` (or the docker compose stack) so the
 * database is seeded and both apps are warm. Keeps CI / local
 * symmetric and avoids re-implementing the migration + seed
 * orchestration that `pnpm dev` already encodes.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], locale: 'en-US' },
    },
  ],
});
