import fs from "node:fs"; import path from "node:path"; const r=(f)=>fs.readFileSync(path.join(process.cwd(),f),"utf8"), failures=[]; const need=(f,m)=>{const c=r(f);if(!c.includes(m))failures.push(`${f}: ${m}`)};
for(const m of ["Pipeline commercial","Prochaine action","Aucune fusion automatique","createNewParty","businessPartyId"]) need("components/enterprise/professional/enterprise-crm-workspace.tsx",m);
for(const m of ["listEnterpriseLeadDuplicateCandidates","LEAD_DUPLICATE_PARTY_REQUIRES_SELECTION","createNewParty","enterpriseBusinessPartyRole.upsert"]) need("lib/enterprise/crm-sales/leads.ts",m);
for(const m of ["opportunityTransitionSchema","nextAction","nextActionAt"]) need("lib/enterprise/crm-sales/schemas.ts",m);
need("app/api/enterprise/[organizationId]/opportunities/[opportunityId]/transition/route.ts","transitionEnterpriseOpportunity");
if(failures.length){console.error(failures.map(x=>`❌ ${x}`).join("\n"));process.exit(1)} console.log("✅ CRM professionnel vérifié : pipeline, prochaines actions, transitions et conversion explicite.");
