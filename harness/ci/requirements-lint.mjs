#!/usr/bin/env node
// CI check: requirement files are well-formed and ids are unique.
// Two PRs written in parallel (by Claude, the builder, or the requirement sync) can each pick the same
// next id; whichever merges second fails here instead of silently shadowing the first.
//   - file name starts with its frontmatter id (REQ-123-*.md)
//   - id, title and status are present; status is in-scope, draft or out-of-scope
//   - every id is used by exactly one file
//   - in-scope requirements have at least one **ACn:** line
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'requirements';
const STATUSES = new Set(['in-scope', 'draft', 'out-of-scope']);
const problems = [];
const seen = new Map();

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!fm) {
    problems.push(`${f}: no frontmatter`);
    continue;
  }
  const get = (k) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm)?.[1].trim();
  const id = get('id');
  const status = get('status');
  if (!id || !/^REQ-\d+$/.test(id)) problems.push(`${f}: missing or malformed id`);
  else {
    if (!f.startsWith(`${id}-`) && f !== `${id}.md`) problems.push(`${f}: file name does not start with its id ${id}`);
    if (seen.has(id)) problems.push(`${id}: used by both ${seen.get(id)} and ${f}. Renumber the newer one to the next free id.`);
    seen.set(id, f);
  }
  if (!get('title')) problems.push(`${f}: missing title`);
  if (!STATUSES.has(status)) problems.push(`${f}: status '${status}' is not one of ${[...STATUSES].join(', ')}`);
  if (status === 'in-scope' && !/\*\*AC\d+:\*\*/.test(text)) problems.push(`${f}: in-scope but has no **ACn:** acceptance criteria`);
}

if (problems.length) {
  console.error('requirements-lint:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`requirements-lint: ${seen.size} requirement(s) ok.`);
