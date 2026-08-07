import fs from 'node:fs';
import { isValidBranch, isValidTitle, extractLinkedIssue, MATERIAL_IMPACTS, missingEssentialLabels } from './delivery-governance-core.mjs';
const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME;
if (!eventPath || !fs.existsSync(eventPath)) { console.log('No GitHub event payload; metadata validation skipped.'); process.exit(0); }
const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
if (eventName !== 'pull_request') { const branch = process.env.GITHUB_REF_NAME || ''; if (!isValidBranch(branch)) { console.error(`Invalid branch: ${branch}`); process.exit(1); } console.log(`Branch ${branch} accepted for ${eventName}.`); process.exit(0); }
const pr = event.pull_request; const errors = [];
if (!isValidBranch(pr.head.ref)) errors.push(`Branch '${pr.head.ref}' violates the delivery branch contract.`);
if (!isValidTitle(pr.title)) errors.push(`PR title '${pr.title}' is not Conventional Commit compatible.`);
const issueNumber = extractLinkedIssue(pr.body); if (!issueNumber) errors.push('PR body must link an Issue with Closes/Fixes/Resolves #N.');
const requiredHeadings = ['## Issue','## Objectif','## Impact livraison','## Changements','## Base de données / Prisma','## Sécurité / RBAC / multi-tenant','## Validation automatique','## Risques','## Rollback','## Documentation','## Release note','## Preuves'];
for (const heading of requiredHeadings) if (!String(pr.body || '').includes(heading)) errors.push(`Missing PR template section: ${heading}`);
const labelNames = (pr.labels || []).map((x) => x.name); const missing = missingEssentialLabels(labelNames); if (missing.length) errors.push(`PR missing structured labels: ${missing.join(', ')}`); const material = labelNames.some((x) => MATERIAL_IMPACTS.has(x)); if (material && !pr.milestone) errors.push('Material PR requires an active milestone.');
if (issueNumber && process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues/${issueNumber}`, { headers:{accept:'application/vnd.github+json',authorization:`Bearer ${process.env.GITHUB_TOKEN}`,'x-github-api-version':'2022-11-28'} });
  if (!res.ok) errors.push(`Linked Issue #${issueNumber} does not exist or is inaccessible.`); else { const issue = await res.json(); if (issue.pull_request) errors.push(`Linked #${issueNumber} is a PR, not an Issue.`); }
}
if (errors.length) { console.error(errors.map((x)=>`- ${x}`).join('\n')); process.exit(1); }
console.log(`Delivery governance metadata valid for PR #${pr.number}; linked Issue #${issueNumber}.`);
