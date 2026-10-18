import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a real Supabase project with invited test
 * accounts (they never create accounts). Provide credentials via env:
 *   E2E_EMAIL, E2E_PASSWORD             — primary test member
 *   E2E_EMAIL_2, E2E_PASSWORD_2         — second member (isolation checks)
 * Tests that need an account are skipped when these are missing.
 * By default the suite builds and serves the production bundle (so the
 * service worker and offline mode are real); set E2E_BASE_URL to reuse a server.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npx vite preview --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
