#!/usr/bin/env node
// Human-run, one time: lets Claude write and update requirements (owner's decision, 2026-11-26).
// Review it, then run from the project root:   node proposals/allow-claude-requirements.mjs
// Then: npm run selftest:hooks, commit, restart Claude Code. Safe to run twice.
//
//   harness/config.json      drop requirements/ from protectedPaths
//   .claude/settings.json    drop the Edit(./requirements/**) deny rule
//   harness/hooks/selftest.mjs
//       - "edit requirements" is now expected to be allowed
//       - fixes a case that already failed: "write a new generated test" wrote over the existing
//         tests/generated/REQ-160.spec.ts (19 expects -> 1), so the hook rightly blocked it.
//         It now writes to a file that does not exist.
// What still keeps requirement edits honest: harness/ci/requirements-isolation.mjs fails any
// agent-authored PR that changes requirements/ together with tests, skills, specs, the app or the
// sealed evaluator. A requirement lands first, on its own; the work graded against it comes after.
import fs from 'node:fs';

const done = [];

const cfgFile = 'harness/config.json';
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
if (cfg.protectedPaths.includes('requirements/')) {
  cfg.protectedPaths = cfg.protectedPaths.filter((p) => p !== 'requirements/');
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  done.push(cfgFile);
}

const setFile = '.claude/settings.json';
const set = JSON.parse(fs.readFileSync(setFile, 'utf8'));
if (set.permissions.deny.includes('Edit(./requirements/**)')) {
  set.permissions.deny = set.permissions.deny.filter((r) => r !== 'Edit(./requirements/**)');
  fs.writeFileSync(setFile, JSON.stringify(set, null, 2) + '\n');
  done.push(setFile);
}

const stFile = 'harness/hooks/selftest.mjs';
const st0 = fs.readFileSync(stFile, 'utf8').replace(/\r\n/g, '\n');
const st = st0
  .replace(
    "['block: edit requirements', 2, { tool_name: 'Write', tool_input: { file_path: 'requirements/REQ-142-expired-card.md', content: 'x' } }],",
    "['allow: edit requirements', 0, { tool_name: 'Write', tool_input: { file_path: 'requirements/REQ-999-selftest.md', content: 'x' } }],",
  )
  .replace(
    "['allow: write a new generated test', 0, { tool_name: 'Write', tool_input: { file_path: 'tests/generated/REQ-160.spec.ts',",
    "['allow: write a new generated test', 0, { tool_name: 'Write', tool_input: { file_path: 'tests/generated/REQ-999-selftest.spec.ts',",
  );
if (st !== st0) {
  fs.writeFileSync(stFile, st);
  done.push(stFile);
}

console.log(done.length ? 'Changed:\n  ' + done.join('\n  ') : 'Already applied.');
console.log('\nNext: npm run selftest:hooks (expect all pass), commit, restart Claude Code.');
