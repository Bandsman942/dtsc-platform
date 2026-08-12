import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy = fs.readFileSync('docs/VERCEL_PREVIEW_E2E_POLICY.md', 'utf8');
const previewStatusWorkflow = fs.readFileSync(
  '.github/workflows/vercel-production-only-status.yml',
  'utf8',
);
const qualityGatesWorkflow = fs.readFileSync(
  '.github/workflows/quality-gates.yml',
  'utf8',
);

assert.match(policy, /Production uniquement depuis `main`/i);
assert.match(policy, /non autoritatifs? pour la validation applicative/i);
assert.match(policy, /Resource provisioning failed/i);
assert.match(policy, /Quality gates/i);
assert.match(policy, /workflow_dispatch/);
assert.match(policy, /Authenticated browser acceptance/i);
assert.match(policy, /CI_PROVEN/);
assert.match(policy, /OWNER_E2E/);
assert.match(policy, /ne permet pas de contourner cette exigence/i);
assert.match(policy, /Échec Vercel Production.*bloquant/i);

assert.match(previewStatusWorkflow, /repository_dispatch/);
assert.match(previewStatusWorkflow, /vercel\.deployment\.(?:error|failed)/);
assert.match(previewStatusWorkflow, /environment == 'preview'/);
assert.match(previewStatusWorkflow, /state: 'success'/);
assert.match(
  previewStatusWorkflow,
  /Preview intentionally disabled; production deploys only from main\./,
);
assert.doesNotMatch(
  previewStatusWorkflow,
  /environment == ['"]production['"].*state: ['"]success['"]/is,
  'Un échec Production ne doit jamais être normalisé en succès par le contrat Preview.',
);

assert.match(qualityGatesWorkflow, /workflow_dispatch:/);
assert.match(qualityGatesWorkflow, /authenticated-browser-acceptance:/);
assert.match(
  qualityGatesWorkflow,
  /if: github\.event_name == 'workflow_dispatch'/,
);
assert.match(qualityGatesWorkflow, /pnpm exec playwright install/);
assert.match(qualityGatesWorkflow, /pnpm e2e:erp-professional/);
assert.match(qualityGatesWorkflow, /needs: \[quality, migration\]/);

console.log('Vercel Preview / pre-merge E2E policy QA passed.');
