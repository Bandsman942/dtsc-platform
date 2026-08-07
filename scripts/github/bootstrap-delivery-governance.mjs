import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const payload='scripts/github/delivery-governance-payload.b64';
const oldQuality=fs.readFileSync('.github/workflows/quality-gates.yml','utf8');
const browserMarker='  authenticated-browser-acceptance:';
const browserJob=oldQuality.includes(browserMarker)?oldQuality.slice(oldQuality.indexOf(browserMarker)):'';
fs.writeFileSync('/tmp/delivery-governance.tar.gz',Buffer.from(fs.readFileSync(payload,'utf8').trim(),'base64'));
execFileSync('tar',['-xzf','/tmp/delivery-governance.tar.gz','-C','.'],{stdio:'inherit'});

if(browserJob){
  const file='.github/workflows/quality-gates.yml';
  let q=fs.readFileSync(file,'utf8');
  const i=q.indexOf(browserMarker);
  if(i>=0) q=q.slice(0,i)+browserJob;
  fs.writeFileSync(file,q);
}

const releaseScript=`const repo=process.env.GITHUB_REPOSITORY; const token=process.env.GITHUB_TOKEN; const eventPath=process.env.GITHUB_EVENT_PATH;
if(!repo||!token||!eventPath){console.error('Missing GitHub event context.');process.exit(2)}
const event=JSON.parse(await import('node:fs').then(m=>m.readFileSync(eventPath,'utf8'))); const dep=event.deployment; const status=event.deployment_status;
if(!dep||!status){console.error('production-release requires a deployment_status event.');process.exit(2)}
const sha=dep.sha; const state=status.state; const environment=dep.environment||status.environment; const creator=dep.creator?.login||''; const deployUrl=status.environment_url||status.target_url||status.log_url||''; const deploymentId=dep.id;
if(environment!=='Production'){console.log('Ignoring non-Production deployment.');process.exit(0)}
if(creator!=='vercel[bot]'){console.error('Ignoring Production status not created by vercel[bot].');process.exit(3)}
if(!sha||!['success','failure','error'].includes(state)){console.log('Ignoring non-final deployment state.');process.exit(0)}
const [owner,name]=repo.split('/'); const headers={accept:'application/vnd.github+json',authorization:\`Bearer \${token}\`,'x-github-api-version':'2022-11-28','content-type':'application/json'};
async function gh(method,ep,body){const r=await fetch(\`https://api.github.com\${ep}\`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const d=r.status===204?null:await r.json().catch(()=>null);if(!r.ok)throw new Error(\`\${method} \${ep} -> \${r.status}: \${d?.message||r.statusText}\`);return d}
const ref=await gh('GET',\`/repos/\${owner}/\${name}/git/ref/heads/main\`); const compare=await gh('GET',\`/repos/\${owner}/\${name}/compare/\${sha}...\${ref.object.sha}\`).catch(()=>null); if(ref.object.sha!==sha && !['ahead','identical'].includes(compare?.status)){console.error('Unable to prove Production SHA belongs to main history.');process.exit(4)}
if(state!=='success'){
 const title=\`[BUG] Production deployment failed — \${sha.slice(0,7)}\`; const q=encodeURIComponent(\`repo:\${repo} is:issue is:open in:title "\${title}"\`); const found=await gh('GET',\`/search/issues?q=\${q}\`); const body=\`SHA: \${sha}\\n\\nWorkflow run: https://github.com/\${repo}/actions/runs/\${process.env.GITHUB_RUN_ID}\\n\\nGitHub deployment ID: \${deploymentId}\\n\\nVercel Production URL: \${deployUrl||'non fournie'}\\n\\nDeployment status: \${state}\\n\\nCreator: \${creator}\\n\`; if(found.items?.[0]) await gh('PATCH',\`/repos/\${owner}/\${name}/issues/\${found.items[0].number}\`,{body}); else await gh('POST',\`/repos/\${owner}/\${name}/issues\`,{title,body,labels:['type:bug','priority:P1','delivery-impact:high','area:infra-ci','status:blocked']}); console.error('Production failed; successful Release intentionally blocked.'); process.exit(5);
}
const releases=await gh('GET',\`/repos/\${owner}/\${name}/releases?per_page=100\`); const sha7=sha.slice(0,7); const prior=releases.find(r=>r.tag_name?.endsWith(\`-\${sha7}\`)); if(prior){console.log(\`Release already exists for \${sha}; idempotent exit.\`);process.exit(0)}
const refs=await gh('GET',\`/repos/\${owner}/\${name}/git/matching-refs/tags/prod-\`).catch(()=>[]); const existingRef=(refs||[]).find(r=>r.ref?.endsWith(\`-\${sha7}\`)); const stamp=new Date(dep.created_at||status.created_at||Date.now()); const pad=n=>String(n).padStart(2,'0'); const tag=existingRef?.ref?.replace('refs/tags/','')||\`prod-\${stamp.getUTCFullYear()}\${pad(stamp.getUTCMonth()+1)}\${pad(stamp.getUTCDate())}-\${pad(stamp.getUTCHours())}\${pad(stamp.getUTCMinutes())}-\${sha7}\`;
if(!existingRef) await gh('POST',\`/repos/\${owner}/\${name}/git/refs\`,{ref:\`refs/tags/\${tag}\`,sha});
const prs=await gh('GET',\`/repos/\${owner}/\${name}/commits/\${sha}/pulls\`); const prLines=(prs||[]).map(p=>\`- #\${p.number} \${p.title}\`); const issues=[]; for(const pr of prs||[]) for(const m of String(pr.body||'').matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#(\\d+)/ig)) issues.push(\`#\${m[1]}\`);
let ci='non déterminé'; if(prs?.[0]?.head?.sha){const runs=await gh('GET',\`/repos/\${owner}/\${name}/actions/runs?head_sha=\${prs[0].head.sha}&event=pull_request&per_page=30\`).catch(()=>null); const run=runs?.workflow_runs?.find(r=>r.name==='Quality gates'); if(run?.html_url) ci=run.html_url;}
const milestones=[...new Set((prs||[]).map(p=>p.milestone?.title).filter(Boolean))]; const previous=releases.find(r=>r.tag_name?.startsWith('prod-'))?.tag_name||'aucune Release Production précédente'; const now=new Date(); const note=['# DTSC Platform Production Delivery','',\`Date/heure: \${now.toISOString()}\`,\`SHA: \${sha}\`,\`PR(s) incluse(s):\`,...(prLines.length?prLines:['- aucune PR résolue automatiquement']),\`Issues fermées: \${[...new Set(issues)].join(', ')||'aucune détectée'}\`,\`Milestone: \${milestones.join(', ')||'non déterminé'}\`,\`CI run: \${ci}\`,\`GitHub deployment: #\${deploymentId}\`,\`Vercel Production deployment: \${deployUrl||'URL non fournie'}\`,\`Deployment URL: \${deployUrl||'URL non fournie'}\`,'','## Changes',...(prLines.length?prLines:['- Livraison infrastructure/maintenance']),'','## Bug fixes','- Voir les PR et Issues liées.','','## Migrations','- Voir la section Base de données / Prisma des PR incluses.','','## Known issues','- Aucun connu automatiquement à la création de cette Release.','','## Rollback reference',\`- Release précédente: \${previous}\`].join('\\n');
await gh('POST',\`/repos/\${owner}/\${name}/releases\`,{tag_name:tag,target_commitish:sha,name:\`DTSC Production \${tag}\`,body:note,draft:false,prerelease:false}); console.log(\`Created immutable Production Release \${tag} for deployment \${deploymentId}.\`);`;
fs.writeFileSync('scripts/github/release-production.mjs',releaseScript+'\n');

