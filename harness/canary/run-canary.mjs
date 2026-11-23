#!/usr/bin/env node
// Integrity canary + scorecard. Runs the builder suite and the sealed evaluator against:
//   • a healthy build k times          → TNR / pass^k (false-alarm rate)
//   • each planted fault              → TPR (detection rate), split optimisation vs holdout
//   • each impossible build           → must NEVER pass (exit code 2 if it does)
// Results: scorecard/latest.json + one line appended to scorecard/history.jsonl
//
// Usage: node harness/canary/run-canary.mjs [--k 3] [--only suite|evaluator] [--faults id1,id2]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runPlaywright, waitForHealthy } from '../lib/playwright.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const K = Number(opt('k', 3));
const only = opt('only', null);
const pick = opt('faults', null)?.split(',');
const catalogue = JSON.parse(fs.readFileSync('sealed-acceptance/seeded-faults/catalogue.json', 'utf8'));
const faults = catalogue.faults.filter((f) => !pick || pick.includes(f.id));
const impossible = catalogue.impossible.filter((f) => !pick || pick.includes(f.id));
const outDir = path.join('scorecard', 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(outDir, { recursive: true });

let port = 4310;
async function withAut(fault, fn) {
  const p = port++;
  const child = spawn(process.execPath, ['demo-aut/server.mjs'], { env: { ...process.env, PORT: String(p), FAULT: fault ?? '' }, stdio: 'ignore' });
  try {
    const url = `http://localhost:${p}`;
    if (!(await waitForHealthy(`${url}/api/health`, 20_000))) throw new Error(`demo AUT did not start on ${url}`);
    return await fn(url);
  } finally {
    child.kill();
  }
}

const runSuite = (url, tag) => runPlaywright(['test', '--retries=0', '--reporter=json'], { env: { BASE_URL: url, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(outDir, `suite-${tag}.json`) }, quiet: true });
const runEvaluator = (url, tag) =>
  new Promise((resolve) => {
    const c = spawn(process.execPath, ['sealed-acceptance/evaluator/run-evaluator.mjs', '--requirements', 'requirements', '--url', url, '--out', path.join(outDir, `verdicts-${tag}.json`), '--report', path.join(outDir, `eval-${tag}.json`), '--quiet'], { stdio: 'ignore' });
    c.on('close', (code) => resolve(code ?? 1));
  });

const targets = { suite: runSuite, evaluator: runEvaluator };
const active = Object.keys(targets).filter((t) => !only || t === only);
const results = { healthy: {}, faults: [], impossible: [] };

console.log(`Canary: ${K}× healthy, ${faults.length} planted fault(s), ${impossible.length} impossible build(s); targets: ${active.join(' + ')}\n`);

// Healthy build, k runs each → pass^k
for (const t of active) {
  let passes = 0;
  for (let i = 1; i <= K; i++) {
    const code = await withAut(null, (url) => targets[t](url, `healthy-${i}`));
    if (code === 0) passes++;
    process.stdout.write(`  healthy  ${t.padEnd(9)} run ${i}/${K}: ${code === 0 ? 'pass' : 'FAIL (false alarm)'}\n`);
  }
  results.healthy[t] = { runs: K, passes, tnr: passes / K, passK: passes === K };
}

// Planted faults → detection
for (const f of faults) {
  const row = { id: f.id, requirement_id: f.requirement_id, split: f.split };
  for (const t of active) {
    const code = await withAut(f.id, (url) => targets[t](url, f.id));
    row[t] = code !== 0 ? 'detected' : 'MISSED';
  }
  results.faults.push(row);
  console.log(`  fault    ${f.id.padEnd(24)} ${active.map((t) => `${t}: ${row[t]}`).join('  ')}`);
}

// Impossible builds → must never pass
for (const f of impossible) {
  const row = { id: f.id };
  for (const t of active) {
    const code = await withAut(f.id, (url) => targets[t](url, f.id));
    row[t] = code !== 0 ? 'failed (correct)' : 'PASSED: INTEGRITY FAILURE';
  }
  results.impossible.push(row);
  console.log(`  canary   ${f.id.padEnd(24)} ${active.map((t) => `${t}: ${row[t]}`).join('  ')}`);
}

// Scorecard
const tpr = (t, split) => {
  const rows = results.faults.filter((r) => !split || r.split === split);
  return rows.length ? rows.filter((r) => r[t] === 'detected').length / rows.length : null;
};
const scorecard = { at: new Date().toISOString(), k: K, targets: {} };
for (const t of active) {
  scorecard.targets[t] = {
    tpr_all: tpr(t),
    tpr_optimisation: tpr(t, 'optimisation'),
    tpr_holdout: tpr(t, 'holdout'),
    tnr: results.healthy[t].tnr,
    pass_k_healthy: results.healthy[t].passK,
    impossible_green: results.impossible.filter((r) => r[t].startsWith('PASSED')).length,
    missed: results.faults.filter((r) => r[t] === 'MISSED').map((r) => `${r.id} (${r.requirement_id})`),
  };
}
scorecard.details = results;
fs.mkdirSync('scorecard', { recursive: true });
fs.writeFileSync('scorecard/latest.json', JSON.stringify(scorecard, null, 2));
fs.appendFileSync('scorecard/history.jsonl', JSON.stringify({ at: scorecard.at, k: K, targets: Object.fromEntries(Object.entries(scorecard.targets).map(([t, s]) => [t, { tpr_holdout: s.tpr_holdout, tnr: s.tnr, impossible_green: s.impossible_green }])) }) + '\n');

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
console.log('\nScorecard');
console.log('  target     TPR(all)  TPR(holdout)  TNR    pass^k  impossible-green  missed');
for (const [t, s] of Object.entries(scorecard.targets)) {
  console.log(`  ${t.padEnd(10)} ${pct(s.tpr_all).padEnd(9)} ${pct(s.tpr_holdout).padEnd(13)} ${pct(s.tnr).padEnd(6)} ${String(s.pass_k_healthy).padEnd(7)} ${String(s.impossible_green).padEnd(17)} ${s.missed.join(', ') || '—'}`);
}
console.log('\nWritten to scorecard/latest.json');

const integrityFailure = Object.values(scorecard.targets).some((s) => s.impossible_green > 0);
const falseAlarms = Object.values(scorecard.targets).some((s) => !s.pass_k_healthy);
if (integrityFailure) console.error('\nINTEGRITY FAILURE: an impossible build passed. Investigate before trusting any result.');
process.exit(integrityFailure ? 2 : falseAlarms ? 1 : 0);
