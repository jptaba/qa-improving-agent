#!/usr/bin/env node
// Claude Code PreToolUse hook: protects the test oracle.
// Exit code 2 blocks the tool call and shows stderr to the agent; exit 0 allows it.
//
// Blocks:
//  1. Edit/Write to protected paths (sealed evaluator, requirements, inventory, harness, CI, config).
//  2. Edits that remove or loosen assertions (fewer `expect(` after the edit than before).
//  3. Edits that add test.skip / test.fixme / waitForTimeout or raise timeouts above policy.
//  4. Bash commands that write to, move or delete protected paths, or read the sealed evaluator.
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
let config = { protectedPaths: [], healPolicy: { maxTimeoutMs: 15000 } };
try {
  config = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'config.json'), 'utf8'));
} catch {
  /* fall back to defaults below */
}
const PROTECTED = config.protectedPaths?.length
  ? config.protectedPaths
  : ['sealed-acceptance/', 'requirements/', 'inventory/', 'harness/', '.claude/', '.github/', 'playwright.config.ts'];
const MAX_TIMEOUT = config.healPolicy?.maxTimeoutMs ?? 15000;

const block = (why) => {
  process.stderr.write(
    `BLOCKED by protect-oracle: ${why}\n` +
      `If you believe the app is wrong or the test is wrong, write an escalation to escalations/ instead (see AGENTS.md).\n`,
  );
  process.exit(2);
};

const rel = (p) => path.relative(root, path.resolve(root, p)).split(path.sep).join('/');
const isProtected = (p) => {
  const r = rel(p);
  return PROTECTED.some((pp) => (pp.endsWith('/') ? r === pp.slice(0, -1) || r.startsWith(pp) : r === pp));
};
const count = (s, re) => (s?.match(re) ?? []).length;
const EXPECT = /\bexpect(\.soft)?\s*\(/g;
const SKIP = /\btest(\.describe)?\.(skip|fixme)\s*\(|\.skip\s*\(/g;
const HARD_WAIT = /\bwaitForTimeout\s*\(/g;

function checkWeakening(before, after, file) {
  if (!/\.(spec|test)\.[cm]?[jt]sx?$/.test(file)) return;
  if (count(after, EXPECT) < count(before, EXPECT)) block(`assertions removed in ${rel(file)} (expect count ${count(before, EXPECT)} → ${count(after, EXPECT)}).`);
  if (count(after, SKIP) > count(before, SKIP)) block(`skip/fixme added in ${rel(file)}. Skipped tests count as failures.`);
  if (count(after, HARD_WAIT) > count(before, HARD_WAIT)) block(`waitForTimeout added in ${rel(file)}. Use a web-first assertion.`);
  for (const m of (after ?? '').matchAll(/timeout\s*:\s*([\d_]+)/g)) {
    const ms = Number(m[1].replace(/_/g, ''));
    if (ms > MAX_TIMEOUT && !(before ?? '').includes(m[0])) block(`timeout ${ms}ms exceeds policy (${MAX_TIMEOUT}ms) in ${rel(file)}.`);
  }
}

let input = '';
for await (const chunk of process.stdin) input += chunk;
let event;
try {
  event = JSON.parse(input || '{}');
} catch {
  process.exit(0); // not our format; don't block
}
const tool = event.tool_name ?? '';
const ti = event.tool_input ?? {};

if (tool === 'Bash') {
  const cmd = String(ti.command ?? '');
  if (/sealed-acceptance/.test(cmd)) block('the sealed evaluator is off-limits to agents (no reading, listing or running it).');
  const writes = /(>|>>|\btee\b|\bsed\s+-i|\brm\b|\bmv\b|\bcp\b|\bgit\s+(checkout|restore|rm|mv)\b|\bperl\s+-i|\bpython3?\s+-c|\bnode\s+-e)/;
  if (writes.test(cmd)) {
    for (const p of PROTECTED) {
      const needle = p.replace(/\/$/, '');
      if (cmd.includes(needle)) block(`shell command may modify protected path '${p}'.`);
    }
  }
  process.exit(0);
}

if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const file = ti.file_path ?? ti.notebook_path ?? ti.path;
  if (!file) process.exit(0);
  if (isProtected(file)) block(`'${rel(file)}' is part of the protected test oracle (human-owned).`);

  if (tool === 'Edit') checkWeakening(ti.old_string ?? '', ti.new_string ?? '', file);
  if (tool === 'MultiEdit') {
    for (const e of ti.edits ?? []) checkWeakening(e.old_string ?? '', e.new_string ?? '', file);
  }
  if (tool === 'Write') {
    const abs = path.resolve(root, file);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    checkWeakening(before, ti.content ?? '', file);
  }
}
process.exit(0);