const prodWorkflow=`name: Production release\n\non:\n  deployment_status:\n\npermissions:\n  contents: write\n  issues: write\n  pull-requests: read\n  actions: read\n\nconcurrency:\n  group: production-release-\${{ github.event.deployment.sha }}\n  cancel-in-progress: false\n\njobs:\n  release:\n    name: Production release\n    if: >-\n      github.event.deployment.environment == 'Production' &&\n      github.event.deployment.creator.login == 'vercel[bot]' &&\n      (github.event.deployment_status.state == 'success' || github.event.deployment_status.state == 'failure' || github.event.deployment_status.state == 'error')\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    steps:\n      - name: Checkout Production SHA\n        uses: actions/checkout@v4\n        with:\n          ref: \${{ github.event.deployment.sha }}\n          fetch-depth: 0\n      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - name: Validate native Vercel Production status and release\n        env:\n          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}\n        run: node scripts/github/release-production.mjs\n`;
fs.writeFileSync('.github/workflows/production-release.yml',prodWorkflow);

for(const f of ['docs/DELIVERY_GOVERNANCE.md','docs/AGENT_DELIVERY_RUNBOOK.md']){
 let s=fs.readFileSync(f,'utf8');
 s=s.replace(/`production-release\.yml` recherche le déploiement Vercel Production du SHA mergé et n’émet une Release que si son état final est `READY`\./,'`production-release.yml` consomme le `deployment_status` natif publié par `vercel[bot]` pour l’environnement `Production`; le statut GitHub `success` constitue la preuve native du Vercel `READY`.');
 s=s.replace(/- Secrets GitHub requis : `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`\.\n/,'- Aucun secret Vercel supplémentaire n’est requis pour la Release : la preuve utilise l’intégration GitHub/Vercel native.\n');
 fs.writeFileSync(f,s);
}

