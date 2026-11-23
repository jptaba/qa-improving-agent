# Self-improving QA agents

A working starter project for AI agents that test an application with Playwright and get better over time **without grading their own homework**.

It implements the architecture from the research in `docs/research/`:
- narrow agent roles with tool allow-lists;
- a deterministic control plane;
- guardrails enforced by hooks and CI;
- a **sealed, requirements-only acceptance evaluator**;
- a planted-bug canary that measures whether any of it works.

It ships with a small **demo app** (sign-in → checkout → confirmation + an orders API) that has switchable planted bugs. Everything runs end to end on day one, before you point it at your real application.

---

## Quick start (Windows PowerShell, macOS or Linux)

Requires Node.js 20+.

```bash
npm install
npx playwright install chromium

npm test                 # builder suite against the demo app (starts it for you)
npm run check:results    # fails on any failure, skip, or flaky test
npm run selftest:hooks   # proves the guardrail hook blocks what it should
```

In two terminals, run the blind evaluator:
```bash
npm run aut              # terminal 1: demo app on http://localhost:4173
npm run evaluate         # terminal 2: one verdict per requirement
```

Then the scorecard (takes a few minutes):
```bash
npm run canary           # healthy ×3, 5 planted bugs, 1 impossible build → scorecard/latest.json
```

And the orchestrator:
```bash
npm run orchestrate:dry        # shows what the agents would do, runs the suite, writes evidence/
npm run orchestrate:no-agents  # deterministic steps only
npm run orchestrate            # full loop: needs Claude Code CLI (`claude`) installed and signed in
```

---

## How it fits together

```
requirements/  ──►  qa-planner ──► specs/ ──► qa-generator ──► tests/generated/
   (humans)              (Claude Code roles in .claude/agents/, budget-capped)
                                                     │
                                        admission: 5/5 passes, retries off
                                                     ▼
                     deterministic Playwright suite (no LLM)  ──► failures ──► qa-triage
                                                     │                    (heal locators only,
                                                     ▼                     or escalate the bug)
         sealed-acceptance/ evaluator: requirements + URL only ──► pass / fail / unknown / could_not_verify
                                                     │
              nightly canary: planted bugs must be caught · impossible builds must never pass
                                                     ▼
           weekly qa-improver: one playbook/skill/sensor change per PR, kept only if the
                               held-out scorecard doesn't get worse and a person approves
```

| Folder | What's in it | Who may change it |
| --- | --- | --- |
| `requirements/` | EARS acceptance criteria + OpenAPI contract | Humans |
| `inventory/tests.json` | Requirement → test map; drives the authoring queue | Agents: `status` only |
| `.claude/agents/` | Role prompts + tool allow-lists (planner, generator, triage, explorer, improver, gardener) | Humans |
| `.claude/settings.json` | Deny rules + the PreToolUse guardrail hook | Humans |
| `tests/`, `specs/` | Builder suite and plans | Agents (via PR) |
| `skills/` | Reusable helpers (login, fixed clock, data) | Agents (via PR, reviewed) |
| `memory/` | App model, playbook, failure log | Agents append; humans approve |
| `harness/` | Orchestrator, hooks, CI checks, canary | Humans |
| `sealed-acceptance/` | Blind evaluator, planted-bug catalogue, labels | **Humans; invisible to agents** |
| `escalations/`, `proposals/` | Agent → human hand-offs | Agents write; humans act |
| `scorecard/` | Canary results and history | Generated |
| `docs/` | Principles, locator policy, failure taxonomy, roadmap, research | Humans |

---

## Guardrails (and what enforces them)

| Rule | Enforced by |
| --- | --- |
| Agents can't see or edit the evaluator | `.claude/settings.json` deny rules + `protect-oracle.mjs` |
| Agents can't edit requirements, inventory, config, harness, CI | Same |
| No removed or loosened assertions, skips, hard waits or bigger timeouts | `protect-oracle.mjs` (at edit time) + `heal-diff-check.mjs` (in CI) |
| Inventory: only `status` may change | `inventory-guard.mjs` |
| Skipped = failed; flaky = needs review | `fail-on-skip-or-flaky.mjs` |
| Heal attempts capped at 2 per test; budget exhaustion → human, never pass | `harness/orchestrator/run.mjs` + `harness/config.json` |
| Planted bugs must be caught; impossible builds must never pass | `harness/canary/run-canary.mjs` (exit 2 on integrity failure) |

---

## Point it at your real application

1. **Requirements:** replace `requirements/REQ-*.md` with yours (keep the frontmatter: `id`, `title`, `status: in-scope`) and add your OpenAPI contracts.
2. **Base URL:** set `BASE_URL` (builder suite) and `--url` (evaluator) to your per-PR preview environment. The demo app only starts when `BASE_URL` is unset.
3. **Skills:** rewrite `skills/fixtures.ts` (`signIn`, `FIXED_NOW`) and `skills/data.ts` for your app.
4. **Inventory:** list your requirements in `inventory/tests.json` with `status: failing`; the orchestrator queues them for authoring.
5. **Seed test:** adapt `tests/seed.spec.ts`. Playwright's own agents (`npx playwright init-agents`) and the `qa-*` roles both start from it.
6. **Planted bugs:** replace `sealed-acceptance/seeded-faults/catalogue.json` with fault-injection builds or feature flags for your app, and update `harness/canary/run-canary.mjs` `withAut()` to deploy them.
7. **Seal the evaluator:** move `sealed-acceptance/` to its own repo with its own CI token. Rewrite its tests from your requirements, independently of the builder suite.
8. **Calibrate:** fill `sealed-acceptance/labels/calibration.csv` with 20–50 expert-labelled tasks before the evaluator gates merges.

See `docs/roadmap.md` for the phase checklist and exit criteria.

---

## Notes and caveats
- **Claude Code CLI flags** used by `harness/orchestrator/agent-runner.mjs` (`-p`, `--output-format json`, `--max-turns`, `--allowedTools`, `--model`) are kept in one place. Check them against `claude --help` for your installed version.
- **Hooks on Windows:** `.claude/settings.json` runs `node "$CLAUDE_PROJECT_DIR/harness/hooks/protect-oracle.mjs"`. If your shell doesn't expand `$CLAUDE_PROJECT_DIR`, replace it with the absolute path to this folder.
- **The deny rules apply to anyone using Claude Code in this repo.** Edit harness files yourself in your editor and land them through a reviewed PR.
- Playwright MCP is configured in `.mcp.json` (`@playwright/mcp`) for the planner, generator, triage and explorer roles.
- Versions reflect November 2026 (Playwright 1.64). Re-check before upgrading.
