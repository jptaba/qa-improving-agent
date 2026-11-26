#!/usr/bin/env node
// Requirement sync (autonomy phase H): pulls requirements from OpenAPI/Swagger, Jira or Confluence into
// requirements/ in the repo's EARS format. Run it, then commit the result as a requirement-only PR
// (harness/ci/requirements-isolation.mjs keeps it apart from tests).
//
//   node scripts/requirements-sync/index.mjs --source openapi --spec requirements/openapi/orders.yaml [--dry-run]
//   node scripts/requirements-sync/index.mjs --source jira        [--dry-run]   (env: see jira.mjs)
//   node scripts/requirements-sync/index.mjs --source confluence  [--dry-run]   (env: see confluence.mjs)
//   --out <dir>   where requirement files go (default: requirements)
//
// Files are matched to their source through the `source:` frontmatter field, so re-running updates files
// in place and keeps their REQ ids. Hand-written requirements (no `source:`) are never touched.
import fs from 'node:fs';
import path from 'node:path';
import { plan, readExisting } from './core.mjs';
import { fromSpec } from './openapi.mjs';
import { fetchJira } from './jira.mjs';
import { fetchConfluence } from './confluence.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const source = opt('source');
const out = opt('out', 'requirements');
const dry = argv.includes('--dry-run');

let synced;
if (source === 'openapi') {
  const spec = opt('spec');
  if (!spec) throw new Error('--spec <path to OpenAPI/Swagger file> is required for --source openapi');
  // A contract that a hand-written requirement already owns (its `contract:` field) is not synced again,
  // or the same behaviour would have two requirements. --force overrides.
  const owner = readExisting(out).find((e) => !e.source && e.contract && path.normalize(e.contract) === path.normalize(spec));
  if (owner && !argv.includes('--force')) {
    console.log(`skipped: ${spec} is already owned by hand-written ${owner.id} (${owner.file}). Use --force to sync it anyway.`);
    process.exit(0);
  }
  synced = fromSpec(spec);
} else if (source === 'jira') synced = await fetchJira();
else if (source === 'confluence') synced = await fetchConfluence();
else {
  console.error('usage: --source openapi|jira|confluence [--spec file] [--out dir] [--dry-run]');
  process.exit(2);
}

const writes = plan(out, synced);
for (const w of writes) {
  console.log(`${w.change.padEnd(9)} ${w.id}  ${path.join(out, w.file).replace(/\\/g, '/')}`);
  if (!dry && w.change !== 'unchanged') fs.writeFileSync(path.join(out, w.file), w.text);
}
const n = (c) => writes.filter((w) => w.change === c).length;
console.log(`\n${writes.length} from ${source}: ${n('new')} new, ${n('updated')} updated, ${n('unchanged')} unchanged${dry ? ' (dry run, nothing written)' : ''}.`);
