import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildSemanticTag, classifyVersionBump, parseProductionVersion } from './release-production-core.mjs';

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
parseProductionVersion(version);
const tag = buildSemanticTag(version);

if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
  console.log(`SemVer source verified: ${tag}. PR increment check applies on pull_request.`);
  process.exit(0);
}

const base = process.env.GITHUB_BASE_REF;
const eventPath = process.env.GITHUB_EVENT_PATH;
if (!base || !/^[a-zA-Z0-9._/-]+$/.test(base) || !eventPath) {
  throw new Error('A valid GitHub pull request base and event are required.');
}

const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
const title = String(event.pull_request?.title || '');
const body = String(event.pull_request?.body || '');
if (!title) throw new Error('The PR title is required for release classification.');

const basePackage = JSON.parse(
  execFileSync('git', ['show', `origin/${base}:package.json`], { encoding: 'utf8' }),
);
const bump = classifyVersionBump(basePackage.version, version);
const breaking = /^[a-z]+(?:\([^)]+\))?!:/i.test(title) || /(?:^|\n)BREAKING CHANGE:/i.test(body);
const expected = breaking ? 'major' : /^feat(?:\([^)]+\))?:/i.test(title) ? 'minor' : 'patch';
if (bump !== expected) {
  throw new Error(`PR "${title}" requires a ${expected} bump from ${basePackage.version}; package.json declares ${version} (${bump}).`);
}
console.log(`SemVer PR check passed: ${basePackage.version} -> ${version} (${bump}); target ${tag}.`);
