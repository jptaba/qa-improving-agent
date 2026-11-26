#!/usr/bin/env node
// PR gate: the PR's canary scorecard may not be worse than the base branch's.
// Usage: node harness/ci/canary-gate.mjs --base base.json --head head.json
// Per target (suite, evaluator):
//   - held-out caught rate (tpr_holdout) must not drop
//   - healthy-build TNR must not drop
//   - an impossible build must never pass (impossible_green = 0)
//   - every job must actually have tested its build (no errors)
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
const read = (file, label) => {
  if (!file || !fs.existsSync(file)) {
    console.error(`canary-gate: no ${label} scorecard at ${file ?? '(missing --' + label + ')'}. The canary did not finish; see its log above.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const head = read(opt('head'), 'head');
// A base branch without a working canary (e.g. the first PR into a bare scaffold) has nothing to compare
// against. The head still has to pass the absolute checks below.
let base = { targets: {} };
if (opt('base') && fs.existsSync(opt('base'))) base = read(opt('base'), 'base');
else console.warn(`canary-gate: WARNING no base scorecard at ${opt('base')}; comparing nothing, checking the PR's own scorecard only.`);

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const problems = [];
console.log('target     metric        base   head');
for (const [t, h] of Object.entries(head.targets ?? {})) {
  const b = base.targets?.[t];
  for (const m of ['tpr_holdout', 'tnr']) {
    console.log(`${t.padEnd(10)} ${m.padEnd(13)} ${pct(b?.[m]).padEnd(6)} ${pct(h[m])}`);
    if (b?.[m] != null && h[m] != null && h[m] < b[m]) {
      problems.push(`${t}: ${m} dropped from ${pct(b[m])} to ${pct(h[m])}. Find what this PR changed that makes the ${m === 'tnr' ? 'healthy build fail' : 'held-out faults go undetected'} (scorecard/runs/*/ in the job artifact).`);
    }
  }
  if (h.impossible_green > 0) problems.push(`${t}: an impossible build PASSED (${h.impossible_green}). The checks are not testing the app; do not merge.`);
  if (h.errors?.length) problems.push(`${t}: ${h.errors.length} canary job(s) never tested their build: ${h.errors.join('; ')}`);
}
if (!Object.keys(head.targets ?? {}).length) problems.push('head scorecard has no targets.');

if (problems.length) {
  console.error('\ncanary-gate FAILED:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('\ncanary-gate passed: nothing got worse than the base branch.');
