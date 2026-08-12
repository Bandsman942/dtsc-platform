import fs from 'node:fs';
import {
  isValidBranch,
  isValidTitle,
  extractLinkedIssue,
  hasContributingAcknowledgement,
  MATERIAL_IMPACTS,
  missingEssentialLabels,
} from './delivery-governance-core.mjs';

const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME;

if (!eventPath || !fs.existsSync(eventPath)) {
  console.log('No GitHub event payload; metadata validation skipped.');
  process.exit(0);
}

const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));

if (eventName !== 'pull_request') {
  const branch = process.env.GITHUB_REF_NAME || '';
  if (!isValidBranch(branch)) {
    console.error(`Invalid branch: ${branch}`);
    process.exit(1);
  }
  console.log(`Branch ${branch} accepted for ${eventName}.`);
  process.exit(0);
}

const eventPr = event.pull_request;
const errors = [];
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const headers = token
  ? {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    }
  : { accept: 'application/vnd.github+json' };

function sectionBody(body, heading) {
  const source = String(body || '');
  const start = source.indexOf(heading);
  if (start < 0) return '';
  const contentStart = start + heading.length;
  const nextHeading = source.indexOf('\n## ', contentStart);
  return source.slice(contentStart, nextHeading < 0 ? source.length : nextHeading).trim();
}

function debtLine(section, label) {
  return section.split(/\r?\n/).find((line) => line.trim().toLowerCase().startsWith(`- ${label.toLowerCase()}`)) || '';
}

// A rerun keeps the original webhook payload. Always prefer live GitHub
// metadata so labels, milestone, edited body/title and mergeability are current.
let pr = eventPr;
let liveIssueMetadata = null;

if (token && repository) {
  const [prResponse, issueResponse] = await Promise.all([
    fetch(`https://api.github.com/repos/${repository}/pulls/${eventPr.number}`, { headers }),
    fetch(`https://api.github.com/repos/${repository}/issues/${eventPr.number}`, { headers }),
  ]);

  if (!prResponse.ok) {
    errors.push(`Unable to read live PR #${eventPr.number} metadata.`);
  } else {
    pr = await prResponse.json();
  }

  if (!issueResponse.ok) {
    errors.push(`Unable to read live Issue metadata for PR #${eventPr.number}.`);
  } else {
    liveIssueMetadata = await issueResponse.json();
  }
}

if (!isValidBranch(pr.head.ref)) {
  errors.push(`Branch '${pr.head.ref}' violates the delivery branch contract.`);
}
if (!isValidTitle(pr.title)) {
  errors.push(`PR title '${pr.title}' is not Conventional Commit compatible.`);
}

const body = String(pr.body || '');
const issueNumber = extractLinkedIssue(body);
if (!issueNumber) {
  errors.push('PR body must link an Issue with Closes/Fixes/Resolves #N.');
}

const requiredHeadings = [
  '## Issue',
  '## Objectif',
  '## Impact livraison',
  '## Changements',
  '## Dette de contribution',
  '## Base de données / Prisma',
  '## Sécurité / RBAC / multi-tenant',
  '## Validation automatique',
  '## Validation UI / i18n / accessibilité',
  '## Matrice de preuves',
  '## Risques',
  '## Rollback',
  '## Documentation',
  '## Release note',
  '## Preuves',
  '## Gouvernance de contribution',
];
for (const heading of requiredHeadings) {
  if (!body.includes(heading)) {
    errors.push(`Missing PR template section: ${heading}`);
  }
}

const debtSection = sectionBody(body, '## Dette de contribution');
for (const label of ['Dette créée', 'Dette maintenue', 'Dette remboursée', 'Dette reportée']) {
  if (!debtLine(debtSection, label)) errors.push(`Contribution debt ledger must include '${label}'.`);
}

for (const label of ['Dette créée', 'Dette reportée']) {
  const line = debtLine(debtSection, label);
  if (line && !/\bAucune\b/i.test(line) && !/#\d+/.test(line)) {
    errors.push(`${label} must be 'Aucune' or reference a dedicated Issue #N.`);
  }
}

const evidenceSection = sectionBody(body, '## Matrice de preuves');
const evidenceStatuses = ['LOCAL_EXECUTED', 'CI_PROVEN', 'OWNER_E2E', 'NOT_EXECUTED'];
if (!evidenceStatuses.some((status) => evidenceSection.includes(status))) {
  errors.push(`Evidence matrix must use explicit statuses: ${evidenceStatuses.join(', ')}.`);
}
if (/\b(devrait passer|normalement vert|semble vert|supposé vert)\b/i.test(evidenceSection)) {
  errors.push('Evidence matrix contains speculative success language instead of an execution status.');
}

const isAutomatedDependencyPr = /^(dependabot|renovate)\//.test(pr.head.ref);
if (!isAutomatedDependencyPr && !hasContributingAcknowledgement(body)) {
  errors.push("PR must confirm: - [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.");
}

if (!isAutomatedDependencyPr && !/- \[[xX]\] Je n'ai introduit aucune dette silencieuse/i.test(body)) {
  errors.push("PR must explicitly confirm the no-silent-debt contribution rule.");
}
if (!isAutomatedDependencyPr && !/- \[[xX]\] Je n'ai déclaré aucun test, build, E2E ou déploiement réussi sans preuve réelle/i.test(body)) {
  errors.push("PR must explicitly confirm truthful execution evidence.");
}

const structuredMetadata = liveIssueMetadata || pr;
const labelNames = (structuredMetadata.labels || []).map((label) =>
  typeof label === 'string' ? label : label.name,
);
const missing = missingEssentialLabels(labelNames);
if (missing.length) {
  errors.push(`PR missing structured labels: ${missing.join(', ')}`);
}

const material = labelNames.some((label) => MATERIAL_IMPACTS.has(label));
if (material && !structuredMetadata.milestone) {
  errors.push('Material PR requires an active milestone.');
}

const uiMaterial = material && labelNames.some((label) => ['area:ui', 'area:ux', 'area:mobile'].includes(label));
if (uiMaterial) {
  const uiSection = sectionBody(body, '## Validation UI / i18n / accessibilité');
  if (!uiSection || /- \[x\] non concerné/i.test(uiSection)) {
    errors.push('Material UI/UX/mobile PR cannot mark rendered UI validation as not applicable.');
  }
}

if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
  errors.push('PR has an obvious merge conflict with main.');
}

if (issueNumber && token && repository) {
  const linkedIssueResponse = await fetch(
    `https://api.github.com/repos/${repository}/issues/${issueNumber}`,
    { headers },
  );
  if (!linkedIssueResponse.ok) {
    errors.push(`Linked Issue #${issueNumber} does not exist or is inaccessible.`);
  } else {
    const linkedIssue = await linkedIssueResponse.json();
    if (linkedIssue.pull_request) {
      errors.push(`Linked #${issueNumber} is a PR, not an Issue.`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(
  `Delivery governance metadata valid for PR #${pr.number}; linked Issue #${issueNumber}.`,
);
