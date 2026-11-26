# Ablation: is every harness component still earning its place?

Run on each model upgrade (roadmap Phase 5). The question per component: if it were gone, would the
agents write worse tests? A component that makes no difference is removed, so the harness stays small.

## Components to ablate (one at a time)
| Component | How to remove it for the run |
| --- | --- |
| Playbook (`memory/playbook.md`) | agents told not to read it |
| Locator policy (`docs/locator-policy.md`) | agents told not to read it |
| Helpers (`skills/`) | agents must not import from `skills/`; they write their own setup |
| App model (`memory/app-model.json`) | agents told not to read it |
| Seed test (`tests/seed.spec.ts`) | agents told not to read it |

The guard (hooks, CI checks) and the sealed evaluator are never ablated: they are how the result is measured.

## Procedure (an agent can run it end to end)
1. Pick 3 requirements that already have tests. On a scratch branch, delete their generated tests and
   inventory rows (never merged).
2. **Baseline:** regenerate them as `qa-planner` then `qa-generator` with every component available.
   Run `npm run canary`; keep the scorecard.
3. **Per component:** reset the scratch branch, remove one component as in the table, regenerate the same
   3 requirements, run `npm run canary`.
4. Compare with the baseline: held-out caught rate, healthy TNR, stability (`--repeat-each=5`), and how
   many attempts each test needed. Record one row per component in `proposals/<date>-ablation.md`.
5. A component whose removal changes nothing on two consecutive model upgrades is proposed for removal.

Delete the scratch branch afterwards. Nothing from an ablation run is merged except the proposal.
