#!/usr/bin/env node
// Reads a Playwright JSON report and fails the build on anything that isn't a clean pass.
// Skipped = failed (a healer can skip a test it thinks is broken, which would hide a real bug).
// Flaky   = needs review (passes only on retry). Use --allow-flaky to downgrade flaky to a warning.
import { readReport } from '../lib/playwright.mjs';

const file = process.argv.find((a) => a.endsWith('.json')) ?? 'reports/results.json';
const allowFlaky = process.argv.includes('--allow-flaky');
const { tests, missing } = readReport(file);

if (missing) {
  console.error(`No report at ${file}. Did the test run produce one?`);
  process.exit(1);
}
const by = (s) => tests.filter((t) => t.status === s);
const failed = by('unexpected');
const flaky = by('flaky');
const skipped = by('skipped');
const passed = by('expected');

const list = (label, arr) => arr.length && console.log(`\n${label}:\n` + arr.map((t) => `  - ${t.title} [${t.requirements.join(', ') || 'untagged'}]${t.error ? `\n      ${t.error}` : ''}`).join('\n'));
console.log(`Results: ${passed.length} passed · ${failed.length} failed · ${flaky.length} flaky · ${skipped.length} skipped`);
list('FAILED', failed);
list('SKIPPED (counted as failure)', skipped);
list(allowFlaky ? 'FLAKY (warning)' : 'FLAKY (needs review)', flaky);

const untagged = tests.filter((t) => t.requirements.length === 0 && !/seed/i.test(t.title));
list('UNTAGGED (no @REQ-xxx tag; add one)', untagged);

const bad = failed.length + skipped.length + (allowFlaky ? 0 : flaky.length);
process.exit(bad ? 1 : 0);
