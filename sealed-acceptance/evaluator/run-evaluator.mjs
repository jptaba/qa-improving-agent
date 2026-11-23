#!/usr/bin/env node
// Blind acceptance evaluator. Inputs: requirements folder + URL of a running build. Nothing else.
// Output: one verdict per in-scope requirement → sealed-acceptance/out/verdicts.json
// Self-contained on purpose: imports nothing from harness/, skills/ or tests/.
//
// Usage: node sealed-acceptance/evaluator/run-evaluator.mjs --requirements requirements --url http://localhost:4173 [--out file]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVALUATOR_VERSION = 'eval-0.1.0';
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'out');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const reqDir = path.resolve(arg('requirements', 'requirements'));
const url = arg('url', process.env.EVAL_BASE_URL ?? 'http://localhost:4173');
const outFile = path.resolve(arg('out', path.join(outDir, 'verdicts.json')));
const reportFile = path.resolve(arg('report', path.join(outDir, 'eval-results.json')));
const quiet = process.argv.includes('--quiet');

// 1. Requirements in scope (frontmatter: id, title, status)
function loadRequirements(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^REQ-\d+.*\.md$/.test(f))
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
      const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      const get = (k) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim();
      const acs = [...text.matchAll(/\*\*(AC\d+):\*\*\s*(.+)/g)].map((m) => `${m[1]}: ${m[2]}`);
      return { id: get('id'), title: get('title'), status: get('status'), criteria: acs, file: f };
    })
    .filter((r) => r.id && r.status === 'in-scope');
}
const requirements = loadRequirements(reqDir);

// 2. Health check: if the build isn't reachable, everything is could_not_verify (never pass)
async function healthy() {
  try {
    const res = await fetch(new URL('/api/health', url));
    return res.ok;
  } catch {
    return false;
  }
}

// 3. Run the private acceptance tests
function runTests() {
  const require = createRequire(import.meta.url);
  let cli;
  try {
    cli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
  } catch {
    cli = path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
  }
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(reportFile)) fs.rmSync(reportFile);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'test', '-c', path.join(here, 'playwright.config.ts')], {
      env: { ...process.env, EVAL_BASE_URL: url, EVAL_REPORT: reportFile },
      stdio: quiet ? 'ignore' : 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

function flatten(report) {
  const out = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.[t.results.length - 1];
        const reqs = new Set([...(spec.tags ?? []).map((x) => x.replace(/^@/, '')), ...(spec.title.match(/REQ-\d+/g) ?? [])]);
        out.push({
          title: spec.title,
          status: t.status,
          requirements: [...reqs].filter((r) => /^REQ-\d+$/.test(r)),
          error: (last?.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim())?.trim() ?? null,
          attachments: (last?.attachments ?? []).filter((a) => a.path).map((a) => ({ name: a.name, path: a.path })),
        });
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of report.suites ?? []) walk(s);
  return out;
}

// 4. Map test results → verdicts. A pass needs every check to pass first time.
const RANK = { fail: 3, could_not_verify: 2, unknown: 1, pass: 0 };
const toVerdict = (status) => ({ expected: 'pass', unexpected: 'fail', flaky: 'unknown', skipped: 'could_not_verify' })[status] ?? 'unknown';

const up = await healthy();
let checks = [];
if (up) {
  await runTests();
  if (fs.existsSync(reportFile)) checks = flatten(JSON.parse(fs.readFileSync(reportFile, 'utf8')));
}

const now = new Date().toISOString();
const verdicts = requirements.map((r) => {
  const mine = checks.filter((c) => c.requirements.includes(r.id));
  let verdict = 'could_not_verify';
  if (up && mine.length) verdict = mine.map((c) => toVerdict(c.status)).sort((a, b) => RANK[b] - RANK[a])[0];
  const firstBad = mine.find((c) => c.status !== 'expected');
  return {
    requirement_id: r.id,
    title: r.title,
    verdict,
    observed: !up ? 'Build not reachable (health check failed)' : mine.length === 0 ? 'No acceptance check covers this requirement yet' : firstBad?.error ?? null,
    expected: firstBad ? r.criteria.find((c) => firstBad.title.includes(c.split(':')[0])) ?? r.criteria.join(' | ') : null,
    evidence: mine.flatMap((c) => c.attachments),
    checks: mine.map((c) => ({ title: c.title, status: c.status, error: c.error })),
    evaluator_version: EVALUATOR_VERSION,
    evaluated_at: now,
    target: url,
  };
});

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ target: url, evaluated_at: now, evaluator_version: EVALUATOR_VERSION, verdicts }, null, 2));

const icon = { pass: 'PASS', fail: 'FAIL', unknown: 'UNKNOWN', could_not_verify: 'COULD NOT VERIFY' };
console.log(`\nAcceptance verdicts for ${url}`);
for (const v of verdicts) console.log(`  ${icon[v.verdict].padEnd(17)} ${v.requirement_id}  ${v.title}${v.verdict !== 'pass' && v.observed ? `\n                    ↳ ${v.observed}` : ''}`);
console.log(`\nWritten to ${path.relative(process.cwd(), outFile)}`);
process.exit(verdicts.every((v) => v.verdict === 'pass') ? 0 : 1);
