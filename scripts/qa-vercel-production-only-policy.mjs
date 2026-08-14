import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const policy = fs.readFileSync('docs/VERCEL_PRODUCTION_ONLY_POLICY.md', 'utf8');
const contributing = fs.readFileSync('docs/CONTRIBUTING.md', 'utf8');
const prTemplate = fs.readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8');
const qualityGatesWorkflow = fs.readFileSync('.github/workflows/quality-gates.yml', 'utf8');

const deploymentEnabled = vercel?.git?.deploymentEnabled;
assert.equal(typeof deploymentEnabled, 'object', 'vercel.json doit définir git.deploymentEnabled comme objet de règles.');
assert.equal(deploymentEnabled.main, true, 'main doit rester explicitement autorisé pour Vercel Production.');
assert.equal(deploymentEnabled['**'], false, 'Le globstar ** doit désactiver toutes les branches non-main, y compris celles contenant /.');

for (const [pattern, enabled] of Object.entries(deploymentEnabled)) {
  if (pattern === 'main') continue;
  assert.equal(enabled, false, `Aucune règle non-main ne peut autoriser un déploiement Vercel : ${pattern}`);
}

assert.match(vercel.ignoreCommand ?? '', /VERCEL_ENV/);
assert.match(vercel.ignoreCommand ?? '', /production/);
assert.match(vercel.ignoreCommand ?? '', /exit 1/);
assert.match(vercel.ignoreCommand ?? '', /exit 0/);

assert.equal(
  fs.existsSync('.github/workflows/vercel-production-only-status.yml'),
  false,
  'Le workflow historique qui normalisait les échecs Preview ne doit plus exister.',
);
assert.equal(
  fs.existsSync('.github/workflows/vercel-preview-e2e-policy.yml'),
  false,
  'Le workflow historique Preview doit être remplacé par le contrat production-only.',
);

assert.match(policy, /commits intermédiaires.*ne doivent pas déclencher de déploiement Vercel/is);
assert.match(policy, /Aucun Preview Vercel n’est attendu, requis ou utilisé comme condition de merge/i);
assert.match(policy, /GitHub Actions/i);
assert.match(policy, /OWNER_E2E/i);
assert.match(policy, /main.*Vercel Production/is);
assert.match(policy, /Preview Vercel inattendu.*violation du contrat de configuration/is);

assert.match(contributing, /Production provient uniquement de `main`/i);
assert.match(contributing, /merge\s*→\s*Vercel Production/i);
assert.match(contributing, /Les E2E requis sont réellement verts\/confirmés/i);

assert.match(prTemplate, /Les commits de branche\/PR restent sur GitHub/i);
assert.match(prTemplate, /Seul le commit fusionné sur `main` part vers Vercel Production/i);
assert.match(prTemplate, /OWNER_E2E.*ne dépend pas d['’]un Preview Vercel/i);

assert.match(qualityGatesWorkflow, /pull_request:/);
assert.match(qualityGatesWorkflow, /workflow_dispatch:/);
assert.match(qualityGatesWorkflow, /authenticated-browser-acceptance:/);
assert.match(qualityGatesWorkflow, /pnpm exec playwright install/);

console.log('Vercel production-only delivery policy QA passed.');
