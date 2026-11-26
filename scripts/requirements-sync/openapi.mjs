// OpenAPI/Swagger adapter: one requirement per operation; one AC per documented response.
// Works with OpenAPI 3.x and Swagger 2.0, YAML or JSON. Contracts are already signed off when they are
// committed, so synced operations are `ready` (in-scope).
import fs from 'node:fs';
import { parse } from 'yaml';

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

function responseAc(method, route, code, resp, secured) {
  const who = secured && code !== '401' && code !== '403' ? 'an authenticated client' : 'a client';
  const desc = (resp?.description ?? '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  const when = desc ? `${who} sends ${method.toUpperCase()} \`${route}\` and the case is: ${desc}` : `${who} sends ${method.toUpperCase()} \`${route}\``;
  const content = resp?.content?.['application/json']?.schema ?? resp?.schema;
  const body = content ? ' with a JSON body matching the contract schema' : '';
  return `WHEN ${when} THE SYSTEM SHALL respond \`${code}\`${body}.`;
}

export function fromSpec(specPath, text = fs.readFileSync(specPath, 'utf8')) {
  const spec = parse(text);
  const globalSecurity = (spec.security ?? []).length > 0;
  const out = [];
  for (const [route, ops] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = ops?.[method];
      if (!op) continue;
      const secured = op.security ? op.security.length > 0 : globalSecurity;
      const codes = Object.keys(op.responses ?? {}).sort();
      out.push({
        source: `openapi:${specPath.replace(/\\/g, '/')}#${method.toUpperCase()} ${route}`,
        title: op.summary || `${method.toUpperCase()} ${route}`,
        ready: !op.deprecated,
        journey: `API — ${method.toUpperCase()} ${route}`,
        contract: specPath.replace(/\\/g, '/'),
        acceptance: codes.map((c) => responseAc(method, route, c, op.responses[c], secured)),
        notes: [op.description, op.deprecated ? 'Deprecated in the contract; kept as draft.' : null].filter(Boolean),
      });
    }
  }
  return out;
}
