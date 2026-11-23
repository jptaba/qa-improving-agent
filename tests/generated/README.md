# tests/generated/

The `qa-generator` agent writes new tests here, one file per requirement (`<REQ-ID>.spec.ts`).

A file in this folder is merged only after it passes admission:
1. It compiles and contains no `waitForTimeout`, `test.skip` or `test.fixme`.
2. It passes **5 consecutive runs** (`--repeat-each=5 --retries=0`) on a healthy build.
3. It covers a requirement that had no passing test, or catches a planted bug the suite missed.
4. A person reviews it (inventory status `pending-review` → `passing`).

`REQ-160` (orders API contract) is queued here for the first agent run. See `inventory/tests.json`.
