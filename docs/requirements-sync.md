# Requirement sync (go-live)

While the project is in development, Claude writes requirements by hand. Once it is live, requirements come
from the systems the team already uses. `scripts/requirements-sync/` turns them into `requirements/REQ-*.md`
in the same EARS format, so nothing downstream changes: the builder writes tests for them, the blind
evaluator author writes sealed checks, and every gate applies as usual.

| Source | Command | Settings (env or CI secrets) |
| --- | --- | --- |
| OpenAPI / Swagger (YAML or JSON, 3.x or 2.0) | `node scripts/requirements-sync/index.mjs --source openapi --spec <file>` | none |
| Jira Cloud | `node scripts/requirements-sync/index.mjs --source jira` | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_JQL`, optional `JIRA_AC_FIELD`, `JIRA_READY` |
| Confluence Cloud | `node scripts/requirements-sync/index.mjs --source confluence` | `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`, `CONFLUENCE_LABEL`, optional `CONFLUENCE_READY_LABEL` |

Add `--dry-run` to see what would change without writing.

## How it maps
- **One requirement per** Jira issue, Confluence page, or OpenAPI operation.
- **Acceptance criteria** are read, in order of preference, from EARS lines (`… THE SYSTEM SHALL …`),
  Given/When/Then blocks, or the list under an "Acceptance criteria" heading. For OpenAPI, each documented
  response becomes one AC.
- **Status** is `in-scope` only when the source marks the item ready (Jira status or label in `JIRA_READY`,
  Confluence label `qa-ready`, any non-deprecated OpenAPI operation) and it has at least one AC. Everything
  else is `draft`, which the builder ignores, so half-written tickets never become tests.
- **Ids are stable**: each file records `source:` in its frontmatter; re-syncing updates that file and keeps
  its REQ id. New items get the next free id in steps of 10. Hand-written requirements are never touched,
  and a contract already owned by a hand-written requirement (`contract:` field) is skipped unless `--force`.

## Guards
- A sync run is committed as a **requirement-only PR** (`requirements-isolation`).
- `requirements-lint` fails a PR if two files share an id (two parallel PRs picked the same next id), a file
  name does not match its id, or an in-scope requirement has no ACs.
- Edit a synced requirement at its source; local edits are overwritten on the next sync.

## Testing without Jira or Confluence
There is no real Jira or Confluence for this project, so both are mocked.
`scripts/requirements-sync/mock-atlassian.mjs` is a small local server that answers the same endpoints
the adapters call, with the documented response shapes, Basic auth, and small pages so paging is always
exercised. Its content is a made-up `SHOP` project in `scripts/requirements-sync/fixtures/`:

| Fixture | Shows |
| --- | --- |
| SHOP-101 | ACs in a custom field (`customfield_10042`), status Ready → in-scope |
| SHOP-102 | Given/When/Then in the description, `qa-ready` label → in-scope |
| SHOP-103 | "Acceptance criteria" list, status To Do → draft |
| SHOP-104 | Ready but no ACs → draft |
| SHOP-105, OPS-1 | outside the JQL, never synced |
| Confluence 9001, 9003 | `qa-requirement` + `qa-ready` → in-scope (9003 has `&ndash;` in its text) |
| Confluence 9002 | no `qa-ready` → draft |
| Confluence 9004 | no `qa-requirement` label, never synced |

- `npm run test:sync` runs the unit tests and the end-to-end tests (`mock.test.mjs`). The end-to-end tests
  start the mock, run the CLI over HTTP, and check filtering, paging, ready/draft, stable ids on re-sync, a
  changed ticket updating its file, and that bad credentials or unsupported JQL fail without writing anything.
  CI runs them in `guardrails`.
- To try it by hand, run `npm run sync:mock` in one terminal. It prints the settings to use. Then, in a
  second terminal, set those settings and run the sync with `--out` pointing at a scratch folder, plus
  `--dry-run`. Never point it at `requirements/`: the fixtures are not real requirements.

The mock supports only JQL clauses joined by `AND`, each `project = X`, `labels = X` or `status = "X"`.

## Scheduling it
Not scheduled: there is no live Jira or Confluence. When there is, add their settings as secrets of a cloud
scheduled task (or GitHub Actions secrets) that runs the sync daily and opens a requirement-only PR. Nothing
else changes, because the mock serves the same endpoints and shapes.
