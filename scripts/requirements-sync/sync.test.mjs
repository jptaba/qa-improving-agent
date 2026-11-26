// Unit tests for the requirement sync adapters: node --test scripts/requirements-sync/
// No network: Jira and Confluence are faked with a stub fetch that returns their documented response shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractAcceptance, plan, parseFrontmatter } from './core.mjs';
import { fromSpec } from './openapi.mjs';
import { fetchJira, adfToText } from './jira.mjs';
import { fetchConfluence } from './confluence.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reqsync-'));
const stubFetch = (routes) => async (url) => {
  const u = new URL(url);
  const hit = routes.find(([re]) => re.test(u.pathname + u.search));
  if (!hit) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => hit[1](u) };
};

test('extractAcceptance: EARS lines win, list markers and AC labels are stripped', () => {
  const acs = extractAcceptance('Intro\n- **AC1:** WHEN x THE SYSTEM SHALL y.\n* THE SYSTEM SHALL z.\nnot a criterion');
  assert.deepEqual(acs, ['WHEN x THE SYSTEM SHALL y.', 'THE SYSTEM SHALL z.']);
});

test('extractAcceptance: Given/When/Then blocks become one AC each', () => {
  const acs = extractAcceptance('Given a cart\nWhen I pay\nThen I see a receipt\nGiven no cart\nThen pay is disabled');
  assert.deepEqual(acs, ['Given a cart When I pay Then I see a receipt', 'Given no cart Then pay is disabled']);
});

test('extractAcceptance: falls back to the list under an "Acceptance criteria" heading', () => {
  const acs = extractAcceptance('## Acceptance criteria\n- totals add up\n- currency is USD\n## Notes\n- ignore me');
  assert.deepEqual(acs, ['totals add up', 'currency is USD']);
});

test('openapi: one requirement per operation, one AC per response, auth-aware wording', () => {
  const spec = `openapi: 3.0.3
paths:
  /api/things:
    post:
      summary: Create a thing
      security: [{ cookie: [] }]
      responses:
        '201': { description: Created, content: { application/json: { schema: { type: object } } } }
        '401': { description: Not signed in }
    get:
      summary: List things
      deprecated: true
      responses:
        '200': { description: The list }
`;
  const reqs = fromSpec('requirements/openapi/things.yaml', spec);
  assert.equal(reqs.length, 2);
  const post = reqs.find((r) => r.source.endsWith('#POST /api/things'));
  assert.equal(post.ready, true);
  assert.equal(post.acceptance.length, 2);
  assert.match(post.acceptance[0], /^WHEN an authenticated client sends POST `\/api\/things`.*THE SYSTEM SHALL respond `201` with a JSON body/);
  assert.match(post.acceptance[1], /^WHEN a client sends POST .*respond `401`\.$/);
  assert.equal(reqs.find((r) => r.source.endsWith('#GET /api/things')).ready, false, 'deprecated operations stay draft');
});

test('openapi: the real orders contract parses', () => {
  const reqs = fromSpec('requirements/openapi/orders.yaml');
  assert.ok(reqs.some((r) => r.source.endsWith('#POST /api/orders')));
  assert.ok(reqs.every((r) => r.acceptance.length > 0));
});

test('plan: new ids above the highest existing, stable ids on re-sync, hand-written files untouched', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'REQ-190-hand.md'), '---\nid: REQ-190\ntitle: Hand written\nstatus: in-scope\n---\n');
  const a = { source: 'jira:QA-1', title: 'Pay twice', ready: true, acceptance: ['THE SYSTEM SHALL charge once.'] };
  const b = { source: 'jira:QA-2', title: 'No ACs yet', ready: true, acceptance: [] };
  const first = plan(dir, [a, b]);
  assert.deepEqual(first.map((w) => [w.id, w.change]), [['REQ-200', 'new'], ['REQ-210', 'new']]);
  assert.equal(parseFrontmatter(first[1].text).status, 'draft', 'no ACs means draft even if the source says ready');
  for (const w of first) fs.writeFileSync(path.join(dir, w.file), w.text);
  const again = plan(dir, [a, { ...b }]);
  assert.deepEqual(again.map((w) => [w.id, w.change]), [['REQ-200', 'unchanged'], ['REQ-210', 'unchanged']]);
  const edited = plan(dir, [{ ...a, title: 'Pay exactly once' }]);
  assert.deepEqual(edited.map((w) => [w.id, w.file, w.change]), [['REQ-200', first[0].file, 'updated']]);
  assert.match(fs.readFileSync(path.join(dir, 'REQ-190-hand.md'), 'utf8'), /Hand written/);
});

