// Confluence Cloud adapter (REST v2). One requirement per page carrying a label.
//   CONFLUENCE_BASE_URL    https://your-site.atlassian.net   (the /wiki prefix is added here)
//   CONFLUENCE_EMAIL       account email for the API token
//   CONFLUENCE_API_TOKEN   same kind of token as Jira
//   CONFLUENCE_LABEL       pages with this label are synced (e.g. qa-requirement)
//   CONFLUENCE_READY_LABEL optional label that marks a page ready (default: qa-ready)
// The page needs an "Acceptance criteria" heading followed by a list (EARS or Given/When/Then lines).
import { extractAcceptance } from './core.mjs';

// Confluence storage format (XHTML) → plain text lines. Good enough for headings, lists and paragraphs.
export function storageToText(html) {
  return String(html ?? '')
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function pageToRequirement(page, { baseUrl, readyLabel, labels }) {
  const text = storageToText(page.body?.storage?.value);
  return {
    source: `confluence:${page.id}`,
    sourceUrl: baseUrl && page._links?.webui ? `${baseUrl.replace(/\/$/, '')}/wiki${page._links.webui}` : undefined,
    title: page.title,
    ready: labels.includes(readyLabel),
    acceptance: extractAcceptance(text),
    notes: [`Confluence page version ${page.version?.number ?? '?'}`],
  };
}

export async function fetchConfluence(env = process.env, fetchImpl = fetch) {
  const { CONFLUENCE_BASE_URL: base, CONFLUENCE_EMAIL: email, CONFLUENCE_API_TOKEN: token, CONFLUENCE_LABEL: label } = env;
  if (!base || !email || !token || !label) throw new Error('confluence: set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN and CONFLUENCE_LABEL');
  const readyLabel = env.CONFLUENCE_READY_LABEL || 'qa-ready';
  const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  const get = async (p) => {
    const res = await fetchImpl(new URL(p, base), { headers: { authorization: auth, accept: 'application/json' } });
    if (!res.ok) throw new Error(`confluence: HTTP ${res.status} from ${p.split('?')[0]}`);
    return res.json();
  };
  const labels = await get(`/wiki/api/v2/labels?prefix=global&limit=250`);
  const labelId = (labels.results ?? []).find((l) => l.name === label)?.id;
  if (!labelId) return [];
  const out = [];
  let next = `/wiki/api/v2/labels/${labelId}/pages?body-format=storage&limit=50`;
  while (next) {
    const page = await get(next);
    for (const p of page.results ?? []) {
      const pl = await get(`/wiki/api/v2/pages/${p.id}/labels?limit=100`);
      out.push(pageToRequirement(p, { baseUrl: base, readyLabel, labels: (pl.results ?? []).map((l) => l.name) }));
    }
    next = page._links?.next ?? null;
  }
  return out;
}
