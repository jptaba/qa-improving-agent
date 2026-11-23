#!/usr/bin/env node
// Integrity canary + scorecard. Runs the builder suite and the sealed evaluator against:
//   • a healthy build k times          → TNR / pass^k (false-alarm rate)
//   • each planted fault              → TPR (detection rate), split optimisation vs holdout
//   • each impossible build           → must NEVER pass (exit code 2 if it does)
//
// A planted fault only counts as CAUGHT when a check for *its* requirement failed. A failure elsewhere
// (collateral damage) is reported as "flagged" — it proves something broke, not that the right test caught it.
//
// Results: scorecard/latest.json + one line appended to scorecard/history.jsonl
//
// Usage: node harness/canary/run-canary.mjs [--k 3] [--only suite|evaluator] [--faults id1,id2]
//                                           [--parallel N] [--timeouts fast|default]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPlaywright, readReport, waitForHealthy } from '../lib/playwright.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const K = Number(opt('k', 3));
const only = opt('only', null);
const pick = opt('faults', null)?.split(',');
const PARALLEL = Math.max(1, Number(opt('parallel', Math.min(4, os.cpus().length))));
const TIMEOUTS = opt('timeouts', 'fast');
// Fast timeouts suit a local/demo AUT that answers in milliseconds. Healthy pass^k runs use the same
// timeouts, so if they are too tight for your AUT the scorecard shows false alarms; then use --timeouts default.
const timeoutEnv = TIMEOUTS === 'fast' ? { PW_TEST_TIMEOUT: '15000', PW_EXPECT_TIMEOUT: '2000', PW_ACTION_TIMEOUT: '3000' } : {};
// No retries in the canary: healthy runs must pass first time (stricter pass^k) and broken builds fail faster.
const retryEnv = { EVAL_RETRIES: '0' };

const catalogue = JSON.parse(fs.readFileSync('sealed-acceptance/seeded-faults/catalogue.json', 'utf8'));
const faults = catalogue.faults.filter((f) => !pick || pick.includes(f.id));
const impossible = catalogue.impossible.filter((f) => !pick || pick.includes(f.id));
const outDir = path.join('scorecard', 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(outDir, { recursive: true });

let nextPort = 4310;
async function withAut(fault, fn) {
  const p = nextPort++;
  const child = spawn(process.execPath, ['demo-aut/server.mjs'], { env: { ...process.env, PORT: String(p), FAULT: fault ?? '' }, stdio: 'ignore' });
  try {
    const url = `http://localhost:${p}`;
    if (!(await waitForHealthy(`${url}/api/health`, 20_000))) throw new Error(`demo AUT did not start on ${url}`);
    return await fn(url);
  } finally {
    child.kill();
  }
}

// Each target returns { code, failedRequirements: Set } so detection can be attributed.
const targets = {
  async suite(url, tag) {
    const file = path.join(outDir, `suite-${tag}.json`);
    const code = await runPlaywright(['test', '--retries=0', '--workers=1', '--reporter=json'], {
      env: { ...timeoutEnv, BASE_URL: url, PLAYWRIGHT_JSON_OUTPUT_FILE: file, PW_OUTPUT_DIR: path.resolve(outDir, 'artifacts', `suite-${tag}`) },
      quiet: true,
    });
    const failed = readReport(file).tests.filter((t) => t.status !== 'expected');
    return { code, failedRequirements: new Set(failed.flatMap((t) => t.requirements)) };
  },
  evaluator(url, tag) {
    const out = path.join(outDir, `verdicts-${tag}.json`);
    return new Promise((resolve) => {
      const c = spawn(
        process.execPath,
        ['sealed-acceptance/evaluator/run-evaluator.mjs', '--requirements', 'requirements', '--url', url, '--out', out, '--report', path.join(outDir, `eval-${tag}.json`), '--quiet'],
        { env: { ...process.env, ...timeoutEnv, ...retryEnv, EVAL_OUTPUT_DIR: path.resolve(outDir, 'artifacts', `eval-${tag}`) }, stdio: 'ignore' },
      );
      c.on('close', (code) => {
        let failedRequirements = new Set();
        try {
          const v = JSON.parse(fs.readFileSync(out, 'utf8')).verdicts;
          failedRequirements = new Set(v.filter((x) => x.verdict === 'fail').map((x) => x.requirement_id));
        } catch {
          /* no verdicts file → treated as not attributable */
        }
        resolve({ code: code ?? 1, failedRequirements });
      });
    });
  },
};
const active = Object.keys(targets).filter((t) => !only || t === only);

// Build the job list, then run it through a small worker pool.
const jobs = [];
for (const t of active) for (let i = 1; i <= K; i++) jobs.push({ kind: 'healthy', id: `healthy-${i}`, target: t, fault: null });
for (const f of faults) for (const t of active) jobs.push({ kind: 'fault', id: f.id, target: t, fault: f.id, requirement_id: f.requirement_id, split: f.split });
for (const f of impossible) for (const t of active) jobs.push({ kind: 'impossible', id: f.id, target: t, fault: f.id });

const t0 = Date.now();
console.log(`Canary: ${K}× healthy, ${faults.length} planted fault(s), ${impossible.length} impossible build(s); targets: ${active.join(' + ')}; ${jobs.length} jobs, ${PARALLEL} in parallel, ${TIMEOUTS} timeouts\n`);

async function runJob(job) {
  const start = Date.now();
  try {
    const r = await withAut(job.fault, (url) => targets[job.target](url, `${job.id}-${job.target}`));
    job.code = r.code;
    job.failedRequirements = [...r.failedRequirements];
  } catch (e) {
    job.code = 1;
    job.failedRequirements = [];
    job.error = e.message;
  }
  job.seconds = Number(((Date.now() - start) / 1000).toFixed(1));
  if (job.kind === 'healthy') job.outcome = job.code === 0 ? 'pass' : 'FALSE ALARM';
  if (job.kind === 'fault') job.outcome = job.code === 0 ? 'MISSED' : job.failedRequirements.includes(job.requirement_id) ? 'caught' : 'flagged (wrong requirement)';
  if (job.kind === 'impossible') job.outcome = job.code === 0 ? 'PASSED: INTEGRITY FAILURE' : 'failed (correct)';
  console.log(`  ${job.kind.padEnd(10)} ${job.id.padEnd(24)} ${job.target.padEnd(9)} ${job.outcome.padEnd(27)} ${job.seconds}s${job.error ? `  (${job.error})` : ''}`);
}

let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(PARALLEL, jobs.length) }, async () => {
    while (cursor < jobs.length) await runJob(jobs[cursor++]);
  }),
);