test('jira: paginates, reads ACs from a custom field (ADF), maps ready by status or label', async () => {
  const adf = (lines) => ({ type: 'doc', content: lines.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });
  let calls = 0;
  const fetchImpl = stubFetch([
    [
      /\/rest\/api\/3\/search\/jql/,
      (u) => {
        calls++;
        assert.equal(u.searchParams.get('jql'), 'project = SHOP');
        if (!u.searchParams.get('nextPageToken'))
          return { issues: [{ key: 'SHOP-1', fields: { summary: 'Refunds', status: { name: 'Ready' }, labels: [], customfield_1: adf(['WHEN a refund is asked THE SYSTEM SHALL refund in full.']) } }], nextPageToken: 'p2' };
        return { issues: [{ key: 'SHOP-2', fields: { summary: 'Coupons', status: { name: 'In Progress' }, labels: ['qa-ready'], description: adf(['Given a coupon', 'Then the total drops']) } }] };
      },
    ],
  ]);
  const env = { JIRA_BASE_URL: 'https://x.atlassian.net', JIRA_EMAIL: 'a@b.c', JIRA_API_TOKEN: 't', JIRA_JQL: 'project = SHOP', JIRA_AC_FIELD: 'customfield_1' };
  const reqs = await fetchJira(env, fetchImpl);
  assert.equal(calls, 2);
  assert.deepEqual(reqs.map((r) => [r.source, r.ready]), [['jira:SHOP-1', true], ['jira:SHOP-2', true]]);
  assert.equal(reqs[0].sourceUrl, 'https://x.atlassian.net/browse/SHOP-1');
  assert.deepEqual(reqs[0].acceptance, ['WHEN a refund is asked THE SYSTEM SHALL refund in full.']);
  assert.deepEqual(reqs[1].acceptance, ['Given a coupon Then the total drops'], 'custom field empty on this issue: ACs come from the description');
  assert.equal(adfToText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }] }), 'a\nb\n');
});

test('jira: missing settings fail loudly', async () => {
  await assert.rejects(fetchJira({}, async () => ({})), /JIRA_BASE_URL/);
});

test('confluence: finds labelled pages and their acceptance criteria', async () => {
  const fetchImpl = stubFetch([
    [/\/wiki\/api\/v2\/labels\?/, () => ({ results: [{ id: '7', name: 'qa-requirement' }] })],
    [
      /\/wiki\/api\/v2\/labels\/7\/pages/,
      () => ({
        results: [
          {
            id: '123',
            title: 'Gift wrap',
            version: { number: 4 },
            _links: { webui: '/spaces/S/pages/123' },
            body: { storage: { value: '<h2>Acceptance criteria</h2><ul><li>WHEN gift wrap is chosen THE SYSTEM SHALL add $3.00.</li></ul><h2>Notes</h2><p>x</p>' } },
          },
        ],
      }),
    ],
    [/\/wiki\/api\/v2\/pages\/123\/labels/, () => ({ results: [{ name: 'qa-requirement' }, { name: 'qa-ready' }] })],
  ]);
  const env = { CONFLUENCE_BASE_URL: 'https://x.atlassian.net', CONFLUENCE_EMAIL: 'a@b.c', CONFLUENCE_API_TOKEN: 't', CONFLUENCE_LABEL: 'qa-requirement' };
  const [r] = await fetchConfluence(env, fetchImpl);
  assert.equal(r.source, 'confluence:123');
  assert.equal(r.ready, true);
  assert.equal(r.sourceUrl, 'https://x.atlassian.net/wiki/spaces/S/pages/123');
  assert.deepEqual(r.acceptance, ['WHEN gift wrap is chosen THE SYSTEM SHALL add $3.00.']);
});
