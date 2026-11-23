import { defineConfig, devices } from '@playwright/test';

// The evaluator always runs against an already-running build (EVAL_BASE_URL). It never starts one itself.
export default defineConfig({
  testDir: './tests',
  outputDir: process.env.EVAL_OUTPUT_DIR ?? '../out/artifacts', // unique per run when runs are concurrent
  fullyParallel: true,
  retries: Number(process.env.EVAL_RETRIES ?? 1), // a pass only on retry becomes verdict "unknown", never "pass"
  timeout: Number(process.env.PW_TEST_TIMEOUT ?? 30_000),
  expect: { timeout: Number(process.env.PW_EXPECT_TIMEOUT ?? 5_000) },
  reporter: [['list'], ['json', { outputFile: process.env.EVAL_REPORT ?? '../out/eval-results.json' }]],
  use: {
    baseURL: process.env.EVAL_BASE_URL ?? 'http://localhost:4173',
    actionTimeout: Number(process.env.PW_ACTION_TIMEOUT ?? 10_000), // a broken page fails fast instead of waiting for the test timeout
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHROME_PATH ? { launchOptions: { executablePath: process.env.PW_CHROME_PATH } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
