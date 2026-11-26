#!/usr/bin/env node
// CI check for agent-authored PRs: a requirement change lands on its own, before any test work.
// Claude may write requirements, but never in the same PR as the tests or checks that are graded
// against them; otherwise an agent could move the target and the arrow together.
// Allowed together with requirements/: inventory/ (criterion text), docs/, escalations/, proposals/.
import { execSync } from 'node:child_process';

const base = process.env.BASE_REF || 'origin/main';
const changed = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' }).split('\n').filter(Boolean);
const reqs = changed.filter((f) => f.startsWith('requirements/'));
const graded = changed.filter((f) => /^(tests|skills|specs|sealed-acceptance|demo-aut)\//.test(f));

if (reqs.length && graded.length) {
  console.error(
    'requirements-isolation: this PR changes requirements and the code graded against them.\n' +
      `  requirements: ${reqs.join(', ')}\n` +
      `  graded:       ${graded.join(', ')}\n` +
      'Fix: move the requirements/ change (and its inventory/ criterion text) into its own PR, merge it,\n' +
      'then open the test/app PR on top of it.',
  );
  process.exit(1);
}
console.log(`requirements-isolation: ok (${reqs.length} requirement file(s), ${graded.length} graded file(s)).`);
