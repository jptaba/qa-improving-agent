import { defineConfig, devices } from '@playwright/test';

// BASE_URL points the suite at any deployed AUT (e.g. a per-PR preview).
// Without it, Playwright starts the demo AUT for you.
const baseURL = process.env.BASE_URL ?? 'http://localhost:4173';
const useDemoAut = !process.env.BASE_URL;

export default defineConfig({
  testDir: './tests',
  outputDir: process.env.PW_OUTPUT_DIR ?? './reports/artifacts', // unique per run when runs are concurrent
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retries CLASSIFY flaky tests; harness/ci/fail-on-skip-or-flaky.mjs never counts flaky as green.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Timeouts are env-tunable so the canary can fail broken builds fast (healthy pass^k still guards against false alarms).
  // The env can only LOWER a timeout, never raise it (golden rule 1).
  timeout: Math.min(Number(process.env.PW_TEST_TIMEOUT) || 30_000, 30_000),
  globalTimeout: 25 * 60_000,
  expect: { timeout: Math.min(Number(process.env.PW_EXPECT_TIMEOUT) || 5_000, 5_000) },
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.PW_JSON_OUTPUT ?? 'reports/results.json' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
  ],
  use: {
    baseURL,
    actionTimeout: Math.min(Number(process.env.PW_ACTION_TIMEOUT) || 10_000, 10_000), // a broken page fails fast instead of waiting for the test timeout
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Optional: point at an installed Chrome instead of Playwright's bundled browser.
    ...(process.env.PW_CHROME_PATH ? { launchOptions: { executablePath: process.env.PW_CHROME_PATH } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: useDemoAut
    ? {
        command: 'node demo-aut/server.mjs',
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      }
    : undefined,
});
