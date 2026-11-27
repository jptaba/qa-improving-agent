#!/usr/bin/env node
// Merges the data files written by harness/reporters/trace-report.mjs (one per run or CI shard)
// into one standalone trace report.
//
//   node harness/reporters/build-trace-report.mjs --out reports/trace-report.html <data.json> [more.json …]
//   node harness/reporters/build-trace-report.mjs --out report.html --dir downloaded-artifacts/
//       (--dir picks up every trace-report*.json below that folder)
import fs from 'node:fs';
import path from 'node:path';
import { renderTraceReport } from './trace-report-html.mjs';

const argv = process.argv.slice(2);
const take = (flag) => {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const out = take('--out') ?? 'reports/trace-report.html';
const dir = take('--dir');
const files = [...argv];
if (dir) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /^trace-report.*\.json$/.test(e.name) ? [path.join(d, e.name)] : []));
  files.push(...walk(dir));
}
if (!files.length) {
  console.error('build-trace-report: no data files given (pass paths or --dir <folder>)');
  process.exit(2);
}
// Trace paths are stored relative to each run's own report; re-point them at the merged report's folder.
const outDir = path.dirname(path.resolve(out));
const runs = files
  .map((f) => {
    const run = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const t of run.tests) for (const r of t.results) if (r.trace) r.trace = path.relative(outDir, path.resolve(path.dirname(f), r.trace)).replace(/\\/g, '/');
    return run;
  })
  .sort((a, b) => String(a.shard).localeCompare(String(b.shard), undefined, { numeric: true }));
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, renderTraceReport(runs));
const tests = runs.reduce((n, r) => n + r.tests.length, 0);
console.log(`build-trace-report: ${out} (${runs.length} run(s), ${tests} tests)`);
