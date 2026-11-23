# sealed-acceptance/ — the independent referee

> **Move this folder to its own repository with its own CI credentials before production use.**
> It lives here only so the scaffold runs out of the box. Builder agents are already denied
> read/write access to it (`.claude/settings.json` and `harness/hooks/protect-oracle.mjs`).

## What it is
A **blind acceptance evaluator**. It verifies a running build **only against the requirements**: acceptance criteria, journeys, scope and API contracts. It never sees the code, the diff, the builder's tests or the builder agents' transcripts.

It imports **nothing** from the builder side (`skills/`, `tests/`). Its login helper and data are its own.

## Contents
| Path | Purpose | Owner |
| --- | --- | --- |
| `evaluator/tests/` | Private, requirement-tagged Playwright acceptance tests (derived from `requirements/`) | Evaluator agent (training builds only) + humans |
| `evaluator/run-evaluator.mjs` | Runs the private tests and emits one verdict per requirement | Humans |
| `evaluator/verdict.schema.json` | Verdict format: `pass` · `fail` · `unknown` · `could_not_verify` | Humans |
| `seeded-faults/catalogue.json` | Planted bugs used to measure detection (TPR) | **Humans only** |
| `impossible/` | Canary builds that must never pass | **Humans only** |
| `labels/` | Expert pass/fail labels for calibration (train/dev/test) | **Humans only** |

## Run it
```bash
npm run aut            # in one terminal (or point --url at any deployed build)
npm run evaluate       # verdicts → sealed-acceptance/out/verdicts.json
```
Exit code is `0` only if every in-scope requirement is `pass`. `unknown` and `could_not_verify` go to a person.

## Rules
1. The Coder receives only `requirement_id`, `observed`, `expected` and evidence links, **never these tests**.
2. Cap Coder↔evaluator iterations per requirement (e.g. 3). Then escalate to a person.
3. When the evaluator uses an LLM to derive new tests, use a **different model family** from the builder agents.
4. Calibrate before gating: 20–50 expert-labelled tasks; report TPR and TNR separately on the held-out split.
