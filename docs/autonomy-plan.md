# Autonomy plan: running the QA harness hands-off

Goal: agents do the day-to-day work end to end. People only supply intent (requirements) and do a
few one-time setup steps. Scores stay meaningful because no agent can edit its own grader.

## What stays human, and why
| Touchpoint | During development | Once live |
| --- | --- | --- |
| Requirements (`requirements/`) | Claude writes and updates them when the owner asks or the work needs it, each in its own PR (`requirements-isolation`) | synced from Jira, Confluence, OpenAPI/Swagger by a sync job (Phase H) |
| The guard (`harness/hooks/`, `harness/config.json`, `.claude/settings.json`) | human-owned | human-owned |
| Sealed evaluator (`sealed-acceptance/`) | written by a **blind author agent** that sees only requirements and the running app, never `tests/` | same, in its own repo |

Everything else (tests, skills, harness scripts, CI, inventory, agent role prompts, merges) is agent work,
gated by CI. Merges go through GitHub auto-merge once every required check is green, never by an agent.

## Required checks that gate every agent PR
`e2e` (suite, no skips, no flaky) · `guardrails` (hook self-test, inventory guard, heal-diff) ·
`blind-evaluator` · `contract-fuzz` · `canary-gate` (new: held-out caught rate and healthy TNR may not drop
versus `main`; an impossible build must never pass).

## One-time setup (people)
1. `node proposals/unlock-for-autonomy.mjs`, `npm run selftest:hooks`, commit, restart Claude Code.
2. GitHub repo settings: allow auto-merge; protect `main` and mark the checks above as required.
3. No API key (Claude Pro): agent work runs as Claude Code cloud scheduled tasks on the subscription,
   not in GitHub Actions. Each task polls for work (requirements without tests, failing `main`,
   requirements the evaluator cannot verify) and opens a PR. Optional later: `claude setup-token`
   gives a subscription token for GitHub Actions (`CLAUDE_CODE_OAUTH_TOKEN` secret).
4. A separate sealed repo is only needed if the blind author cannot be kept away from `tests/` with a
   sparse checkout of this repo. Try the sparse checkout first.
5. Install the GitHub CLI once (`winget install --id GitHub.cli`, then `gh auth login`) so local
   Claude sessions can open PRs.

## Phases (agent work after step 1)
- **A. Land pending work:** apply `proposals/apply-roadmap-edits.mjs`; open one PR.
- **B. Canary gate:** `harness/ci/canary-gate.mjs` + PR job comparing the PR's scorecard with `main`'s.
- **C. PR plumbing** (`.github/workflows/auto-merge.yml`, cloud tasks open PRs, 2026-11-26): agent branches open PRs labelled `agent-authored` and request auto-merge; the
  cloud explorer and improver tasks switch from "push a branch" to "open a PR".
- **D. Authoring in CI:** when `requirements/` changes on `main`, the orchestrator plans, generates and
  admits tests (pass^k), updates `inventory/`, and opens a PR.
- **E. Triage in CI:** a failing `e2e` on `main` starts `qa-triage`; heals go out as PRs, real bugs as escalations.
- **F. Blind evaluator author:** sealed repo with its own `.claude/settings.json` (denies `tests/`, `skills/`,
  `specs/`), a scheduled task that writes checks for any requirement the evaluator reports as
  `could_not_verify`, and a planted fault per new requirement. First job: REQ-180 and REQ-190.
- **G. Visual baselines:** after REQ-200 is decided (`escalations/2026-11-26T0100-*`); baselines from the CI container.
- **H. Requirement sync (go-live; adapters done, `docs/requirements-sync.md`, scheduling waits for credentials):** adapters that pull Jira/Confluence/OpenAPI into `requirements/`
  in the existing EARS format, as a PR a person approves until trust is established.
- **I. Observability and ablation:** OpenTelemetry reporter (done, off until an endpoint secret is set); ablation procedure in `docs/ablation.md`, run on each model upgrade.

## What a person still sees
A weekly digest: merged agent PRs, open escalations (`aut_bug`, `unclear_requirement`), and the scorecard trend.
