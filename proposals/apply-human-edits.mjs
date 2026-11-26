#!/usr/bin/env node
// Human-run hand-off: applies the edits that agents are not allowed to make.
// Review it, then run from the project root:   node proposals/apply-human-edits.mjs
// Safe to run twice (each step checks before changing). Prints what it did. Commit afterwards.
//
//   1. requirements/REQ-180-single-payment.md      (new; from proposals/requirement-draft-REQ-180-*.md)
//   2. requirements/REQ-190-order-ownership.md     (new; from proposals/requirement-draft-REQ-190-*.md)
//   3. requirements/REQ-170-accessibility.md       (AC1 widened to every page)
//   4. inventory/tests.json                        (REQ-160 -> passing; add REQ-180, REQ-190 entries)
//   5. .claude/agents/qa-generator.md              (escalation files are .yml now)
import fs from 'node:fs';

const done = [];
const skip = [];
const write = (file, text) => {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return skip.push(file);
  fs.writeFileSync(file, text);
  done.push(file);
};
const replace = (file, from, to) => {
  const s = fs.readFileSync(file, 'utf8');
  if (s.includes(to)) return skip.push(`${file} (${to.slice(0, 40)}…)`);
  if (!s.includes(from)) throw new Error(`${file}: expected text not found: ${from}`);
  fs.writeFileSync(file, s.replace(from, to));
  done.push(`${file} (${to.slice(0, 40)}…)`);
};

// 1 + 2: the requirement text is the fenced ```markdown block in each draft.
for (const [draft, target] of [
  ['proposals/requirement-draft-REQ-180-single-payment.md', 'requirements/REQ-180-single-payment.md'],
  ['proposals/requirement-draft-REQ-190-order-ownership.md', 'requirements/REQ-190-order-ownership.md'],
]) {
  const m = /```markdown\r?\n([\s\S]*?)\r?\n```/.exec(fs.readFileSync(draft, 'utf8'));
  if (!m) throw new Error(`${draft}: no \`\`\`markdown block found`);
  write(target, m[1] + '\n');
}

// 3: REQ-170 covers every page.
const r170 = 'requirements/REQ-170-accessibility.md';
replace(r170, 'title: Accessible sign-in and checkout', 'title: Accessible pages');
replace(r170, 'journey: Sign in, Checkout', 'journey: Sign in, Checkout, Confirmation, Not found');
replace(
  r170,
  'on the sign-in and checkout pages.',
  'on every page, including the sign-in, checkout, order confirmation and "page not found" pages.',
);

// 4: inventory.
const invFile = 'inventory/tests.json';
const inv = JSON.parse(fs.readFileSync(invFile, 'utf8'));
const before = JSON.stringify(inv);
const t160 = inv.tests.find((t) => t.id === 'T-0160-01');
if (t160) t160.status = 'passing';
const t170 = inv.tests.find((t) => t.id === 'T-0170-01');
if (t170) t170.criterion = 'AC1+AC2: no detectable WCAG A/AA violations on any page; fields have accessible names';
for (const entry of [
  { id: 'T-0180-01', requirement_id: 'REQ-180', criterion: 'AC1+AC2: one payment at a time; retry after failure', test: 'tests/checkout/single-payment.spec.ts', status: 'passing' },
  { id: 'T-0190-01', requirement_id: 'REQ-190', criterion: 'AC1–AC3: confirmation visible to its buyer only; 404 otherwise', test: 'tests/checkout/order-ownership.spec.ts', status: 'passing' },
]) {
  if (!inv.tests.some((t) => t.id === entry.id)) inv.tests.push(entry);
}
if (JSON.stringify(inv) !== before) {
  fs.writeFileSync(invFile, JSON.stringify(inv, null, 2) + '\n');
  done.push(invFile);
} else skip.push(invFile);

// 5: generator role prompt.
replace('.claude/agents/qa-generator.md', 'escalations/<ts>-<REQ-ID>.json', 'escalations/<ts>-<REQ-ID>.yml');

console.log('Changed:\n  ' + (done.join('\n  ') || '(nothing)'));
if (skip.length) console.log('Already applied:\n  ' + skip.join('\n  '));
console.log('\nNext: git diff, then commit, then tell Claude it is applied.');
