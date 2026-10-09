import { defineConfig, devices } from '@playwright/test';

// Ports for the isolated E2E stack (the dev servers keep 4200/8000). e2e/proxy.e2e.json must match BACKEND_PORT.
const BACKEND_PORT = 8001;
const FRONTEND_PORT = 4300;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

/**
 * End-to-end suite for the highest-risk journeys (see e2e/README.md).
 * Starts its own stack: the Django API on 8001 with a fresh, seeded SQLite database and demo
 * payments (e2e/support/start-backend.mjs), and `ng serve` on 4300 proxying /api to it.
 * Tests share that database, so they run one at a time.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/support/start-backend.mjs',
      env: { E2E_BACKEND_PORT: String(BACKEND_PORT), E2E_FRONTEND_URL: FRONTEND_URL },
      url: `http://127.0.0.1:${BACKEND_PORT}/api/payments/config/`,
      // Always a fresh database: never reuse a server that may hold another run's data.
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx ng serve --port ${FRONTEND_PORT} --proxy-config e2e/proxy.e2e.json`,
      url: FRONTEND_URL,
      reuseExistingServer: !process.env['CI'],
      timeout: 300_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
