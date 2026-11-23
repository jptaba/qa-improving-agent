// Runs one agent role headlessly through the Claude Code CLI.
// The role definition (.claude/agents/<role>.md) supplies the system instructions and tool allow-list;
// the task is passed on stdin so long prompts are safe on every OS.
//
// Verify the flags against your installed CLI (`claude --help`); they are kept in one place here.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function loadRole(role, root = process.cwd()) {
  const file = path.join(root, '.claude', 'agents', `${role}.md`);
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const get = (k) => fm?.[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  return { role, tools: get('tools'), model: get('model'), instructions: fm ? text.slice(fm[0].length) : text };
}

/**
 * @returns {Promise<{ok:boolean, result?:string, costUsd:number, turns?:number, dryRun?:boolean, error?:string}>}
 */
export function runAgent(role, task, { cfg, dryRun = false, log = console.log } = {}) {
  const def = loadRole(role);
  const model = cfg?.agents?.models?.[role] ?? def.model;
  const args = ['-p', '--output-format', 'json', '--max-turns', String(cfg?.budgets?.maxTurnsPerAgent ?? 30)];
  if (def.tools) args.push('--allowedTools', def.tools);
  if (model) args.push('--model', model);

  const prompt = `${def.instructions.trim()}\n\n---\n\n# Task\n${task.trim()}\n`;

  if (dryRun) {
    log(`    [dry-run] would run: ${cfg?.agents?.command ?? 'claude'} ${args.map((a) => (/[\s,()]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
    log(`    [dry-run] task: ${task.trim().split('\n')[0]}`);
    return Promise.resolve({ ok: true, dryRun: true, costUsd: 0 });
  }

  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    // On Windows the CLI is a .cmd shim, which needs a shell; quote args that contain spaces/commas.
    const finalArgs = isWin ? args.map((a) => (/[\s,()*]/.test(a) ? `"${a}"` : a)) : args;
    const child = spawn(cfg?.agents?.command ?? 'claude', finalArgs, { shell: isWin, stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', (e) => resolve({ ok: false, costUsd: 0, error: `could not start agent CLI: ${e.message}` }));
    child.on('close', (code) => {
      try {
        const j = JSON.parse(out.trim().split('\n').pop());
        resolve({ ok: code === 0 && !j.is_error, result: j.result, costUsd: Number(j.total_cost_usd ?? 0), turns: j.num_turns });
      } catch {
        resolve({ ok: false, costUsd: 0, error: `agent exited ${code}; output was not JSON` });
      }
    });
    child.stdin.end(prompt);
  });
}
