#!/usr/bin/env node
// CI check: in the test inventory, agents may change only `status`, and may add new entries
// only with status "failing" or "pending-review". Exception: rows whose requirement file changed
// in this PR may change other fields and start with any status (the requirement moved, so the
// criterion text follows it). Removing or retiring a row always needs a human.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const base = process.env.BASE_REF || 'origin/main';
const FILE = 'inventory/tests.json';
const AGENT_STATUSES = new Set(['failing', 'pending-review']);
const changedReqs = new Set(
  execSync(`git diff --name-only ${base}...HEAD -- requirements/`, { encoding: 'utf8' })
    .split('\n')
    .map((f) => /requirements\/(REQ-\d+)/.exec(f)?.[1])
    .filter(Boolean),
);

let before;
try {
  before = JSON.parse(execSync(`git show ${base}:${FILE}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {
  console.log(`inventory-guard: no ${FILE} on ${base}; nothing to compare.`);
  process.exit(0);
}
const after = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const beforeById = new Map(before.tests.map((t) => [t.id, t]));
const afterById = new Map(after.tests.map((t) => [t.id, t]));
const problems = [];

for (const [id, old] of beforeById) {
  const now = afterById.get(id);
  if (!now) {
    problems.push(`${id}: entry removed`);
    continue;
  }
  if (changedReqs.has(now.requirement_id) && now.status !== 'retired') continue;
  for (const key of new Set([...Object.keys(old), ...Object.keys(now)])) {
    if (key === 'status') continue;
    if (JSON.stringify(old[key]) !== JSON.stringify(now[key])) problems.push(`${id}: field '${key}' changed`);
  }
  if (old.status !== now.status && now.status === 'retired') problems.push(`${id}: retired (human decision)`);
}
for (const [id, now] of afterById) {
  if (!beforeById.has(id) && !AGENT_STATUSES.has(now.status) && !changedReqs.has(now.requirement_id)) problems.push(`${id}: new entry must start as failing or pending-review (got '${now.status}')`);
}

if (problems.length) {
  console.error('inventory-guard: needs human review:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('inventory-guard: only status fields changed.');
