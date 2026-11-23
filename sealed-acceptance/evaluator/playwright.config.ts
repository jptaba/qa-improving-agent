import { defineConfig, devices } from '@playwright/test';

// The evaluator always runs against an already-running build (EVAL_BASE_URL). It never starts one itself.
export default defineConfig({
  testDir: './tests',
  outputDir: '../out/artifacts',
  fullyParallel: true,
  retries: 1, // a pass only on retry becomes verdict "unknown", never "pass"
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['json', { outputFile: process.env.EVAL_REPORT ?? '../out/eval-results.json' }]],
  use: {
    baseURL: process.env.EVAL_BASE_URL ?? 'http://localhost:4173',
    actionTimeout: 10_000, // a broken page fails fast instead of waiting for the test timeout
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHROME_PATH ? { launchOptions: { executablePath: process.env.PW_CHROME_PATH } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
