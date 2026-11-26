// Jira Cloud adapter (REST v3). One requirement per issue.
//   JIRA_BASE_URL     https://your-site.atlassian.net
//   JIRA_EMAIL        account email for the API token
//   JIRA_API_TOKEN    https://id.atlassian.com/manage-profile/security/api-tokens
//   JIRA_JQL          which issues, e.g. project = SHOP AND labels = qa-sync
//   JIRA_AC_FIELD     optional custom field id holding acceptance criteria (e.g. customfield_10042);
//                     otherwise ACs are read from the description
//   JIRA_READY        optional comma list of statuses or labels that mean "ready" (default: Ready,Ready for QA,qa-ready)
import { extractAcceptance } from './core.mjs';

// Atlassian Document Format → plain text, one line per paragraph or list item.
export function adfToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text ?? '';
  const inner = (node.content ?? []).map(adfToText);
  if (['paragraph', 'heading', 'listItem', 'codeBlock'].includes(node.type)) return inner.join('') + '\n';
  if (node.type === 'hardBreak') return '\n';
  return inner.join('');
}

export function issueToRequirement(issue, { baseUrl, acField, ready }) {
  const f = issue.fields ?? {};
  const acText = acField && f[acField] ? adfToText(f[acField]) : adfToText(f.description);
  const marks = new Set([f.status?.name, ...(f.labels ?? [])].filter(Boolean).map((s) => s.toLowerCase()));
  return {
    source: `jira:${issue.key}`,
    sourceUrl: baseUrl ? `${baseUrl.replace(/\/$/, '')}/browse/${issue.key}` : undefined,
    title: f.summary ?? issue.key,
    ready: ready.some((r) => marks.has(r.toLowerCase())),
    journey: (f.components ?? []).map((c) => c.name).join(', ') || undefined,
    acceptance: extractAcceptance(acText),
    notes: [`Jira status: ${f.status?.name ?? 'unknown'}`],
  };
}

export async function fetchJira(env = process.env, fetchImpl = fetch) {
  const { JIRA_BASE_URL: base, JIRA_EMAIL: email, JIRA_API_TOKEN: token, JIRA_JQL: jql } = env;
  if (!base || !email || !token || !jql) throw new Error('jira: set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN and JIRA_JQL');
  const acField = env.JIRA_AC_FIELD;
  const ready = (env.JIRA_READY || 'Ready,Ready for QA,qa-ready').split(',').map((s) => s.trim());
  const fields = ['summary', 'description', 'status', 'labels', 'components', ...(acField ? [acField] : [])].join(',');
  const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  const out = [];
  let next;
  do {
    const url = new URL('/rest/api/3/search/jql', base);
    url.searchParams.set('jql', jql);
    url.searchParams.set('fields', fields);
    url.searchParams.set('maxResults', '50');
    if (next) url.searchParams.set('nextPageToken', next);
    const res = await fetchImpl(url, { headers: { authorization: auth, accept: 'application/json' } });
    if (!res.ok) throw new Error(`jira: HTTP ${res.status} from ${url.pathname}`);
    const page = await res.json();
    for (const issue of page.issues ?? []) out.push(issueToRequirement(issue, { baseUrl: base, acField, ready }));
    next = page.nextPageToken;
  } while (next);
  return out;
}
