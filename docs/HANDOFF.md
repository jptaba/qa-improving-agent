# Handoff: status and pending work (2026-11-22)

## Status
- Scaffold complete: demo AUT, builder suite, 6 Claude Code roles, guardrail hooks, CI checks,
  orchestrator, sealed evaluator, canary/scorecard, GitHub workflow, docs.
- Verified in a Linux sandbox on this laptop (Playwright 1.63, headless Chromium):
  - hook self-tests 12/12; builder suite 8/8 (2.4s); evaluator 5/5 requirements pass on healthy build
  - canary ~90s: TNR 100%, pass^k true, impossible build never green
  - suite catches 4/5 planted bugs on their own requirement (80%); evaluator 5/5 (100%)
  - GAP: REQ-160 (orders API contract) has no builder test; the suite only catches
    `api-contract-drift` collaterally. REQ-160 is first in the orchestrator's authoring queue.
- Optimised in that session: parallel canary, per-requirement attribution ("caught" vs "flagged"),
  env-tunable timeouts (PW_TEST_TIMEOUT / PW_EXPECT_TIMEOUT / PW_ACTION_TIMEOUT), EVAL_RETRIES,
  per-run artifact folders (PW_OUTPUT_DIR / EVAL_OUTPUT_DIR) to fix a parallel-run race.
- NOT yet verified: real `npm install`, real axe-core (a sandbox stand-in was used),
  the live agent loop (`npm run orchestrate`), the hook running under Claude Code on Windows.

## Pending (in order)
1. Install and verify on Windows: `npm install`, `npx playwright install chromium`, `npm test`,
   `npm run check:results`, `npm run selftest:hooks`, `npm run canary`.
2. Git hygiene: `git config core.fileMode false`; review the unexplained change to
   `docs/research/leadership-briefing.html`; commit; delete `..\_sandbox-runtime` (115 MB, outside the project).
3. Hook on Windows: confirm `.claude/settings.json` hook fires (if `$CLAUDE_PROJECT_DIR` doesn't expand,
   use the absolute path with forward slashes).
4. Agent CLI flags: compare `harness/orchestrator/agent-runner.mjs` with `claude --help`
   (`-p`, `--output-format json`, `--max-turns`, `--allowedTools`, `--model`).
5. Close the REQ-160 gap: `npm run orchestrate:dry`, then `npm run orchestrate`. Review
   `specs/REQ-160.md` and `tests/generated/REQ-160.spec.ts`; if good, set its inventory status
   to `passing` (human step). Re-run `npm run canary` and expect suite caught(all) = 100%.
6. Phase 0 leftovers: point BASE_URL at a real per-PR preview; add OpenTelemetry export.
7. Phase 2: move `sealed-acceptance/` to its own repo + CI token; fill
   `sealed-acceptance/labels/calibration.csv` with 20–50 expert labels; report TPR/TNR.
8. Then Phase 3+ per `docs/roadmap.md`.

## Important: the guardrails apply to you too
`.claude/settings.json` denies Claude Code edits to requirements/, inventory/, harness/, .claude/,
.github/, playwright.config.ts, and any access to sealed-acceptance/. That is deliberate.
For maintainer work on those paths, a human edits them (or runs a supervised Claude Code session
from the parent folder, where this project's settings don't load) and lands it via reviewed PR.
