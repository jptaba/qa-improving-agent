#!/usr/bin/env node
// Self-test for protect-oracle.mjs: feeds it sample tool calls and checks allow/block decisions.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const hook = path.join(here, 'protect-oracle.mjs');

const cases = [
  ['allow: write a new generated test', 0, { tool_name: 'Write', tool_input: { file_path: 'tests/generated/REQ-160.spec.ts', content: "test('x', async () => { expect(1).toBe(1); });" } }],
  ['allow: heal a locator, keep assertion', 0, { tool_name: 'Edit', tool_input: { file_path: 'tests/checkout/expired-card.spec.ts', old_string: "getByRole('button', { name: 'Pay' })", new_string: "getByRole('button', { name: 'Pay now' })" } }],
  ['block: edit sealed evaluator', 2, { tool_name: 'Edit', tool_input: { file_path: 'sealed-acceptance/evaluator/tests/acceptance.spec.ts', old_string: 'a', new_string: 'b' } }],
  ['block: edit requirements', 2, { tool_name: 'Write', tool_input: { file_path: 'requirements/REQ-142-expired-card.md', content: 'x' } }],
  ['block: edit the guard config', 2, { tool_name: 'Edit', tool_input: { file_path: 'harness/config.json', old_string: 'a', new_string: 'b' } }],
  ['block: edit the guard', 2, { tool_name: 'Write', tool_input: { file_path: 'harness/hooks/protect-oracle.mjs', content: 'process.exit(0)' } }],
  ['block: edit agent settings', 2, { tool_name: 'Edit', tool_input: { file_path: '.claude/settings.json', old_string: 'a', new_string: 'b' } }],
  ['allow: edit inventory', 0, { tool_name: 'Edit', tool_input: { file_path: 'inventory/tests.json', old_string: 'failing', new_string: 'passing' } }],
  ['allow: edit CI workflow', 0, { tool_name: 'Edit', tool_input: { file_path: '.github/workflows/qa.yml', old_string: 'a', new_string: 'b' } }],
  ['block: remove an assertion', 2, { tool_name: 'Edit', tool_input: { file_path: 'tests/checkout/expired-card.spec.ts', old_string: "await expect(page.getByRole('alert')).toHaveText('x');\n    await expect(page).toHaveURL(/c/);", new_string: 'await expect(page).toHaveURL(/c/);' } }],
  ['block: add test.skip', 2, { tool_name: 'Edit', tool_input: { file_path: 'tests/login/sign-in.spec.ts', old_string: "test('a', async", new_string: "test.skip('a', async" } }],
  ['block: add waitForTimeout', 2, { tool_name: 'Edit', tool_input: { file_path: 'tests/login/sign-in.spec.ts', old_string: 'await page.goto("/");', new_string: 'await page.goto("/"); await page.waitForTimeout(3000);' } }],
  ['block: raise timeout', 2, { tool_name: 'Edit', tool_input: { file_path: 'tests/login/sign-in.spec.ts', old_string: 'toBeVisible()', new_string: 'toBeVisible({ timeout: 60000 })' } }],
  ['block: shell read of sealed evaluator', 2, { tool_name: 'Bash', tool_input: { command: 'cat sealed-acceptance/evaluator/tests/acceptance.spec.ts' } }],
  ['block: shell write to the guard', 2, { tool_name: 'Bash', tool_input: { command: "sed -i 's/exit(2)/exit(0)/' harness/hooks/protect-oracle.mjs" } }],
  ['allow: run playwright', 0, { tool_name: 'Bash', tool_input: { command: 'npx playwright test --grep @REQ-142' } }],
];

let failed = 0;
for (const [name, want, event] of cases) {
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify(event), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  const ok = r.status === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (exit ${r.status}, expected ${want})${!ok && r.stderr ? `\n      ${r.stderr.trim()}` : ''}`);
}
console.log(failed ? `\n${failed} hook self-test(s) failed` : '\nAll hook self-tests passed');
process.exit(failed ? 1 : 0);
