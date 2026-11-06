import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildSemanticTag, classifyVersionBump, compareProductionVersions,
  findSemanticTagForSha, parseProductionVersion,
} from './github/release-production-core.mjs';

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
assert.equal(buildSemanticTag(version), `v${version}`);
assert.deepEqual(parseProductionVersion('1.1.0'), [1, 1, 0]);
for (const invalid of ['01.2.3', '1.02.3', '1.2', 'v1.2.3', '1.2.3-beta.1', '1.2.3+build', '-1.2.3']) {
  assert.throws(() => parseProductionVersion(invalid));
}
assert.equal(classifyVersionBump('1.0.0', '1.0.1'), 'patch');
assert.equal(classifyVersionBump('1.0.0', '1.1.0'), 'minor');
assert.equal(classifyVersionBump('1.9.7', '2.0.0'), 'major');
for (const invalid of ['1.0.0', '0.9.9', '1.0.2', '1.2.1', '2.0.1']) {
  assert.throws(() => classifyVersionBump('1.0.0', invalid));
}
assert.equal(compareProductionVersions('1.10.0', '1.9.12') > 0, true);
assert.equal(compareProductionVersions('2.0.0', '1.99.99') > 0, true);
assert.equal(compareProductionVersions('1.1.0', '1.1.0'), 0);
const sha = '1234567890abcdef1234567890abcdef12345678';
assert.equal(findSemanticTagForSha([{ ref: 'refs/tags/v1.1.0', object: { sha } }], sha), 'v1.1.0');
assert.equal(findSemanticTagForSha([{ ref: 'refs/tags/prod-20261105-2216-1234567', object: { sha } }], sha), null);
assert.equal(findSemanticTagForSha([{ ref: 'refs/tags/v1.1.0', object: { sha: 'different' } }], sha), null);

const release = fs.readFileSync('scripts/github/release-production.mjs', 'utf8');
assert.match(release, /isProductionDeployment\(event\)/);
assert.match(release, /mainRef\.object\.sha/);
assert.match(release, /findSemanticTagForSha/);
assert.match(release, /existingVersionRef\.object\?\.sha !== sha/);
assert.match(release, /non-monotonic release/);
assert.match(release, /buildSemanticTag\(version\)/);
assert.match(release, /shouldCreateSuccessfulRelease/);
assert.match(release, /git\/refs/);
const governance = fs.readFileSync('.github/workflows/quality-gates.yml', 'utf8');
assert.match(governance, /Validate SemVer increment/);
const instructions = fs.readFileSync('docs/RELEASE_VERSIONING.md', 'utf8');
assert.match(instructions, /MAJOR\.MINOR\.PATCH/);
assert.match(instructions, /OWNER_E2E/);
console.log('SemVer governance and production release contract passed.');
