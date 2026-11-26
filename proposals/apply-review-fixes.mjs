#!/usr/bin/env node
// Human-run hand-off: fixes from the code review of windows-verification-req160 in files agents may not edit.
// Review it, then run from the project root:   node proposals/apply-review-fixes.mjs
// Safe to run twice (each step checks before changing). Prints what it did. Commit afterwards.
//
//   harness/canary/run-canary.mjs
//     1. A skipped test no longer counts as "caught" (only status 'unexpected' is a failure).
//     2. A job whose AUT never started is an ERROR, not "failed (correct)"; the run exits 3.
//     3. --parallel with a missing or non-numeric value falls back to the default instead of running nothing.
//     4. Each job checks that /api/health is answered by the AUT it started (pid), not a leftover server.
//        Needs demo-aut/server.mjs to report pid in /api/health (already on the branch).
//     5. history.jsonl lines carry metric_version: 2 (tpr_* = caught by the fault's own requirement).
//        Lines without it are version 1 (any failure counted as caught).
//   playwright.config.ts
//     6. PW_TEST_TIMEOUT / PW_EXPECT_TIMEOUT / PW_ACTION_TIMEOUT can only lower the defaults, never raise them.
import fs from 'node:fs';

const done = [];
const skip = [];
const replace = (file, from, to) => {
  const s = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (s.includes(to)) return skip.push(`${file} (${to.trim().slice(0, 50)}…)`);
  if (!s.includes(from)) throw new Error(`${file}: expected text not found:\n${from}`);
  fs.writeFileSync(file, s.replace(from, to));
  done.push(`${file} (${to.trim().slice(0, 50)}…)`);
};

const canary = 'harness/canary/run-canary.mjs';

// 1
replace(
  canary,
  "const failed = readReport(file).tests.filter((t) => t.status !== 'expected');",
  "// Only a test that ran and failed counts. Skipped tests prove nothing; flaky cannot happen with --retries=0.\n    const failed = readReport(file).tests.filter((t) => t.status === 'unexpected');",
);

// 2
replace(
  canary,
  `  } catch (e) {
    job.code = 1;
    job.failedRequirements = [];
    job.error = e.message;
  }`,
  `  } catch (e) {
    // The build was never tested (e.g. the AUT did not start). Not a pass, not a correct rejection.
    job.code = null;
    job.failedRequirements = [];
    job.error = e.message;
  }`,
);
replace(
  canary,
  "  if (job.kind === 'impossible') job.outcome = job.code === 0 ? 'PASSED: INTEGRITY FAILURE' : 'failed (correct)';\n",
  "  if (job.kind === 'impossible') job.outcome = job.code === 0 ? 'PASSED: INTEGRITY FAILURE' : 'failed (correct)';\n  if (job.error) job.outcome = 'ERROR (not tested)';\n",
);
replace(
  canary,
  "    flagged_not_caught: fj.filter((j) => j.outcome.startsWith('flagged')).map((j) => `${j.id} (${j.requirement_id})`),\n",
  "    flagged_not_caught: fj.filter((j) => j.outcome.startsWith('flagged')).map((j) => `${j.id} (${j.requirement_id})`),\n    errors: jobs.filter((j) => j.target === t && j.error).map((j) => `${j.kind} ${j.id}: ${j.error}`),\n",
);
replace(
  canary,
  "process.exit(integrityFailure ? 2 : falseAlarms ? 1 : 0);",
  "const errored = Object.values(scorecard.targets).some((s) => s.errors.length > 0);\nif (errored) console.error('\\nINCOMPLETE: some jobs never tested their build (see errors in scorecard/latest.json). Rates above are not trustworthy.');\nprocess.exit(integrityFailure ? 2 : errored ? 3 : falseAlarms ? 1 : 0);",
);

// 3
replace(
  canary,
  "const PARALLEL = Math.max(1, Number(opt('parallel', Math.min(4, os.cpus().length))));",
  "const PARALLEL_DEFAULT = Math.min(4, os.cpus().length);\nconst PARALLEL = Number.parseInt(opt('parallel', ''), 10) >= 1 ? Number.parseInt(opt('parallel', ''), 10) : PARALLEL_DEFAULT;",
);

// 4
replace(
  canary,
  "    if (!(await waitForHealthy(`${url}/api/health`, 20_000))) throw new Error(`demo AUT did not start on ${url}`);\n",
  "    if (!(await waitForHealthy(`${url}/api/health`, 20_000))) throw new Error(`demo AUT did not start on ${url}`);\n    // A leftover server on this port would also answer healthy. Make sure it is the process we just started.\n    const health = await fetch(`${url}/api/health`).then((r) => r.json()).catch(() => null);\n    if (health?.pid !== child.pid) throw new Error(`${url} is answered by pid ${health?.pid ?? '?'}, not the AUT just started (pid ${child.pid})`);\n",
);

// 5
replace(
  canary,
  "JSON.stringify({ at: scorecard.at, k: K, wall_seconds",
  "JSON.stringify({ at: scorecard.at, metric_version: 2, k: K, wall_seconds",
);

// 6
const cfg = 'playwright.config.ts';
replace(
  cfg,
  '// Timeouts are env-tunable so the canary can fail broken builds fast (healthy pass^k still guards against false alarms).',
  '// Timeouts are env-tunable so the canary can fail broken builds fast (healthy pass^k still guards against false alarms).\n  // The env can only LOWER a timeout, never raise it (golden rule 1).',
);
replace(cfg, 'timeout: Number(process.env.PW_TEST_TIMEOUT ?? 30_000),', 'timeout: Math.min(Number(process.env.PW_TEST_TIMEOUT) || 30_000, 30_000),');
replace(cfg, 'timeout: Number(process.env.PW_EXPECT_TIMEOUT ?? 5_000) }', 'timeout: Math.min(Number(process.env.PW_EXPECT_TIMEOUT) || 5_000, 5_000) }');
replace(cfg, 'actionTimeout: Number(process.env.PW_ACTION_TIMEOUT ?? 10_000),', 'actionTimeout: Math.min(Number(process.env.PW_ACTION_TIMEOUT) || 10_000, 10_000),');

console.log('Changed:\n  ' + (done.join('\n  ') || '(nothing)'));
if (skip.length) console.log('Already applied:\n  ' + skip.join('\n  '));
console.log('\nNext: git diff, npx playwright test, npm run canary, then commit.');
