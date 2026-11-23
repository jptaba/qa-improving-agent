#!/usr/bin/env node
// Control plane: a deterministic pipeline that decides WHAT runs; agents only do bounded jobs inside it.
//
//   1. Authoring queue  → in-scope requirements with no passing/pending test (from the inventory)
//   2. Plan + generate  → qa-planner then qa-generator per queued requirement (budget-capped)
//      (admission)     → new test must pass k consecutive runs with retries off
//   3. Execute          → full deterministic suite (no LLM)
//   4. Triage           → qa-triage per failure, capped heal attempts; real bugs are escalated
//   5. Record           → evidence/run-<ts>/summary.json + memory/failures.jsonl
//
// Flags: --dry-run (print agent calls, don't run them) · --no-agents (deterministic steps only)
//        --base-url <url> (test an already-running build instead of starting the demo AUT)
import fs from 'node:fs';
import path from 'node:path';
import { loadRequirements, loadInventory } from '../lib/requirements.mjs';
import { runPlaywright, readReport } from '../lib/playwright.mjs';
import { runAgent } from './agent-runner.mjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const noAgents = argv.includes('--no-agents');
const baseUrlArg = argv.includes('--base-url') ? argv[argv.indexOf('--base-url') + 1] : null;

const cfg = JSON.parse(fs.readFileSync('harness/config.json', 'utf8'));
const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const runDir = path.join('evidence', runId);
fs.mkdirSync(runDir, { recursive: true });
const env = baseUrlArg ? { BASE_URL: baseUrlArg } : {};
const baseUrl = baseUrlArg ?? cfg.baseUrl;

const summary = { runId, startedAt: new Date().toISOString(), mode: dryRun ? 'dry-run' : noAgents ? 'no-agents' : 'full', authoring: [], suite: null, triage: [], spendUsd: 0, needsHuman: [] };
let spend = 0;
const budgetLeft = () => spend < cfg.budgets.maxUsdPerRun;
const log = (...a) => console.log(...a);
const step = (n, title) => log(`\n━━ ${n}. ${title} ━━`);

async function agent(role, task) {
  if (noAgents) return { ok: false, skipped: true, costUsd: 0 };
  if (!budgetLeft()) return { ok: false, budgetExhausted: true, costUsd: 0 };
  const r = await runAgent(role, task, { cfg, dryRun, log });
  spend += r.costUsd ?? 0;
  return r;
}

// ── 1. Authoring queue ───────────────────────────────────────────────
step(1, 'Authoring queue');
const reqs = loadRequirements();
const inv = loadInventory();
const covered = new Set(inv.tests.filter((t) => ['passing', 'pending-review'].includes(t.status)).map((t) => t.requirement_id));
const queue = reqs.filter((r) => r.status === 'in-scope' && !covered.has(r.id)).slice(0, cfg.budgets.maxRequirementsPerRun);
log(queue.length ? queue.map((r) => `  • ${r.id} ${r.title}`).join('\n') : '  (nothing to author: every in-scope requirement has a test)');