const qaNative=`import assert from 'node:assert/strict';
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
const release=fs.readFileSync('scripts/github/release-production.mjs','utf8'); assert.match(release,/state!==['\"]success/); assert.match(release,/Release already exists/i); assert.match(release,/vercel\[bot\]/);
const workflow=fs.readFileSync('.github/workflows/production-release.yml','utf8'); assert.match(workflow,/deployment_status/); assert.match(workflow,/environment == 'Production'/);
for(const file of ['.github/workflows/quality-gates.yml','.github/workflows/production-release.yml']){const content=fs.readFileSync(file,'utf8');assert.doesNotMatch(content,/ghp_[A-Za-z0-9]{20,}/);assert.doesNotMatch(content,/VERCEL_TOKEN:\s*[A-Za-z0-9_-]{20,}/);}
console.log('Delivery governance QA passed.');
`;
fs.writeFileSync('scripts/qa-delivery-governance.mjs',qaNative);

let syncCode=fs.readFileSync('scripts/github/sync-delivery-governance.mjs','utf8');
syncCode=syncCode.replace("const deliveryRuleset = rulesets.find((x) => x.name === 'DTSC Main Delivery Policy');","const deliveryRuleset = rulesets.find((x) => x.name === 'DTSC Main Delivery Policy');\nconst obsoleteRulesets = rulesets.filter((x) => x.name === 'Interdiction Force Push');");
syncCode=syncCode.replace("ruleset: deliveryRuleset ? { id: deliveryRuleset.id, enforcement: deliveryRuleset.enforcement } : null, requiredChecks: REQUIRED_CHECKS","ruleset: deliveryRuleset ? { id: deliveryRuleset.id, enforcement: deliveryRuleset.enforcement } : null, obsoleteRulesets: obsoleteRulesets.map((x)=>({id:x.id,name:x.name,enforcement:x.enforcement})), requiredChecks: REQUIRED_CHECKS");
syncCode=syncCode.replace("} catch (error) { console.error(`Ruleset administration blocked: ${error.message}`); if (!allowAdminBlock) process.exit(3); }\nconsole.log(`Governance sync complete; milestone #${ms.number}.`);","} catch (error) { console.error(`Ruleset administration blocked: ${error.message}`); if (!allowAdminBlock) process.exit(3); }\nfor (const old of obsoleteRulesets) { try { await req('DELETE', `/repos/${owner}/${name}/rulesets/${old.id}`); } catch (error) { console.error(`Obsolete ruleset cleanup blocked: ${error.message}`); if (!allowAdminBlock) process.exit(3); } }\nconsole.log(`Governance sync complete; milestone #${ms.number}.`);");
fs.writeFileSync('scripts/github/sync-delivery-governance.mjs',syncCode);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); Object.assign(pkg.scripts,{
 'delivery:governance:check':'node scripts/github/sync-delivery-governance.mjs',
 'delivery:governance:sync':'node scripts/github/sync-delivery-governance.mjs',
 'delivery:pr:validate':'node scripts/github/validate-pr-governance.mjs',
 'delivery:commits:validate':'node scripts/github/validate-commits.mjs',
 'qa:delivery-governance':'node scripts/qa-delivery-governance.mjs'}); fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');

