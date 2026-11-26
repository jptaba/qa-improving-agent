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

## Scheduling it
Not scheduled yet: it needs the Jira/Confluence credentials of the live team. When they exist, add them as
secrets of a cloud scheduled task (or GitHub Actions secrets) that runs the sync daily and opens the PR.
