#!/usr/bin/env node
// Human-run, one time: loosens the agent locks so the project can run hands-off (docs/autonomy-plan.md).
// Review it, then run from the project root:   node proposals/unlock-for-autonomy.mjs
// Then restart Claude Code so the new permissions load. Safe to run twice.
//
// UNLOCKED for agents: harness/ (except the guard itself), inventory/, .github/, .claude/agents/,
//   playwright.config.ts, git push.
// STILL LOCKED (the minimum that keeps scores meaningful):
//   sealed-acceptance/       only the blind evaluator author may see it (separate session, own settings)
//   requirements/            source of truth; you write it now, later a sync job fetches it from Jira/Confluence/OpenAPI
//   .claude/settings.json, .claude/settings.local.json, harness/hooks/, harness/config.json
//                            the guard and its config: if agents could edit these, nothing would be guarded
//   gh pr merge              merges happen through GitHub auto-merge after required checks pass, not by an agent
// The no-weakening rules (no removed expect, no skip/fixme, no waitForTimeout, no raised timeouts) stay on.
// Also updates harness/hooks/selftest.mjs (a CI check) so it tests the new lock list.
import fs from 'node:fs';

const KEEP = [
  'sealed-acceptance/',
  'requirements/',
  '.claude/settings.json',
  '.claude/settings.local.json',
  'harness/hooks/',
  'harness/config.json',
];
const DENY = [
  'Read(./sealed-acceptance/**)',
  'Edit(./sealed-acceptance/**)',
  'Edit(./requirements/**)',
  'Edit(./.claude/settings.json)',
  'Edit(./.claude/settings.local.json)',
  'Edit(./harness/hooks/**)',
  'Edit(./harness/config.json)',
  'Bash(gh pr merge:*)',
  'Bash(curl:*)',
  'Bash(wget:*)',
];

const done = [];
const cfgFile = 'harness/config.json';
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
if (JSON.stringify(cfg.protectedPaths) !== JSON.stringify(KEEP)) {
  cfg.protectedPaths = KEEP;
  cfg._comment = 'Control-plane settings. The guard (harness/hooks/, this file) stays human-owned; see docs/autonomy-plan.md.';
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  done.push(`${cfgFile} (protectedPaths: ${KEEP.length} entries)`);
}

const setFile = '.claude/settings.json';
const set = JSON.parse(fs.readFileSync(setFile, 'utf8'));
if (JSON.stringify(set.permissions?.deny) !== JSON.stringify(DENY)) {
  set.permissions = { ...set.permissions, deny: DENY };
  fs.writeFileSync(setFile, JSON.stringify(set, null, 2) + '\n');
  done.push(`${setFile} (deny: ${DENY.length} rules)`);
}

// The hook self-test (a CI check) expects inventory/ to be blocked. Point those two cases at the guard instead,
// and add cases proving the newly unlocked paths are allowed.
const stFile = 'harness/hooks/selftest.mjs';
let st = fs.readFileSync(stFile, 'utf8').replace(/\r\n/g, '\n');
const stBefore = st;
st = st.replace(
  "['block: edit inventory', 2, { tool_name: 'Edit', tool_input: { file_path: 'inventory/tests.json', old_string: 'failing', new_string: 'passing' } }],",
  "['block: edit the guard config', 2, { tool_name: 'Edit', tool_input: { file_path: 'harness/config.json', old_string: 'a', new_string: 'b' } }],\n" +
    "  ['block: edit the guard', 2, { tool_name: 'Write', tool_input: { file_path: 'harness/hooks/protect-oracle.mjs', content: 'process.exit(0)' } }],\n" +
    "  ['block: edit agent settings', 2, { tool_name: 'Edit', tool_input: { file_path: '.claude/settings.json', old_string: 'a', new_string: 'b' } }],\n" +
    "  ['allow: edit inventory', 0, { tool_name: 'Edit', tool_input: { file_path: 'inventory/tests.json', old_string: 'failing', new_string: 'passing' } }],\n" +
    "  ['allow: edit CI workflow', 0, { tool_name: 'Edit', tool_input: { file_path: '.github/workflows/qa.yml', old_string: 'a', new_string: 'b' } }],",
);
st = st.replace(
  "['block: shell write to inventory', 2, { tool_name: 'Bash', tool_input: { command: \"sed -i 's/failing/passing/' inventory/tests.json\" } }],",
  "['block: shell write to the guard', 2, { tool_name: 'Bash', tool_input: { command: \"sed -i 's/exit(2)/exit(0)/' harness/hooks/protect-oracle.mjs\" } }],",
);
if (st !== stBefore) {
  fs.writeFileSync(stFile, st);
  done.push(`${stFile} (cases updated)`);
}

console.log(done.length ?'Changed:\n  ' + done.join('\n  ') : 'Already applied.');
console.log('\nNext: npm run selftest:hooks, git diff, commit, restart Claude Code, then tell Claude "unlocked".');
