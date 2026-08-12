import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BRANCH_PATTERN,
  isValidBranch,
  isValidCommit,
  isValidTitle,
  extractLinkedIssue,
  hasContributingAcknowledgement,
  missingEssentialLabels,
} from './github/delivery-governance-core.mjs';
import {
  buildProductionTag,
  findProductionTagForSha,
  hasReleaseForTag,
  isFinalDeploymentState,
  isProductionDeployment,
  shouldCreateSuccessfulRelease,
  shouldOpenProductionBlocker,
} from './github/release-production-core.mjs';

assert.equal(BRANCH_PATTERN.test('chore/120-delivery-governance-v1'), true);
assert.equal(isValidBranch('feature/no-issue'), false);
assert.equal(isValidTitle('ci(delivery): establish governance'), true);
assert.equal(isValidTitle('Delivery governance'), false);
assert.equal(extractLinkedIssue('Closes #120'), 120);
assert.equal(extractLinkedIssue('No issue'), null);
assert.equal(
  isValidCommit('docs(delivery): document release contract'),
  true,
);
assert.equal(isValidCommit('random commit'), false);
assert.equal(
  hasContributingAcknowledgement("- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`."),
  true,
);
assert.equal(
  hasContributingAcknowledgement("- [X] J’ai lu et respecté `docs/CONTRIBUTING.md`."),
  true,
);
assert.equal(
  hasContributingAcknowledgement("- [ ] J'ai lu et respecté `docs/CONTRIBUTING.md`."),
  false,
);
assert.deepEqual(
  missingEssentialLabels([
    'type:chore',
    'priority:P1',
    'area:infra-ci',
    'delivery-impact:high',
  ]),
  [],
);

