#!/usr/bin/env node
// Required CI check for agent-authored PRs. Deliberately conservative:
// any hit routes the PR to a human (exit 1) rather than letting it merge silently.
// Updated for the autonomy plan (docs/autonomy-plan.md, 2026-11-26).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const base = process.env.BASE_REF || 'origin/main';
const labels = new Set((process.env.PR_LABELS || '').split(',').map((s) => s.trim()).filter(Boolean));
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let guard = ['.claude/settings.json', '.claude/settings.local.json', 'harness/hooks/', 'harness/config.json'];
try {
  guard = JSON.parse(fs.readFileSync('harness/config.json', 'utf8')).protectedPaths ?? guard;
} catch {
  /* keep the defaults */
}
guard = guard.filter((p) => p !== 'sealed-acceptance/');
const inGuard = (f) => guard.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p));

let diff = '';
let files = [];
try {
  diff = sh(`git diff --unified=0 ${base}...HEAD -- tests/ skills/`);
  files = sh(`git diff --name-only ${base}...HEAD`).split('\n').filter(Boolean);
} catch (e) {
  console.error(`heal-diff-check: could not diff against ${base}: ${e.message}`);
  process.exit(1);
}

const problems = [];
let currentFile = '';
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) currentFile = line.slice(6);
  const removed = line.startsWith('-') && !line.startsWith('---');
  const added = line.startsWith('+') && !line.startsWith('+++');
  const text = line.slice(1).trim();
  if (removed && /\bexpect(\.soft)?\s*\(/.test(line)) problems.push(`${currentFile}: assertion removed or changed → ${text}`);
  if (added && /\btest(\.describe)?\.(skip|fixme)\s*\(|\.skip\s*\(/.test(line)) problems.push(`${currentFile}: skip/fixme added → ${text}`);
  if (added && /\bwaitForTimeout\s*\(/.test(line)) problems.push(`${currentFile}: hard wait added → ${text}`);
  const t = added && line.match(/timeout\s*:\s*([\d_]+)/);
  if (t && Number(t[1].replace(/_/g, '')) > 15000) problems.push(`${currentFile}: timeout above policy (${t[1]}ms)`);
}

const sealed = files.filter((f) => f.startsWith('sealed-acceptance/'));
const graded = files.filter((f) => /^(tests|skills|specs)\//.test(f));
if (sealed.length && graded.length)
  problems.push(`sealed-acceptance/ and tests/skills/specs changed in the same PR (${sealed.length} + ${graded.length} files). The referee and the work it grades must land separately.`);
for (const f of files) {
  if (/-snapshots\//.test(f) && !labels.has('visual-approved')) problems.push(`${f}: visual baseline changed; needs the owner's visual-approved label (REQ-200 AC2)`);
  if (inGuard(f)) problems.push(`${f}: the guard itself changed (human-owned)`);
}

if (problems.length) {
  console.error('heal-diff-check: this PR needs human review:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('heal-diff-check: no weakening detected.');
