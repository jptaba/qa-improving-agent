#!/usr/bin/env node
// Human-run hand-off: roadmap items that touch files agents may not edit.
// Review it, then run from the project root:   node proposals/apply-roadmap-edits.mjs
// Safe to run twice (each step checks before changing). Prints what it did. Commit afterwards.
//
//   1. sealed-acceptance/seeded-faults/catalogue.json
//        add planted faults double-submit (REQ-180, optimisation) and foreign-order-visible (REQ-190, holdout).
//        Both switches already exist in demo-aut/server.mjs. The agent never read this file: check the
//        new entries match the shape of the existing ones before committing.
//        Until the sealed checks for REQ-180/190 exist, the evaluator will report both as MISSED
//        (see escalations/2026-11-25T2345-evaluator-no-checks-req180-req190.yml). The suite catches both.
//   2. .github/workflows/qa.yml
//        new PR job contract-fuzz: Schemathesis against requirements/openapi/ via `npm run contract:fuzz`.
//        Verified locally on 2026-11-26 against the demo AUT: 285 generated, 285 passed.
import fs from 'node:fs';

const done = [];
const skip = [];

// 1
const catFile = 'sealed-acceptance/seeded-faults/catalogue.json';
const raw = fs.readFileSync(catFile, 'utf8');
const cat = JSON.parse(raw);
const additions = [
  { id: 'double-submit', requirement_id: 'REQ-180', split: 'optimisation', description: 'Pay now has no in-flight guard; repeat clicks create extra orders' },
  { id: 'foreign-order-visible', requirement_id: 'REQ-190', split: 'holdout', description: "any signed-in shopper can open another shopper's confirmation page" },
];
let added = 0;
for (const a of additions) {
  if (cat.faults.some((f) => f.id === a.id)) continue;
  // Keep only the keys the existing entries use (plus id/requirement_id/split, which the canary reads).
  const keys = new Set(['id', 'requirement_id', 'split', ...Object.keys(cat.faults[0] ?? {})]);
  cat.faults.push(Object.fromEntries(Object.entries(a).filter(([k]) => keys.has(k))));
  added++;
}
if (added) {
  const indent = /\n( +)"/.exec(raw)?.[1].length ?? 2;
  fs.writeFileSync(catFile, JSON.stringify(cat, null, indent) + '\n');
  done.push(`${catFile} (+${added} fault(s))`);
} else skip.push(catFile);

// 2
const wf = '.github/workflows/qa.yml';
const s = fs.readFileSync(wf, 'utf8').replace(/\r\n/g, '\n');
if (s.includes('  contract-fuzz:')) skip.push(wf);
else {
  const job = `  contract-fuzz:
    # Property-based run against the frozen OpenAPI contract (roadmap Phase 3).
    if: github.event_name != 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install "schemathesis>=4.34,<5"
      - name: Start demo AUT (replace with preview URL)
        run: |
          node demo-aut/server.mjs &
          npx --yes wait-on http://localhost:4173/api/health
      - name: Schemathesis against requirements/openapi/orders.yaml (required check)
        run: npm run contract:fuzz

  canary:
`;
  if (!s.includes('\n  canary:\n')) throw new Error(`${wf}: expected a "canary:" job to insert before`);
  fs.writeFileSync(wf, s.replace('\n  canary:\n', '\n' + job));
  done.push(`${wf} (+ contract-fuzz job)`);
}

console.log('Changed:\n  ' + (done.join('\n  ') || '(nothing)'));
if (skip.length) console.log('Already applied:\n  ' + skip.join('\n  '));
console.log('\nNext: git diff, npm run canary (expect suite caught 7/7), then commit.');
