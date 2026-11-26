# AGENTS.md — map for AI agents working in this repo

Keep this file short. It is a table of contents, not a manual. Read the linked doc when you need it.

## What this repo is
A harness for self-improving QA agents that test an application under test (AUT) with Playwright.
The demo AUT lives in `demo-aut/` (start it with `npm run aut`, port 4173).

## Golden rules (enforced by hooks and CI, not just by this file)
1. **Never weaken a test.** Do not remove or loosen `expect(...)`, add `test.skip`/`test.fixme`, add `waitForTimeout`, or raise timeouts. A hook blocks it.
2. **Never read or edit `sealed-acceptance/`.** It is the independent referee. You are not allowed to see it.
3. **Never edit the guard:** `harness/hooks/`, `harness/config.json`, `.claude/settings.json`. Humans own these. Everything else is agent work, gated by CI (`docs/autonomy-plan.md`).
3a. **Requirements change on their own.** Claude may write or update `requirements/` when the owner asks or the work needs it, but never in the same PR as tests, skills, specs, the app or the sealed evaluator (`harness/ci/requirements-isolation.mjs`).
4. **If the app looks broken, say so.** Write an escalation (see below). Reporting a real bug is a success, not a failure.
5. Tag every test with its requirement: `test('…', { tag: ['@REQ-142'] }, …)`.

## How to escalate
Write a YAML file to `escalations/<timestamp>-<short-name>.yml` (full template: `escalations/README.md`):
```yaml
type: aut_bug            # aut_bug | needs_human | unclear_requirement
requirement_id: REQ-142
status: open
test: tests/…
summary: |
  One-line headline, then details wrapped at ~75 characters.
evidence: path to trace/screenshot
answer:
  decision:
  notes: |
```

## Where things are
| Need | Go to |
| --- | --- |
| Conventions and principles | `docs/golden-principles.md` |
| How to pick locators | `docs/locator-policy.md` |
| Classifying a failure | `docs/failure-taxonomy.md` |
| Requirements (read-only) | `requirements/REQ-*.md`, `requirements/openapi/` |
| Reusable helpers (login, data) | `skills/` |
| Lessons learned | `memory/playbook.md` |
| What the app looks like | `memory/app-model.json` |
| Your role's instructions | `.claude/agents/qa-*.md` |

## Commands
- Run all tests: `npx playwright test`
- Run one requirement: `npx playwright test --grep @REQ-142`
- Prove a new test is stable: `npx playwright test <file> --repeat-each=5 --retries=0`
