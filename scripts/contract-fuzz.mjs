// Property-based contract run (Phase 3): Schemathesis against the frozen OpenAPI contract.
// Requires Schemathesis 4.x on PATH (`pip install schemathesis`) and the AUT running (`npm run aut`).
// Signs in first so /api/orders is exercised past the 401 gate.
// Usage: npm run contract:fuzz [-- extra schemathesis args]
import { spawnSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const SCHEMA = 'requirements/openapi/orders.yaml';

const health = await fetch(`${BASE}/api/health`).catch(() => null);
if (!health?.ok) {
  console.error(`AUT not reachable at ${BASE}. Start it with \`npm run aut\`.`);
  process.exit(2);
}

const login = await fetch(`${BASE}/api/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'demo@example.com', password: 'correct-horse' }),
});
const session = /session=([^;]+)/.exec(login.headers.get('set-cookie') || '')?.[1];
if (!session) {
  console.error(`Sign-in failed (HTTP ${login.status}); cannot run authenticated contract checks.`);
  process.exit(2);
}

const args = ['run', SCHEMA, '--url', BASE, '--header', `Cookie: session=${session}`, '--checks', 'all', ...process.argv.slice(2)];
console.log(`schemathesis ${args.join(' ').replace(session, '<session>')}`);
const r = spawnSync('schemathesis', args, { stdio: 'inherit', shell: process.platform === 'win32' });
if (r.error) {
  console.error('Could not start schemathesis. Install it with `pip install schemathesis`.');
  process.exit(2);
}
process.exit(r.status ?? 1);
