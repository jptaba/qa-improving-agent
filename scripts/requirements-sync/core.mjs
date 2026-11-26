// Shared core for requirement sync: one normalised shape, rendered into the repo's EARS markdown format.
//
// A synced requirement:
//   { source: 'jira:QA-12' | 'confluence:123456' | 'openapi:requirements/openapi/x.yaml#POST /api/x',
//     sourceUrl?, title, ready: boolean, journey?, contract?, acceptance: [string], notes?: [string] }
//
// ids: an existing file whose frontmatter has the same `source:` keeps its REQ id (the file is updated in
// place). A new source gets the next free id in steps of 10 above the highest existing one.
// status: `in-scope` only when the source marks it ready; otherwise `draft`. The builder only writes tests
// for in-scope requirements, so half-written tickets never turn into tests.
import fs from 'node:fs';
import path from 'node:path';

export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  return Object.fromEntries(
    m[1]
      .split(/\r?\n/)
      .map((l) => /^([A-Za-z_]+):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.trim()]),
  );
}

export function readExisting(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^REQ-\d+.*\.md$/.test(f))
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      return { file: f, text, ...parseFrontmatter(text) };
    });
}

export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'requirement';

export function nextId(existing, taken = new Set()) {
  const nums = [...existing.map((e) => Number(/REQ-(\d+)/.exec(e.id ?? e.file)?.[1] ?? 0)), ...[...taken].map((t) => Number(t.slice(4)))];
  const max = Math.max(90, ...nums); // ids stay three digits or more (first one is REQ-100)
  return `REQ-${(Math.floor(max / 10) + 1) * 10}`;
}

const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

export function render(id, r) {
  const fm = [
    '---',
    `id: ${id}`,
    `title: ${clean(r.title)}`,
    `status: ${r.ready ? 'in-scope' : 'draft'}`,
    ...(r.journey ? [`journey: ${clean(r.journey)}`] : []),
    ...(r.contract ? [`contract: ${r.contract}`] : []),
    `source: ${r.source}`,
    ...(r.sourceUrl ? [`source_url: ${r.sourceUrl}`] : []),
    '---',
  ];
  const acs = r.acceptance.length
    ? r.acceptance.map((a, i) => `- **AC${i + 1}:** ${clean(a)}`)
    : ['- _No acceptance criteria found in the source. Status stays draft until they are added there._'];
  const notes = [`- Synced from \`${r.source}\` by \`scripts/requirements-sync\`. Edit it at the source; local edits are overwritten on the next sync.`, ...(r.notes ?? []).map((n) => `- ${clean(n)}`)];
  return [...fm, '', '## Acceptance criteria (EARS)', ...acs, '', '## Notes', ...notes, ''].join('\n');
}

/** Plan file writes for a batch of synced requirements. Returns [{ file, id, text, change: 'new'|'updated'|'unchanged' }]. */
export function plan(dir, synced) {
  const existing = readExisting(dir);
  const bySource = new Map(existing.filter((e) => e.source).map((e) => [e.source, e]));
  const taken = new Set();
  const out = [];
  for (const r of synced) {
    if (!r.acceptance.length) r.ready = false;
    const hit = bySource.get(r.source);
    const id = hit?.id ?? nextId(existing, taken);
    taken.add(id);
    const file = hit?.file ?? `${id}-${slug(r.title)}.md`;
    const text = render(id, r);
    out.push({ file, id, text, change: !hit ? 'new' : hit.text.replace(/\r\n/g, '\n') === text ? 'unchanged' : 'updated' });
  }
  return out;
}

/** Pull acceptance criteria out of free text: EARS lines, Given/When/Then, or an "Acceptance criteria" list. */
export function extractAcceptance(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^\*\*AC\d+:\*\*\s*/, '').trim())
    .filter(Boolean);
  const ears = lines.filter((l) => /\bTHE SYSTEM SHALL\b/i.test(l));
  if (ears.length) return ears;
  const gwt = [];
  let cur = null;
  for (const l of lines) {
    if (/^given\b/i.test(l)) {
      if (cur) gwt.push(cur);
      cur = l;
    } else if (cur && /^(when|then|and|but)\b/i.test(l)) cur += ` ${l}`;
  }
  if (cur) gwt.push(cur);
  if (gwt.length) return gwt;
  const start = lines.findIndex((l) => /^acceptance criteria\b/i.test(l.replace(/[:#]/g, '').trim()));
  if (start >= 0) {
    const out = [];
    for (const l of lines.slice(start + 1)) {
      if (/^#+\s|^(notes?|out of scope|scope)\b/i.test(l)) break;
      out.push(l);
    }
    return out;
  }
  return [];
}
