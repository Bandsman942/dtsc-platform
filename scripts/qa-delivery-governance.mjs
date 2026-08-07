import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BRANCH_PATTERN, isValidBranch, isValidTitle, isValidCommit, extractLinkedIssue, missingEssentialLabels } from './github/delivery-governance-core.mjs';
assert.equal(BRANCH_PATTERN.test('chore/120-delivery-governance-v1'), true);
assert.equal(isValidBranch('feature/no-issue'), false);
assert.equal(isValidTitle('ci(delivery): establish governance'), true);
assert.equal(isValidTitle('Delivery governance'), false);
assert.equal(extractLinkedIssue('Closes #120'), 120);
assert.equal(extractLinkedIssue('No issue'), null);
assert.equal(isValidCommit('docs(delivery): document release contract'), true);
assert.equal(isValidCommit('random commit'), false);
assert.deepEqual(missingEssentialLabels(['type:chore','priority:P1','area:infra-ci','delivery-impact:high']), []);
const sync=fs.readFileSync('scripts/github/sync-delivery-governance.mjs','utf8'); assert.match(sync,/dry-run/); assert.match(sync,/--apply/);
const release=fs.readFileSync('scripts/github/release-production.mjs','utf8'); assert.match(release,/state!==['"']success/); assert.match(release,/Release already exists/i); assert.equal(release.includes('vercel[bot]'), true); assert.equal(release.includes('generate_release_notes:true'), true);
const workflow=fs.readFileSync('.github/workflows/production-release.yml','utf8'); assert.match(workflow,/deployment_status/); assert.match(workflow,/environment == 'Production'/);
for(const file of ['.github/workflows/quality-gates.yml','.github/workflows/production-release.yml']){const content=fs.readFileSync(file,'utf8');assert.doesNotMatch(content,/ghp_[A-Za-z0-9]{20,}/);assert.doesNotMatch(content,/VERCEL_TOKEN:\s*[A-Za-z0-9_-]{20,}/);}
console.log('Delivery governance QA passed.');
