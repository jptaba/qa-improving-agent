import fs from 'node:fs';
import path from 'node:path';

/** Read requirements/REQ-*.md frontmatter + EARS criteria. Tolerates Windows line endings. */
export function loadRequirements(dir = 'requirements') {
  return fs
    .readdirSync(dir)
    .filter((f) => /^REQ-\d+.*\.md$/.test(f))
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
      const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      const get = (k) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim();
      return {
        id: get('id'),
        title: get('title'),
        status: get('status'),
        contract: get('contract') ?? null,
        file: path.join(dir, f).split(path.sep).join('/'),
        criteria: [...text.matchAll(/\*\*(AC\d+):\*\*\s*(.+)/g)].map((m) => ({ id: m[1], text: m[2] })),
      };
    })
    .filter((r) => r.id);
}

export function loadInventory(file = 'inventory/tests.json') {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
