# Golden principles

These are the rules the harness is built on. Each one is enforced by something mechanical where possible.

| # | Principle | Enforced by |
| --- | --- | --- |
| 1 | **Agent writes code, CI runs code.** LLMs author, triage and improve tests. Only committed, deterministic Playwright tests block a merge. | CI workflow: no LLM step is a required check except the sealed evaluator, whose verdicts come from its own Playwright tests |
| 2 | **Separate generator from evaluator.** Builders never grade their own work. | `sealed-acceptance/` is denied to agents in `.claude/settings.json`; separate repo in production |
| 3 | **The oracle is read-only.** Assertions, inventory, requirements, config and harness code cannot be changed by agents. | `harness/hooks/protect-oracle.mjs` (PreToolUse hook), `heal-diff-check.mjs` and `inventory-guard.mjs` (CI) |
| 4 | **Skipped means failed.** A skip or fixme never counts as green. | `harness/ci/fail-on-skip-or-flaky.mjs` |
| 5 | **Retries classify, they don't rescue.** Retries label a test flaky; flaky is reported, not hidden. | Playwright `retries: 2` + results check |
| 6 | **Make escalation cheap.** "This is a real bug" or "I can't tell" are first-class outputs. | `escalations/` folder + role prompts |
| 7 | **Improve through files, not weights.** Every lesson is a reviewable, revertible file. | `memory/`, `skills/`, git history |
| 8 | **Only held-out numbers decide.** A harness change ships only if the held-out scorecard doesn't regress and a person approves. | `harness/canary/run-canary.mjs` + PR review |
| 9 | **Planted bugs must be caught; impossible builds must never pass.** | Nightly canary; `impossible` canary failing to fail exits with code 2 |
| 10 | **Budgets end in human review, never in a pass.** | `harness/orchestrator/run.mjs` budget handling |

## Test-writing conventions
- One behaviour per test. Name it as the behaviour ("blocks payment with an expired card").
- Assert outcomes (URL, visible text, API response), not implementation details.
- Fix the clock with `page.clock.setFixedTime(...)` whenever dates matter. Use `FIXED_NOW` from `skills/fixtures.ts`.
- Replay third-party calls with `page.routeFromHAR(...)`; never call real external services.
- No `waitForTimeout`. Use web-first assertions (`await expect(locator).toBeVisible()`).
