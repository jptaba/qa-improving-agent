#!/usr/bin/env node
// A local stand-in for Jira Cloud and Confluence Cloud, so the sync can be tested end to end without the
// real services. It serves only the endpoints the adapters call, with the documented response shapes:
//   Jira        GET /rest/api/3/search/jql            (jql, fields, maxResults, nextPageToken)
//   Confluence  GET /wiki/api/v2/labels               (prefix, limit)
//               GET /wiki/api/v2/labels/{id}/pages    (body-format=storage, limit, cursor; _links.next)
//               GET /wiki/api/v2/pages/{id}/labels
// Every call needs Basic auth with the mock's email and token (401 otherwise), and pages are small
// (MOCK_PAGE_SIZE, default 2) so pagination is always exercised.
//
// Content comes from fixtures/jira-issues.json and fixtures/confluence-pages.json: a made-up "SHOP"
// project for the demo app. The JQL support is deliberately small: clauses joined by AND, each
// `project = X`, `labels = X` or `status = "X"`. Anything else is a 400, like a real JQL error.
//
// Run it on its own:   node scripts/requirements-sync/mock-atlassian.mjs [--port 4180]
// It prints the env settings to point the sync at it. Or use: npm run sync:mock
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MOCK_EMAIL = 'qa-bot@example.com';
export const MOCK_TOKEN = 'mock-token';
export const loadFixture = (name) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', name), 'utf8'));

function jqlFilter(jql) {
  const clauses = jql.split(/\s+AND\s+/i).map((c) => c.trim());
  const tests = clauses.map((c) => {
    const m = c.match(/^(project|labels|status)\s*=\s*"?([^"]+?)"?$/i);
    if (!m) return null;
    const [, field, value] = m;
    const v = value.toLowerCase();
    if (field.toLowerCase() === 'project') return (i) => i.key.split('-')[0].toLowerCase() === v;
    if (field.toLowerCase() === 'labels') return (i) => (i.fields.labels ?? []).some((l) => l.toLowerCase() === v);
    return (i) => (i.fields.status?.name ?? '').toLowerCase() === v;
  });
  if (!jql.trim() || tests.includes(null)) return null;
  return (issue) => tests.every((t) => t(issue));
}

export function startMockAtlassian({ port = 0, pageSize = Number(process.env.MOCK_PAGE_SIZE) || 2, jira, confluence } = {}) {
  const issues = jira ?? loadFixture('jira-issues.json').issues;
  const pages = confluence ?? loadFixture('confluence-pages.json').pages;
  const labelIds = new Map();
  for (const p of pages) for (const l of p.labels) if (!labelIds.has(l)) labelIds.set(l, String(1000 + labelIds.size));
  const calls = [];
  const expected = 'Basic ' + Buffer.from(`${MOCK_EMAIL}:${MOCK_TOKEN}`).toString('base64');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://mock');
    calls.push(`${req.method} ${url.pathname}${url.search}`);
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== expected) return json(401, { message: 'Client must be authenticated to access this resource.' });
    if (req.method !== 'GET') return json(405, { message: 'Method not allowed' });
    const q = url.searchParams;
    const limit = Math.min(Number(q.get('maxResults') ?? q.get('limit')) || pageSize, pageSize);

    if (url.pathname === '/rest/api/3/search/jql') {
      const filter = jqlFilter(q.get('jql') ?? '');
      if (!filter) return json(400, { errorMessages: [`Error in the JQL Query: '${q.get('jql')}' is not supported by the mock`] });
      const want = (q.get('fields') ?? '').split(',').filter(Boolean);
      const hits = issues.filter(filter);
      const start = Number(q.get('nextPageToken') ?? 0);
      const slice = hits.slice(start, start + limit).map((i) => ({
        id: i.id,
        key: i.key,
        fields: want.length ? Object.fromEntries(want.filter((f) => f in i.fields).map((f) => [f, i.fields[f]])) : i.fields,
      }));
      const next = start + limit < hits.length ? String(start + limit) : undefined;
      return json(200, { issues: slice, ...(next ? { nextPageToken: next } : { isLast: true }) });
    }

    if (url.pathname === '/wiki/api/v2/labels') {
      return json(200, { results: [...labelIds].map(([name, id]) => ({ id, name, prefix: 'global' })), _links: {} });
    }

    let m = url.pathname.match(/^\/wiki\/api\/v2\/labels\/(\d+)\/pages$/);
    if (m) {
      const name = [...labelIds].find(([, id]) => id === m[1])?.[0];
      if (!name) return json(404, { errors: [{ status: 404, title: 'Not Found' }] });
      const withBody = q.get('body-format') === 'storage';
      const hits = pages.filter((p) => p.labels.includes(name));
      const start = Number(q.get('cursor') ?? 0);
      const results = hits.slice(start, start + limit).map((p) => ({
        id: p.id,
        status: 'current',
        title: p.title,
        version: { number: p.version },
        _links: { webui: `/spaces/${p.space}/pages/${p.id}` },
        ...(withBody ? { body: { storage: { representation: 'storage', value: p.body } } } : {}),
      }));
      const nextStart = start + limit;
      const next = nextStart < hits.length ? `/wiki/api/v2/labels/${m[1]}/pages?body-format=${withBody ? 'storage' : ''}&limit=${limit}&cursor=${nextStart}` : undefined;
      return json(200, { results, _links: next ? { next } : {} });
    }

    m = url.pathname.match(/^\/wiki\/api\/v2\/pages\/(\d+)\/labels$/);
    if (m) {
      const page = pages.find((p) => p.id === m[1]);
      if (!page) return json(404, { errors: [{ status: 404, title: 'Not Found' }] });
      return json(200, { results: page.labels.map((name) => ({ id: labelIds.get(name), name, prefix: 'global' })), _links: {} });
    }

    return json(404, { message: `mock: no route for ${url.pathname}` });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      resolve({
        url,
        calls,
        env: {
          JIRA_BASE_URL: url,
          JIRA_EMAIL: MOCK_EMAIL,
          JIRA_API_TOKEN: MOCK_TOKEN,
          JIRA_JQL: 'project = SHOP AND labels = qa-sync',
          JIRA_AC_FIELD: 'customfield_10042',
          CONFLUENCE_BASE_URL: url,
          CONFLUENCE_EMAIL: MOCK_EMAIL,
          CONFLUENCE_API_TOKEN: MOCK_TOKEN,
          CONFLUENCE_LABEL: 'qa-requirement',
        },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const port = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 4180;
  const mock = await startMockAtlassian({ port });
  console.log(`Mock Jira + Confluence on ${mock.url}. Point the sync at it with:\n`);
  for (const [k, v] of Object.entries(mock.env)) console.log(`  ${k}=${v}`);
  console.log('\nCtrl+C to stop.');
}