function appendOnce(file,marker,text){let s=fs.readFileSync(file,'utf8');if(!s.includes(marker))fs.writeFileSync(file,s.replace(/\s*$/,'')+'\n\n'+text.trim()+'\n')}
appendOnce('AGENTS.md','## DTSC DELIVERY GOVERNANCE',`## DTSC DELIVERY GOVERNANCE\n\nPour tout changement matériel :\n1. partir du dernier \`origin/main\` vérifié ;\n2. Issue obligatoire avec labels structurés ;\n3. milestone obligatoire pour impact matériel ;\n4. branche dédiée liée à l’Issue ;\n5. Conventional Commits ;\n6. PR liée à l’Issue ;\n7. Delivery governance + Quality + Migration vertes ;\n8. Review réelle et conversations résolues ;\n9. merge uniquement après validation, normalement par squash ;\n10. Production uniquement depuis \`main\` ;\n11. GitHub Release uniquement après Production Vercel READY prouvée par le statut de déploiement natif.\n\n**Un commit n’est pas une livraison. Une PR mergée n’est pas encore une livraison Production. Une livraison DTSC n’est considérée réussie que lorsque son SHA a passé les contrôles requis, a été mergé dans \"main\", déployé avec succès sur Vercel Production et enregistré dans une GitHub Release traçable.**`);
appendOnce('docs/TECHNICAL_DOCUMENTATION.md','## Delivery Governance v1',`## Delivery Governance v1\n\nLe workflow officiel est défini dans \`docs/DELIVERY_GOVERNANCE.md\`. Les agents suivent \`docs/AGENT_DELIVERY_RUNBOOK.md\`; le rapport du vendredi suit \`docs/WEEKLY_DELIVERY_REPORT_CONTRACT.md\`. Les checks canoniques requis sont \`Delivery governance\`, \`Quality\` et \`Migration\`. Vercel publie nativement le statut \`Production\` sur GitHub ; seule sa réussite autorise la GitHub Release.`);

execFileSync('node',['scripts/github/sync-delivery-governance.mjs','--apply','--allow-admin-block'],{stdio:'inherit',env:{...process.env,GH_TOKEN:process.env.GITHUB_TOKEN||''}});
const ghToken=process.env.GITHUB_TOKEN; const repo=process.env.GITHUB_REPOSITORY; async function api(method,path,body){const r=await fetch(`https://api.github.com/repos/${repo}${path}`,{method,headers:{accept:'application/vnd.github+json',authorization:`Bearer ${ghToken}`,'x-github-api-version':'2022-11-28','content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);return r.status===204?null:r.json()}
try{const ms=await api('GET','/milestones?state=all&per_page=100');const m=ms.find(x=>x.title==='Delivery Governance v1');if(m)await api('PATCH','/issues/120',{milestone:m.number,labels:['type:chore','priority:P1','delivery-impact:high','area:infra-ci','status:needs-review']});}catch(e){console.error('Issue metadata sync failed:',e.message)}

fs.rmSync('.github/workflows/iteration-08-quality-gates.yml',{force:true}); fs.rmSync('.github/workflows/vercel-production.yml',{force:true});
fs.rmSync('.github/workflows/delivery-governance-bootstrap.yml',{force:true}); fs.rmSync(payload,{force:true}); fs.rmSync('scripts/github/bootstrap-delivery-governance.mjs',{force:true});
console.log('Delivery Governance payload materialized.');
