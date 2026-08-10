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

const issueNumber = extractLinkedIssue(pr.body);
if (!issueNumber) {
  errors.push('PR body must link an Issue with Closes/Fixes/Resolves #N.');
}

const requiredHeadings = [
  '## Issue',
  '## Objectif',
  '## Impact livraison',
  '## Changements',
  '## Base de données / Prisma',
  '## Sécurité / RBAC / multi-tenant',
  '## Validation automatique',
  '## Risques',
  '## Rollback',
  '## Documentation',
  '## Release note',
  '## Preuves',
  '## Gouvernance de contribution',
];
for (const heading of requiredHeadings) {
  if (!String(pr.body || '').includes(heading)) {
    errors.push(`Missing PR template section: ${heading}`);
  }
}

const isAutomatedDependencyPr = /^(dependabot|renovate)\//.test(pr.head.ref);
if (!isAutomatedDependencyPr && !hasContributingAcknowledgement(pr.body)) {
  errors.push("PR must confirm: - [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.");
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
