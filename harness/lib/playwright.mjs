// Shared helpers for running Playwright and reading its JSON report (control plane only).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

export function playwrightCli() {
  try {
    return path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
  } catch {
    return path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
  }
}

/** Run `playwright <args>`; resolves with the exit code. Never throws on test failure. */
export function runPlaywright(args, { env = {}, quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [playwrightCli(), ...args], {
      env: { ...process.env, ...env },
      stdio: quiet ? 'ignore' : 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

/** Flatten a Playwright JSON report into one entry per test. */
export function readReport(file) {
  if (!fs.existsSync(file)) return { tests: [], stats: null, missing: true };
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tests = [];
  const walk = (suite, parents) => {
    const titles = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.[t.results.length - 1];
        const tags = [...(spec.tags ?? []), ...(t.tags ?? [])].map((x) => (x.startsWith('@') ? x : `@${x}`));
        const titleReqs = `${titles.join(' ')} ${spec.title}`.match(/REQ-\d+/g) ?? [];
        tests.push({
          title: [...titles.slice(1), spec.title].join(' › '),
          file: spec.file,
          line: spec.line,
          project: t.projectName,
          status: t.status, // expected | unexpected | flaky | skipped
          requirements: [...new Set([...tags.filter((x) => /^@REQ-\d+$/.test(x)).map((x) => x.slice(1)), ...titleReqs])],
          error: firstLine(last?.error?.message ?? last?.errors?.[0]?.message),
          attachments: (last?.attachments ?? []).filter((a) => a.path).map((a) => ({ name: a.name, path: a.path })),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, titles);
  };
  for (const s of report.suites ?? []) walk(s, []);
  return { tests, stats: report.stats ?? null, missing: false };
}

function firstLine(msg) {
  if (!msg) return null;
  // strip ANSI colour codes Playwright adds to error messages
  return msg.replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim())?.trim() ?? null;
}

/** Poll a URL until it answers 2xx or the timeout passes. */
export async function waitForHealthy(url, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