// Scorecard
const of = (t, kind) => jobs.filter((j) => j.target === t && j.kind === kind);
const rate = (arr, pred) => (arr.length ? arr.filter(pred).length / arr.length : null);
const scorecard = { at: new Date().toISOString(), k: K, parallel: PARALLEL, timeouts: TIMEOUTS, wall_seconds: Number(((Date.now() - t0) / 1000).toFixed(1)), targets: {} };
for (const t of active) {
  const fj = of(t, 'fault');
  const hj = of(t, 'healthy');
  scorecard.targets[t] = {
    tpr_all: rate(fj, (j) => j.outcome === 'caught'),
    tpr_optimisation: rate(fj.filter((j) => j.split === 'optimisation'), (j) => j.outcome === 'caught'),
    tpr_holdout: rate(fj.filter((j) => j.split === 'holdout'), (j) => j.outcome === 'caught'),
    any_failure_rate: rate(fj, (j) => j.code !== 0),
    tnr: rate(hj, (j) => j.code === 0),
    pass_k_healthy: hj.every((j) => j.code === 0),
    impossible_green: of(t, 'impossible').filter((j) => j.code === 0).length,
    missed: fj.filter((j) => j.outcome === 'MISSED').map((j) => `${j.id} (${j.requirement_id})`),
    flagged_not_caught: fj.filter((j) => j.outcome.startsWith('flagged')).map((j) => `${j.id} (${j.requirement_id})`),
    seconds: Number(jobs.filter((j) => j.target === t).reduce((s, j) => s + j.seconds, 0).toFixed(1)),
  };
}
scorecard.jobs = jobs.map(({ kind, id, target, requirement_id, split, outcome, failedRequirements, seconds, error }) => ({ kind, id, target, requirement_id, split, outcome, failedRequirements, seconds, error }));
fs.mkdirSync('scorecard', { recursive: true });
fs.writeFileSync('scorecard/latest.json', JSON.stringify(scorecard, null, 2));
fs.appendFileSync(
  'scorecard/history.jsonl',
  JSON.stringify({ at: scorecard.at, k: K, wall_seconds: scorecard.wall_seconds, targets: Object.fromEntries(Object.entries(scorecard.targets).map(([t, s]) => [t, { tpr_holdout: s.tpr_holdout, tpr_all: s.tpr_all, tnr: s.tnr, impossible_green: s.impossible_green }])) }) + '\n',
);

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
console.log(`\nScorecard (wall time ${scorecard.wall_seconds}s)`);
console.log('  target     caught(all)  caught(holdout)  any-fail  TNR    pass^k  impossible-green  not caught on target');
for (const [t, s] of Object.entries(scorecard.targets)) {
  const gaps = [...s.missed.map((m) => `missed ${m}`), ...s.flagged_not_caught.map((m) => `collateral only ${m}`)];
  console.log(`  ${t.padEnd(10)} ${pct(s.tpr_all).padEnd(12)} ${pct(s.tpr_holdout).padEnd(16)} ${pct(s.any_failure_rate).padEnd(9)} ${pct(s.tnr).padEnd(6)} ${String(s.pass_k_healthy).padEnd(7)} ${String(s.impossible_green).padEnd(17)} ${gaps.join(', ') || '—'}`);
}
console.log('\nWritten to scorecard/latest.json');

const integrityFailure = Object.values(scorecard.targets).some((s) => s.impossible_green > 0);
const falseAlarms = Object.values(scorecard.targets).some((s) => !s.pass_k_healthy);
if (integrityFailure) console.error('\nINTEGRITY FAILURE: an impossible build passed. Investigate before trusting any result.');
process.exit(integrityFailure ? 2 : falseAlarms ? 1 : 0);
