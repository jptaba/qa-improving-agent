// End-to-end tests for the requirement sync against the local Jira/Confluence mock (mock-atlassian.mjs).
// Unlike sync.test.mjs, these go over real HTTP and run the CLI exactly as a scheduled job would:
//   node --test scripts/requirements-sync/
// Output goes to a temp folder, never to requirements/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockAtlassian } from './mock-atlassian.mjs';
import { parseFrontmatter } from './core.mjs';

const CLI = path.resolve('scripts/requirements-sync/index.mjs');
const LINT = path.resolve('harness/ci/requirements-lint.mjs');

// A folder that already holds one hand-written requirement, as requirements/ does.
function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqsync-mock-'));
  fs.writeFileSync(path.join(dir, 'REQ-190-hand-written.md'), '---\nid: REQ-190\ntitle: Hand written\nstatus: in-scope\n---\n\n## Acceptance criteria (EARS)\n- **AC1:** THE SYSTEM SHALL stay as it is.\n');
  return dir;
}

// Async on purpose: the mock runs in this process, so a blocking spawnSync would deadlock it.
function sync(source, env, out, extra = []) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [CLI, "--source", source, "--out", out, ...extra], { env: { ...process.env, ...env } });
    let text = "";
    c.stdout.on("data", (d) => (text += d));
    c.stderr.on("data", (d) => (text += d));
    c.on("close", (code) => resolve({ code, out: text }));
  });
}

function read(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'REQ-190-hand-written.md');
  return Object.fromEntries(
    files.map((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const fm = parseFrontmatter(text);
      return [fm.source, { file: f, fm, text, acs: text.match(/\*\*AC\d+:\*\* .*/g) ?? [] }];
    }),
  );
}

test('jira via the mock: JQL filters, pages are followed, ready and ACs map as documented', async (t) => {
  const mock = await startMockAtlassian();
  t.after(mock.close);
  const dir = workspace();

  const first = await sync('jira', mock.env, dir);
  assert.equal(first.code, 0, first.out);
  const reqs = read(dir);
  assert.deepEqual(Object.keys(reqs).sort(), ['jira:SHOP-101', 'jira:SHOP-102', 'jira:SHOP-103', 'jira:SHOP-104'], 'other projects and unlabelled issues are left out');
  assert.ok(mock.calls.filter((c) => c.startsWith('GET /rest/api/3/search/jql')).length >= 2, 'more than one page was fetched');

  const s101 = reqs['jira:SHOP-101'];
  assert.equal(s101.fm.status, 'in-scope');
  assert.equal(s101.fm.journey, 'Sign in');
  assert.equal(s101.fm.source_url, `${mock.url}/browse/SHOP-101`);
  assert.equal(s101.acs.length, 2, 'ACs come from the custom field');
  assert.match(s101.acs[0], /WHEN a shopper signs in with "Remember me" ticked THE SYSTEM SHALL prefill/);

  const s102 = reqs['jira:SHOP-102'];
  assert.equal(s102.fm.status, 'in-scope', 'the qa-ready label counts as ready');
  assert.deepEqual(s102.acs.map((a) => a.replace(/^\*\*AC\d+:\*\* /, '')), [
    'Given a signed-in shopper on checkout When they enter a gift message and pay Then the confirmation page shows the message',
    'Given a gift message longer than 200 characters Then Pay now is disabled and the limit is shown',
  ]);

  assert.equal(reqs['jira:SHOP-103'].fm.status, 'draft', 'To Do is not ready');
  assert.equal(reqs['jira:SHOP-103'].acs.length, 2, 'the list under the heading is still read');
  assert.equal(reqs['jira:SHOP-104'].fm.status, 'draft', 'ready but no ACs stays draft');

  assert.deepEqual(Object.values(reqs).map((r) => r.fm.id).sort(), ['REQ-200', 'REQ-210', 'REQ-220', 'REQ-230'], 'new ids start above the hand-written REQ-190');
  const lint = spawnSync(process.execPath, [LINT, dir], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);

  const again = await sync('jira', mock.env, dir);
  assert.match(again.out, /0 new, 0 updated, 4 unchanged/);
  assert.match(fs.readFileSync(path.join(dir, 'REQ-190-hand-written.md'), 'utf8'), /stay as it is/);
});

test('jira via the mock: a changed ticket updates its file and keeps its id', async (t) => {
  const dir = workspace();
  const before = await startMockAtlassian();
  assert.equal((await sync('jira', before.env, dir)).code, 0);
  await before.close();
  const id = read(dir)['jira:SHOP-104'].fm.id;

  const { issues } = JSON.parse(fs.readFileSync('scripts/requirements-sync/fixtures/jira-issues.json', 'utf8'));
  const shop104 = issues.find((i) => i.key === 'SHOP-104');
  shop104.fields.description = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'THE SYSTEM SHALL show the Pay now button within 1 second of opening checkout.' }] }] };
  // Same port, so the site URL (and each file's source_url) is unchanged, as with a real Jira site.
  const after = await startMockAtlassian({ jira: issues, port: Number(new URL(before.url).port) });
  t.after(after.close);
  const r = await sync('jira', after.env, dir);
  assert.match(r.out, /0 new, 1 updated, 3 unchanged/);
  const now = read(dir)['jira:SHOP-104'];
  assert.equal(now.fm.id, id);
  assert.equal(now.fm.status, 'in-scope', 'ACs were added at the source, so the ready ticket becomes in-scope');
});

test('confluence via the mock: labelled pages only, ready label, entities decoded', async (t) => {
  const mock = await startMockAtlassian();
  t.after(mock.close);
  const dir = workspace();
  const r = await sync('confluence', mock.env, dir);
  assert.equal(r.code, 0, r.out);
  const reqs = read(dir);
  assert.deepEqual(Object.keys(reqs).sort(), ['confluence:9001', 'confluence:9002', 'confluence:9003']);
  assert.ok(mock.calls.some((c) => c.includes('cursor=')), 'the next-page link was followed');
  assert.equal(reqs['confluence:9001'].fm.status, 'in-scope');
  assert.equal(reqs['confluence:9001'].acs.length, 2);
  assert.equal(reqs['confluence:9001'].fm.source_url, `${mock.url}/wiki/spaces/SHOP/pages/9001`);
  assert.equal(reqs['confluence:9002'].fm.status, 'draft', 'no qa-ready label');
  assert.match(reqs['confluence:9003'].acs[0], /3–5 working days/);
});

test('mock rejects bad credentials and unsupported JQL, and the sync fails loudly', async (t) => {
  const mock = await startMockAtlassian();
  t.after(mock.close);
  const dir = workspace();
  const denied = await sync('jira', { ...mock.env, JIRA_API_TOKEN: 'wrong' }, dir);
  assert.notEqual(denied.code, 0);
  assert.match(denied.out, /HTTP 401/);
  const badJql = await sync('jira', { ...mock.env, JIRA_JQL: 'summary ~ "gift"' }, dir);
  assert.notEqual(badJql.code, 0);
  assert.match(badJql.out, /HTTP 400/);
  const deniedWiki = await sync('confluence', { ...mock.env, CONFLUENCE_EMAIL: 'someone@else' }, dir);
  assert.notEqual(deniedWiki.code, 0);
  assert.deepEqual(Object.keys(read(dir)), [], 'nothing is written when a source fails');
});
