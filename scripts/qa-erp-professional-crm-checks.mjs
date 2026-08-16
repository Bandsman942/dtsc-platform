import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const failures = [];
const need = (file, marker) => {
  const content = read(file);
  if (!content.includes(marker)) failures.push(`${file}: ${marker}`);
};

const crmFile = "components/enterprise/professional/enterprise-crm-workspace.tsx";
const crm = read(crmFile);
const fr = JSON.parse(read("locales/professional-erp.fr.json"));
const en = JSON.parse(read("locales/professional-erp.en.json"));

for (const [key, frValue, enValue] of [
  ["crm.pipelineTitle", "Pipeline commercial", "Commercial pipeline"],
  ["crm.nextActionField", "Prochaine action", "Next action"],
  ["crm.recordDecisionDescription", "Aucune fusion automatique n’est effectuée. Comparez les fiches candidates puis choisissez explicitement.", "No automatic merge is performed. Compare candidate records, then choose explicitly."],
]) {
  if (!crm.includes(`t(\"${key}\"`)) failures.push(`${crmFile}: clé i18n absente ${key}`);
  if (fr[key] !== frValue) failures.push(`locales/professional-erp.fr.json: ${key}`);
  if (en[key] !== enValue) failures.push(`locales/professional-erp.en.json: ${key}`);
}

for (const marker of ["createNewParty", "businessPartyId"]) {
  if (!crm.includes(marker)) failures.push(`${crmFile}: ${marker}`);
}
for (const marker of ["listEnterpriseLeadDuplicateCandidates", "LEAD_DUPLICATE_PARTY_REQUIRES_SELECTION", "createNewParty", "enterpriseBusinessPartyRole.upsert"]) need("lib/enterprise/crm-sales/leads.ts", marker);
for (const marker of ["opportunityTransitionSchema", "nextAction", "nextActionAt"]) need("lib/enterprise/crm-sales/schemas.ts", marker);
need("app/api/enterprise/[organizationId]/opportunities/[opportunityId]/transition/route.ts", "transitionEnterpriseOpportunity");

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ CRM professionnel vérifié : catalogue FR/EN, pipeline, prochaines actions, transitions et conversion explicite.");
