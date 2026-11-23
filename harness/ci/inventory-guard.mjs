#!/usr/bin/env node
// CI check: in the test inventory, agents may change only `status`, and may add new entries
// only with status "failing" or "pending-review". Anything else needs a human.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const base = process.env.BASE_REF || 'origin/main';
const FILE = 'inventory/tests.json';
const AGENT_STATUSES = new Set(['failing', 'pending-review']);

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
  for (const key of new Set([...Object.keys(old), ...Object.keys(now)])) {
    if (key === 'status') continue;
    if (JSON.stringify(old[key]) !== JSON.stringify(now[key])) problems.push(`${id}: field '${key}' changed`);
  }
  if (old.status !== now.status && now.status === 'retired') problems.push(`${id}: retired (human decision)`);
}
for (const [id, now] of afterById) {
  if (!beforeById.has(id) && !AGENT_STATUSES.has(now.status)) problems.push(`${id}: new entry must start as failing or pending-review (got '${now.status}')`);
}

if (problems.length) {
  console.error('inventory-guard: needs human review:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('inventory-guard: only status fields changed.');
