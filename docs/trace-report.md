# Trace report (standalone HTML)

Every Playwright run writes `reports/trace-report.html`. It is a single file with no network access and no backend, so you can open it in any browser, attach it to a ticket, or keep it as a CI artifact. It does the job of a trace dashboard for this project. The OpenTelemetry exporter (`harness/reporters/otel-reporter.mjs`) is still there for when a real trace backend exists.

## What it shows
- **Summary:** pass, fail, flaky and skipped counts, wall time, workers, branch, commit, and a link to the CI run.
- **Timeline:** one lane per worker, with one bar per test attempt. Retries that passed are striped. Click a bar to see its steps.
- **By requirement:** tests, failures, flaky tests and time per `REQ-*` tag. Click a requirement to filter the test list.
- **Tests:** filter by status, search, and sort by time or attempts.
- **Detail:** each attempt's error and code snippet, and a step waterfall (hooks, fixtures, actions, assertions) with timings. When Playwright kept a trace for a test, the detail also shows that trace file's path, so you can open the full trace with `npx playwright show-trace <path>` or at trace.playwright.dev. The first failing test opens automatically.

## Where to find it
- **Locally:** `npx playwright test`, then open `reports/trace-report.html`.
- **CI:** the `trace-report` job merges both e2e shards into one report. Download the **trace-report** artifact from the run, unzip it and open `trace-report.html`. The Playwright traces it links to are in the same zip.
- **Merging by hand:** `node harness/reporters/build-trace-report.mjs --out merged.html --dir <folder with trace-report*.json files>`.

## Settings
- `TRACE_REPORT_FILE`: where the HTML goes (default `reports/trace-report.html`). The raw data goes next to it as `.json`, which the merge script reads.
- Step trees are capped at 300 steps per attempt, so a full run stays well under 1 MB.
- Writing the report never fails a run.
