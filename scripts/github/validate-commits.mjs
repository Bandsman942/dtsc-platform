import { execFileSync } from 'node:child_process';
import { isValidCommit } from './delivery-governance-core.mjs';
const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD~1';
let raw = ''; try { raw = execFileSync('git', ['log', '--format=%H%x09%an%x09%s', `${base}..HEAD`], { encoding:'utf8' }); } catch { raw = execFileSync('git', ['log','-1','--format=%H%x09%an%x09%s'], { encoding:'utf8' }); }
const bad = raw.trim().split(/\n+/).filter(Boolean).map((line)=>line.split('\t')).filter(([,author,subject])=>!isValidCommit(subject,author));
if (bad.length) { console.error('Invalid commit messages:\n' + bad.map(([sha,,subject])=>`- ${sha.slice(0,7)} ${subject}`).join('\n')); process.exit(1); }
console.log('Commit messages satisfy DTSC Conventional Commit contract.');
