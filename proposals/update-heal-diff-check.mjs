#!/usr/bin/env node
// Human-run, one time: brings harness/hooks/heal-diff-check.mjs in line with the autonomy unlock.
// Review it, then run from the project root:   node proposals/update-heal-diff-check.mjs
// Then commit and push (it is a guard file, so only you can change it). Safe to run twice.
//
// Today the check sends every agent PR that touches requirements/, harness/, .github/, sealed-acceptance/
// or playwright.config.ts to a human: the lock list from before the unlock. That blocks every agent PR the
// autonomy plan expects (#5, #6, #7 on 2026-11-26). The new version:
//   - still fails on any weakened test in tests/ or skills/ (removed expect, skip/fixme, waitForTimeout,
//     timeout above 15s), exactly as before;
//   - fails on changes to the guard itself: the protectedPaths in harness/config.json, minus
//     sealed-acceptance/ (handled next);
//   - allows sealed-acceptance/ changes only when the PR does not also change tests/, skills/ or specs/,
//     so the referee and the work it grades can never move in the same PR (the blind evaluator author's
//     PRs touch only sealed-acceptance/, and requirement PRs carry only its checks);
//   - fails on changed visual baselines (*-snapshots/) unless the PR has the visual-approved label
//     (REQ-200 AC2). The workflow passes the labels in PR_LABELS.
import fs from 'node:fs';

const file = 'harness/hooks/heal-diff-check.mjs';
const next = `#!/usr/bin/env node
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
  diff = sh(\`git diff --unified=0 \${base}...HEAD -- tests/ skills/\`);
  files = sh(\`git diff --name-only \${base}...HEAD\`).split('\\n').filter(Boolean);
} catch (e) {
  console.error(\`heal-diff-check: could not diff against \${base}: \${e.message}\`);
  process.exit(1);
}

const problems = [];
let currentFile = '';
for (const line of diff.split('\\n')) {
  if (line.startsWith('+++ b/')) currentFile = line.slice(6);
  const removed = line.startsWith('-') && !line.startsWith('---');
  const added = line.startsWith('+') && !line.startsWith('+++');
  const text = line.slice(1).trim();
  if (removed && /\\bexpect(\\.soft)?\\s*\\(/.test(line)) problems.push(\`\${currentFile}: assertion removed or changed → \${text}\`);
  if (added && /\\btest(\\.describe)?\\.(skip|fixme)\\s*\\(|\\.skip\\s*\\(/.test(line)) problems.push(\`\${currentFile}: skip/fixme added → \${text}\`);
  if (added && /\\bwaitForTimeout\\s*\\(/.test(line)) problems.push(\`\${currentFile}: hard wait added → \${text}\`);
  const t = added && line.match(/timeout\\s*:\\s*([\\d_]+)/);
  if (t && Number(t[1].replace(/_/g, '')) > 15000) problems.push(\`\${currentFile}: timeout above policy (\${t[1]}ms)\`);
}

const sealed = files.filter((f) => f.startsWith('sealed-acceptance/'));
const graded = files.filter((f) => /^(tests|skills|specs)\\//.test(f));
if (sealed.length && graded.length)
  problems.push(\`sealed-acceptance/ and tests/skills/specs changed in the same PR (\${sealed.length} + \${graded.length} files). The referee and the work it grades must land separately.\`);
for (const f of files) {
  if (/-snapshots\\//.test(f) && !labels.has('visual-approved')) problems.push(\`\${f}: visual baseline changed; needs the owner's visual-approved label (REQ-200 AC2)\`);
  if (inGuard(f)) problems.push(\`\${f}: the guard itself changed (human-owned)\`);
}

if (problems.length) {
  console.error('heal-diff-check: this PR needs human review:\\n  - ' + problems.join('\\n  - '));
  process.exit(1);
}
console.log('heal-diff-check: no weakening detected.');
`;

const now = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
if (now === next) console.log(`Already applied: ${file}`);
else {
  fs.writeFileSync(file, next);
  console.log(`Changed: ${file}`);
}

// Workflow: pass the PR's labels to the check, and re-run checks when a label is added or removed
// (so adding visual-approved re-evaluates the PR without a manual re-run).
const wf = '.github/workflows/qa.yml';
let y = fs.readFileSync(wf, 'utf8').replace(/\r\n/g, '\n');
const y0 = y;
if (!y.includes('PR_LABELS:')) {
  y = y.replace(
    '        run: node harness/hooks/heal-diff-check.mjs\n        env:\n          BASE_REF: origin/${{ github.base_ref }}\n',
    "        run: node harness/hooks/heal-diff-check.mjs\n        env:\n          BASE_REF: origin/${{ github.base_ref }}\n          PR_LABELS: ${{ join(github.event.pull_request.labels.*.name, ',') }}\n",
  );
  if (!y.includes('PR_LABELS:')) throw new Error(`${wf}: could not find the heal-diff-check step`);
}
const TYPES = '    types: [opened, synchronize, reopened, labeled, unlabeled]\n';
if (!y.includes(TYPES)) {
  y = y.replace('on:\n  pull_request:\n', 'on:\n  pull_request:\n' + TYPES);
  if (!y.includes(TYPES)) throw new Error(`${wf}: could not find the pull_request trigger`);
}
if (y !== y0) {
  fs.writeFileSync(wf, y);
  console.log(`Changed: ${wf}`);
} else console.log(`Already applied: ${wf}`);

console.log('\nNext: commit both files on a branch, push, and open a PR WITHOUT the agent-authored label.');
