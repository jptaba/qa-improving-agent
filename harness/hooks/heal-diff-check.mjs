#!/usr/bin/env node
// Required CI check for agent-authored PRs. Deliberately conservative:
// any hit routes the PR to a human (exit 1) rather than letting it merge silently.
import { execSync } from 'node:child_process';

const base = process.env.BASE_REF || 'origin/main';
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

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
for (const f of files) {
  if (/-snapshots\//.test(f)) problems.push(`${f}: visual baseline changed (needs approval)`);
  if (/^(requirements|harness|sealed-acceptance|\.github|\.claude)\//.test(f) || f === 'playwright.config.ts')
    problems.push(`${f}: protected path changed`);
}

if (problems.length) {
  console.error('heal-diff-check: this PR needs human review:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('heal-diff-check: no weakening detected.');