const contributing = fs.readFileSync('docs/CONTRIBUTING.md', 'utf8');
assert.match(contributing, /obligatoire avant toute contribution/i);
assert.match(contributing, /dernier état réel de `main`/i);
assert.match(contributing, /delta fonctionnel/i);
assert.match(contributing, /arbre complet d'une branche historique/i);
assert.match(contributing, /Un test ne se neutralise jamais/i);
assert.match(contributing, /J'ai lu et respecté `docs\/CONTRIBUTING\.md`/i);
assert.match(contributing, /Production provient uniquement de `main`/i);
assert.match(contributing, /Pas de nouvelle dette silencieuse/i);
assert.match(contributing, /Dette créée/i);
assert.match(contributing, /Dette maintenue/i);
assert.match(contributing, /Dette remboursée/i);
assert.match(contributing, /Dette reportée/i);
assert.match(contributing, /LOCAL_EXECUTED/);
assert.match(contributing, /CI_PROVEN/);
assert.match(contributing, /OWNER_E2E/);
assert.match(contributing, /NOT_EXECUTED/);
assert.match(contributing, /aucune nouvelle chaîne utilisateur orpheline/i);
assert.match(contributing, /un grep ne voit pas un bouton cassé/i);
assert.match(contributing, /Performance et coût transverse/i);

const prTemplate = fs.readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8');
assert.match(prTemplate, /## Dette de contribution/);
assert.match(prTemplate, /## Matrice de preuves/);
assert.match(prTemplate, /## Validation UI \/ i18n \/ accessibilité/);
assert.match(prTemplate, /LOCAL_EXECUTED/);
assert.match(prTemplate, /CI_PROVEN/);
assert.match(prTemplate, /OWNER_E2E/);
assert.match(prTemplate, /NOT_EXECUTED/);
assert.match(prTemplate, /## Gouvernance de contribution/);
assert.match(prTemplate, /- \[ \] J'ai lu et respecté `docs\/CONTRIBUTING\.md`\./);
assert.match(prTemplate, /aucune dette silencieuse/i);
assert.match(prTemplate, /aucun test, build, E2E ou déploiement réussi sans preuve réelle/i);

const validator = fs.readFileSync('scripts/github/validate-pr-governance.mjs', 'utf8');
assert.match(validator, /hasContributingAcknowledgement/);
assert.match(validator, /Gouvernance de contribution/);
assert.match(validator, /Dette de contribution/);
assert.match(validator, /Matrice de preuves/);
assert.match(validator, /no-silent-debt contribution rule/);
assert.match(validator, /truthful execution evidence/);

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.match(
  packageJson.packageManager ?? '',
  /^pnpm@10\./,
  'DTSC utilise encore pnpm 10 : pnpm/action-setup reste le contrat officiel jusqu’à une migration explicite vers pnpm 11+.',
);

const workflowDirectory = '.github/workflows';
const workflowFiles = fs
  .readdirSync(workflowDirectory)
  .filter((file) => /\.ya?ml$/i.test(file));
let pnpmSetupOccurrences = 0;
for (const file of workflowFiles) {
  const workflowPath = path.join(workflowDirectory, file);
  const content = fs.readFileSync(workflowPath, 'utf8');
  for (const match of content.matchAll(/pnpm\/action-setup@v(\d+)/g)) {
    pnpmSetupOccurrences += 1;
    const major = Number(match[1]);
    assert.ok(
      major >= 6,
      `${workflowPath} utilise pnpm/action-setup@v${major}; pnpm 10 exige une version supportée de l'action sans runtime Node.js 20 déprécié.`,
    );
  }
}
assert.ok(
  pnpmSetupOccurrences > 0,
  'Le contrat CI attend au moins une utilisation explicite de pnpm/action-setup tant que DTSC reste sur pnpm 10.',
);

const productionSuccessEvent = {
  deployment: {
    sha: '1234567890abcdef1234567890abcdef12345678',
    environment: 'Production',
    creator: { login: 'vercel[bot]' },
  },
  deployment_status: { state: 'success' },
};
const previewEvent = {
  deployment: {
    sha: productionSuccessEvent.deployment.sha,
    environment: 'Preview',
    creator: { login: 'vercel[bot]' },
  },
  deployment_status: { state: 'success' },
};

assert.equal(isProductionDeployment(productionSuccessEvent), true);
assert.equal(isProductionDeployment(previewEvent), false);
assert.equal(isFinalDeploymentState('success'), true);
assert.equal(isFinalDeploymentState('pending'), false);
assert.equal(shouldOpenProductionBlocker('failure'), true);
assert.equal(shouldOpenProductionBlocker('error'), true);
assert.equal(shouldOpenProductionBlocker('success'), false);
assert.equal(
  shouldCreateSuccessfulRelease({
    state: 'failure',
    hasReleaseForSha: false,
  }),
  false,
  'A failed Production deployment must never create a successful Release.',
);
assert.equal(
  shouldCreateSuccessfulRelease({
    state: 'success',
    hasReleaseForSha: false,
  }),
  true,
);
assert.equal(
  shouldCreateSuccessfulRelease({
    state: 'success',
    hasReleaseForSha: true,
  }),
  false,
  'An existing Release for the same SHA must make Release creation idempotent.',
);

const tag = buildProductionTag(
  '2026-08-07T11:30:00.000Z',
  productionSuccessEvent.deployment.sha,
);
assert.equal(tag, 'prod-20260807-1130-1234567');
const refs = [
  {
    ref: `refs/tags/${tag}`,
    object: { sha: productionSuccessEvent.deployment.sha },
  },
];
assert.equal(
  findProductionTagForSha(refs, productionSuccessEvent.deployment.sha),
  tag,
);
assert.equal(hasReleaseForTag([{ tag_name: tag }], tag), true);
assert.equal(hasReleaseForTag([], tag), false);

const sync = fs.readFileSync(
  'scripts/github/sync-delivery-governance.mjs',
  'utf8',
);
assert.match(sync, /dry-run/);
assert.match(sync, /--apply/);

const release = fs.readFileSync(
  'scripts/github/release-production.mjs',
  'utf8',
);
assert.equal(release.includes('vercel[bot]'), true);
assert.equal(release.includes('generate_release_notes: true'), true);
assert.match(release, /ghAll/);

const workflow = fs.readFileSync(
  '.github/workflows/production-release.yml',
  'utf8',
);
assert.match(workflow, /deployment_status/);
assert.match(workflow, /environment == 'Production'/);

for (const file of [
  '.github/workflows/quality-gates.yml',
  '.github/workflows/production-release.yml',
]) {
  const content = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(content, /ghp_[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(content, /VERCEL_TOKEN:\s*[A-Za-z0-9_-]{20,}/);
}

console.log('Delivery governance QA passed.');
