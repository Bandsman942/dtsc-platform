import process from 'node:process';
const EXPECTED_LABELS = [["type:bug","d73a4a","Defect or regression"],["type:feature","0e8a16","New user or business capability"],["type:refactor","5319e7","Internal refactor without intended behavior change"],["type:chore","6a737d","Maintenance, tooling or governance work"],["type:docs","0075ca","Documentation-only change"],["type:security","b60205","Security change or incident"],["priority:P0","b60205","Production unavailable, critical security, corruption or data loss"],["priority:P1","d93f0b","Strong delivery blocker or critical functionality unusable"],["priority:P2","fbca04","Important but non-blocking"],["priority:P3","0e8a16","Improvement or low delivery impact"],["delivery-impact:high","b60205","High material delivery impact"],["delivery-impact:medium","d93f0b","Medium material delivery impact"],["delivery-impact:low","0e8a16","Low material delivery impact"],["status:blocked","b60205","Blocked by a dependency, incident or failed gate"],["status:needs-review","5319e7","Ready for human or agent review"],["status:ready-for-release","006b75","Merged/validated and awaiting production release"],["area:platform","1d76db","Core platform"],["area:infra-ci","1d76db","Infrastructure, CI/CD and delivery"],["area:auth","1d76db","Authentication, session and authorization"],["area:erp","1d76db","Common ERP"],["area:finance","1d76db","Finance and accounting"],["area:pharmacy","1d76db","Pharmacy sector"],["area:health","1d76db","Health sector"],["area:collaboration","1d76db","Collaboration and communications"],["area:mobile","1d76db","Mobile and responsive experience"],["area:ai","1d76db","AI and assistant"],["area:support","1d76db","Support"],["area:public-account","1d76db","Public site and account surfaces"]];
const REQUIRED_CHECKS = ['Delivery governance', 'Quality', 'Migration'];
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const allowAdminBlock = args.has('--allow-admin-block');
const repoArg = process.argv.find((x) => x.startsWith('--repo='))?.slice(7);
const repo = repoArg || process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
if (!repo || !repo.includes('/')) { console.error('Repository required via GITHUB_REPOSITORY or --repo=owner/name'); process.exit(2); }
const [owner, name] = repo.split('/');
async function req(method, endpoint, body) {
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`https://api.github.com${endpoint}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) { const e = new Error(`${method} ${endpoint} -> ${res.status}: ${data?.message || res.statusText}`); e.status = res.status; throw e; }
  return data;
}
const labels = await req('GET', `/repos/${owner}/${name}/labels?per_page=100`);
const labelMap = new Map(labels.map((x) => [x.name, x]));
const missing = EXPECTED_LABELS.filter(([n]) => !labelMap.has(n));
const drift = EXPECTED_LABELS.filter(([n,c,d]) => { const x = labelMap.get(n); return x && (x.color?.toLowerCase() !== c || x.description !== d); });
const milestones = await req('GET', `/repos/${owner}/${name}/milestones?state=all&per_page=100`);
const milestone = milestones.find((x) => x.title === 'Delivery Governance v1');
const rulesets = await req('GET', `/repos/${owner}/${name}/rulesets`).catch(() => []);
const deliveryRuleset = rulesets.find((x) => x.name === 'DTSC Main Delivery Policy');
const obsoleteRulesets = rulesets.filter((x) => x.name === 'Interdiction Force Push');
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', missingLabels: missing.map(([n]) => n), driftLabels: drift.map(([n]) => n), milestone: milestone?.number || null, ruleset: deliveryRuleset ? { id: deliveryRuleset.id, enforcement: deliveryRuleset.enforcement } : null, obsoleteRulesets: obsoleteRulesets.map((x)=>({id:x.id,name:x.name,enforcement:x.enforcement})), requiredChecks: REQUIRED_CHECKS }, null, 2));
if (!apply) process.exit(0);
if (!token) { console.error('Write mode requires GH_TOKEN or GITHUB_TOKEN.'); process.exit(2); }
for (const [n,c,d] of missing) await req('POST', `/repos/${owner}/${name}/labels`, { name:n, color:c, description:d });
for (const [n,c,d] of drift) await req('PATCH', `/repos/${owner}/${name}/labels/${encodeURIComponent(n)}`, { color:c, description:d });
let ms = milestone; if (!ms) ms = await req('POST', `/repos/${owner}/${name}/milestones`, { title:'Delivery Governance v1', description:'Workflow officiel DTSC Delivery Governance v1.' });
const rulesetBody = { name:'DTSC Main Delivery Policy', target:'branch', enforcement:'active', conditions:{ref_name:{include:['~DEFAULT_BRANCH'],exclude:[]}}, bypass_actors:[], rules:[{type:'deletion'},{type:'non_fast_forward'},{type:'pull_request',parameters:{allowed_merge_methods:['squash'],dismiss_stale_reviews_on_push:false,require_code_owner_review:false,require_last_push_approval:false,required_approving_review_count:0,required_review_thread_resolution:true}},{type:'required_status_checks',parameters:{do_not_enforce_on_create:true,strict_required_status_checks_policy:true,required_status_checks:REQUIRED_CHECKS.map((context)=>({context}))}}] };
try { if (deliveryRuleset) await req('PUT', `/repos/${owner}/${name}/rulesets/${deliveryRuleset.id}`, rulesetBody); else await req('POST', `/repos/${owner}/${name}/rulesets`, rulesetBody); } catch (error) { console.error(`Ruleset administration blocked: ${error.message}`); if (!allowAdminBlock) process.exit(3); }
for (const old of obsoleteRulesets) { try { await req('DELETE', `/repos/${owner}/${name}/rulesets/${old.id}`); } catch (error) { console.error(`Obsolete ruleset cleanup blocked: ${error.message}`); if (!allowAdminBlock) process.exit(3); } }
console.log(`Governance sync complete; milestone #${ms.number}.`);
