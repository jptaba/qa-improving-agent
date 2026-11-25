# Roadmap and exit criteria

Tick items as they land. Move to the next phase only when its exit criteria are met.

## Phase 0: Deterministic foundation *(this scaffold covers most of it)*
- [x] Demo AUT with health endpoint and planted-bug switch (`FAULT`)
- [x] Playwright config: retries classify flakiness, traces on first retry, JSON/JUnit/HTML reports
- [x] Fixed clock via `FIXED_NOW`; tests tagged by requirement ID
- [x] JSON test inventory keyed by requirement ID
- [x] `AGENTS.md` map and golden principles
- [ ] Point `BASE_URL` at your real AUT's per-PR preview (seeded DB, test keys, TTL, health-poll)
- [ ] OpenTelemetry export from CI and agents to your trace backend (e.g. Langfuse)
- **Exit:** suite passes 5/5 on a healthy build (`npx playwright test --repeat-each=5`); trace link in every failure

## Phase 1: Agentic authoring
- [x] Claude Code roles: `qa-planner`, `qa-generator` with tool allow-lists
- [x] Oracle-protection hook and heal-diff CI check
- [x] Orchestrator authoring queue + admission (k consecutive passes)
- [ ] Human review of every generated test (`pending-review` in the inventory)
- **Exit:** build rate, reliable-pass rate, coverage gain and human acceptance rate are tracked

## Phase 2: Blind evaluator
- [x] Sealed evaluator with private, requirement-tagged tests and four verdicts
- [x] Seeded-fault catalogue + impossible canary + scorecard
- [ ] Move `sealed-acceptance/` to its own repo with its own CI token
- [ ] 20–50 expert-labelled tasks in `sealed-acceptance/labels/`; report TPR and TNR separately
- [ ] Run the evaluator on a different model family from the builders (when it uses an LLM to derive tests)
- **Exit:** TPR and TNR reported on the held-out split; canary green-rate = 0

## Phase 3: Guarded triage + specialist stack
- [x] `qa-triage` role with heal caps and escalation
- [ ] Specmatic + Schemathesis against `requirements/openapi/`
  - Done: request-body contract tests in `tests/contract/`; Schemathesis via `npm run contract:fuzz` (not yet in CI).
  - Open: Specmatic; add `contract:fuzz` to the CI workflow (human-owned).
- [ ] axe checks extended to every page + manual a11y checklist
  - Done: error states of sign-in and checkout scanned; checklist in `docs/a11y-manual-checklist.md`.
  - Open: confirmation and 404 pages need a requirement first (see `escalations/`).
- [ ] Approval-gated visual baselines
- **Exit:** false-heal rate measured on a labelled sample; skip count at 0

## Phase 4: Outer improvement loop
- [x] `qa-improver` and `qa-gardener` roles; playbook with hit/miss counters
- [ ] Weekly job: cluster failures → one harness change per PR → canary on held-out split → human approval
- **Exit:** held-out detection improves without TNR regression across consecutive cycles

## Phase 5: Expansion and ablation
- [ ] `qa-explorer` nightly; Maestro/Appium for mobile
- [ ] Ablation on each model upgrade (remove one harness component, re-run canary)
- **Exit:** confirmed new bugs per month; every harness component justified