// ── 2–3. Plan, generate, admit ───────────────────────────────────────
step(2, 'Plan → generate → admit');
for (const r of queue) {
  const entry = { requirement_id: r.id, planned: false, generated: false, admitted: false };
  summary.authoring.push(entry);
  log(`  ${r.id}:`);
  const plan = await agent('qa-planner', `Requirement: ${r.id} (${r.file}). Base URL: ${baseUrl}. Write specs/${r.id}.md.`);
  entry.planned = plan.ok;
  if (!plan.ok) {
    entry.reason = plan.skipped ? 'agents disabled' : plan.budgetExhausted ? 'budget exhausted → needs human' : plan.error ?? 'planner failed';
    if (plan.budgetExhausted) summary.needsHuman.push({ requirement_id: r.id, reason: 'budget exhausted' });
    log(`    planner: ${entry.reason}`);
    continue;
  }
  const gen = await agent('qa-generator', `Plan: specs/${r.id}.md. Write tests/generated/${r.id}.spec.ts. Base URL: ${baseUrl}.`);
  entry.generated = gen.ok;
  const file = `tests/generated/${r.id}.spec.ts`;
  if (dryRun || !gen.ok || !fs.existsSync(file)) {
    entry.reason = dryRun ? 'dry-run' : gen.error ?? 'no test file produced';
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  if (/waitForTimeout|test\.(skip|fixme)\(/.test(src)) {
    entry.reason = 'rejected: forbidden pattern in generated test';
    continue;
  }
  const k = cfg.admission.passK;
  log(`    admission: ${k} consecutive runs, retries off…`);
  const code = await runPlaywright(['test', file, `--repeat-each=${k}`, '--retries=0', '--reporter=line,json'], { env: { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(runDir, `admission-${r.id}.json`) } });
  entry.admitted = code === 0;
  entry.reason = entry.admitted ? `passed ${k}/${k} → inventory status pending-review (human review next)` : 'failed admission → escalate (possible AUT bug or unstable test)';
  if (entry.admitted) {
    // Control plane (not an agent) updates the inventory status.
    const t = inv.tests.find((x) => x.requirement_id === r.id && x.test === file);
    if (t) t.status = 'pending-review';
    else inv.tests.push({ id: `T-${r.id.slice(4)}-gen`, requirement_id: r.id, criterion: 'generated', test: file, status: 'pending-review' });
    fs.writeFileSync('inventory/tests.json', JSON.stringify(inv, null, 2) + '\n');
  } else summary.needsHuman.push({ requirement_id: r.id, reason: 'generated test failed admission' });
  log(`    ${entry.reason}`);
}

// ── 3. Execute the deterministic suite ───────────────────────────────
step(3, 'Run the deterministic suite (no LLM)');
const reportFile = path.join(runDir, 'results.json');
await runPlaywright(['test'], { env: { ...env, PW_JSON_OUTPUT: reportFile } });
const { tests } = readReport(reportFile);
const failures = tests.filter((t) => t.status !== 'expected');
summary.suite = {
  total: tests.length,
  passed: tests.filter((t) => t.status === 'expected').length,
  failed: tests.filter((t) => t.status === 'unexpected').length,
  flaky: tests.filter((t) => t.status === 'flaky').length,
  skipped: tests.filter((t) => t.status === 'skipped').length,
};
log(`  ${summary.suite.passed}/${summary.suite.total} passed · ${summary.suite.failed} failed · ${summary.suite.flaky} flaky · ${summary.suite.skipped} skipped (skips count as failures)`);

// ── 4. Triage failures (capped) ──────────────────────────────────────
step(4, 'Triage');
const attemptsFile = 'memory/heal-attempts.json';
const attempts = fs.existsSync(attemptsFile) ? JSON.parse(fs.readFileSync(attemptsFile, 'utf8')) : {};
for (const f of failures.slice(0, cfg.budgets.maxTriagePerRun)) {
  const key = `${f.file}::${f.title}`;
  const n = attempts[key] ?? 0;
  const rec = { test: f.title, file: f.file, requirement_id: f.requirements[0] ?? null, status: f.status, error: f.error };
  if (n >= cfg.budgets.maxHealAttemptsPerTest) {
    rec.action = 'needs-human (heal cap reached)';
    summary.needsHuman.push({ test: f.title, reason: 'heal cap reached' });
  } else {
    const evidence = f.attachments.map((a) => `${a.name}: ${a.path}`).join('\n') || 'none';
    const r = await agent('qa-triage', `Failing test: ${f.title}\nFile: ${f.file}\nRequirement: ${rec.requirement_id}\nStatus: ${f.status}\nError: ${f.error}\nEvidence:\n${evidence}`);
    rec.action = r.skipped ? 'untriaged (agents disabled)' : r.budgetExhausted ? 'needs-human (budget exhausted)' : r.ok ? 'triaged' : `triage failed: ${r.error ?? 'unknown'}`;
    if (!dryRun && !r.skipped && !r.budgetExhausted) attempts[key] = n + 1;
    if (r.result) rec.agent_result = String(r.result).slice(0, 2000);
  }
  summary.triage.push(rec);
  log(`  • ${f.title} → ${rec.action}`);
  fs.appendFileSync('memory/failures.jsonl', JSON.stringify({ ts: new Date().toISOString(), run: runId, test: f.title, requirement_id: rec.requirement_id, class: 'untriaged', error: f.error, action: rec.action }) + '\n');
}
if (!failures.length) log('  (no failures)');
if (!dryRun) fs.writeFileSync(attemptsFile, JSON.stringify(attempts, null, 2));

// ── 5. Record ────────────────────────────────────────────────────────
summary.spendUsd = Number(spend.toFixed(4));
summary.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
step(5, 'Summary');
log(`  Evidence: ${runDir}/summary.json · agent spend $${summary.spendUsd} of $${cfg.budgets.maxUsdPerRun}`);
if (summary.needsHuman.length) log(`  Needs a person: ${summary.needsHuman.length} item(s). Budget exhaustion is never treated as a pass.`);
process.exit(failures.length || summary.needsHuman.length ? 1 : 0);
