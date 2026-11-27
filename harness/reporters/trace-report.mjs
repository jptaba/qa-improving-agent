// Playwright reporter: a standalone HTML trace report of the run, for teams without a trace backend.
// One file, no network: open it in any browser, attach it to a ticket, or keep it as a CI artifact.
//
// Writes two files (paths can be changed with env):
//   TRACE_REPORT_FILE   default reports/trace-report.html   the report
//   TRACE_REPORT_DATA   default <same name>.json             the raw data, so several runs (CI shards) can be
//                                                            merged into one report with build-trace-report.mjs
//
// It records what the OTel reporter sends (one span per test result, requirement tags, status, retry, error)
// plus each result's step tree (hooks, fixtures, actions, assertions) with timings, the worker it ran on,
// and the path of any Playwright trace file. Never fails the run: a write error is only logged.
import fs from 'node:fs';
import path from 'node:path';
import { renderTraceReport } from './trace-report-html.mjs';

const MAX_STEPS = 300; // per result, so a long test cannot bloat the file
const clean = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const rel = (p) => p.replace(/\\/g, '/');

export function requirementsOf(test) {
  const found = [...(test.tags ?? []), ...(test.titlePath().join(' ').match(/@?REQ-\d+/g) ?? [])];
  return [...new Set(found.map((t) => t.replace(/^@/, '')).filter((t) => /^REQ-\d+$/.test(t)))].sort();
}

export default class TraceReport {
  constructor(options = {}) {
    this.file = options.outputFile || process.env.TRACE_REPORT_FILE || 'reports/trace-report.html';
    this.dataFile = process.env.TRACE_REPORT_DATA || this.file.replace(/\.html?$/i, '') + '.json';
    this.tests = new Map();
  }

  printsToStdio() {
    return false;
  }

  onBegin(config, suite) {
    this.started = Date.now();
    this.workers = config.workers;
    this.shard = config.shard ? `${config.shard.current}/${config.shard.total}` : null;
    this.rootDir = config.rootDir;
    this.planned = suite.allTests().length;
  }

  steps(list, t0, budget) {
    const out = [];
    for (const s of list ?? []) {
      if (budget.left-- <= 0) break;
      out.push({
        t: clean(s.title).slice(0, 200),
        c: s.category,
        s: Math.max(0, s.startTime.getTime() - t0),
        d: Math.max(0, s.duration),
        ...(s.error ? { e: clean(s.error.message).split('\n')[0].slice(0, 300) } : {}),
        ...(s.steps?.length ? { k: this.steps(s.steps, t0, budget) } : {}),
      });
    }
    return out;
  }

  onTestEnd(test, result) {
    const id = test.id;
    if (!this.tests.has(id)) {
      this.tests.set(id, {
        id,
        title: test.title,
        path: test.titlePath().slice(3).filter(Boolean),
        file: rel(path.relative(this.rootDir ?? process.cwd(), test.location.file)),
        line: test.location.line,
        project: test.parent.project()?.name ?? '',
        requirements: requirementsOf(test),
        expected: test.expectedStatus,
        results: [],
      });
    }
    const t0 = result.startTime.getTime();
    const trace = result.attachments.find((a) => a.name === 'trace' && a.path);
    const err = result.errors?.[0] ?? result.error;
    const entry = this.tests.get(id);
    entry.results.push({
      retry: result.retry,
      status: result.status,
      start: t0,
      duration: result.duration,
      worker: result.workerIndex,
      lane: result.parallelIndex,
      ...(err
        ? {
            error: {
              message: clean(err.message).slice(0, 4000),
              ...(err.location ? { at: `${rel(path.relative(this.rootDir ?? process.cwd(), err.location.file))}:${err.location.line}` } : {}),
              ...(err.snippet ? { snippet: clean(err.snippet).slice(0, 2000) } : {}),
            },
          }
        : {}),
      ...(trace ? { trace: rel(path.relative(path.dirname(path.resolve(this.file)), trace.path)) } : {}),
      steps: this.steps(result.steps, t0, { left: MAX_STEPS }),
    });
    entry.outcome = test.outcome();
  }

  async onEnd(result) {
    const run = {
      started: this.started ?? Date.now(),
      duration: Date.now() - (this.started ?? Date.now()),
      status: result.status,
      workers: this.workers,
      shard: this.shard,
      planned: this.planned,
      baseUrl: process.env.BASE_URL ?? 'http://localhost:4173',
      commit: process.env.GITHUB_SHA ?? null,
      branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || null,
      ciRun: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
      tests: [...this.tests.values()],
    };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.dataFile, JSON.stringify(run));
      fs.writeFileSync(this.file, renderTraceReport([run]));
    } catch (e) {
      console.warn(`trace-report: could not write ${this.file}: ${e.message} (run not affected)`);
    }
  }
}
