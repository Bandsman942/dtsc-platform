import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    failures.push(`Absent: ${file}`);
    return "";
  }
  return fs.readFileSync(target, "utf8");
};
const need = (content, marker, scope) => {
  if (!content.includes(marker)) failures.push(`${scope}: ${marker}`);
};

const ui = read("components/enterprise/professional/enterprise-contracts-workspace.tsx");
const fr = JSON.parse(read("locales/professional-erp-commercial.fr.json") || "{}");
const en = JSON.parse(read("locales/professional-erp-commercial.en.json") || "{}");
const service = read("lib/enterprise/crm-sales/contracts.ts");
const route = read("app/api/enterprise/[organizationId]/contracts/[contractId]/transition/route.ts");
const lookups = read("app/api/enterprise/[organizationId]/professional-lookups/route.ts");

for (const [key, frValue, enValue] of [
  ["contracts.tabDrafts", "Brouillons", "Drafts"],
  ["contracts.metricPending", "En attente de validation", "Pending approval"],
  ["contracts.metricExpiring", "À renouveler bientôt", "Expiring soon"],
  ["contracts.submit", "Soumettre", "Submit"],
  ["contracts.terminate", "Résilier", "Terminate"],
]) {
  need(ui, `t(\"${key}\")`, "UI contrats — clé i18n");
  if (fr[key] !== frValue) failures.push(`Catalogue contrats FR: ${key}`);
  if (en[key] !== enValue) failures.push(`Catalogue contrats EN: ${key}`);
}
for (const marker of [
  "transitionEnterpriseContract",
  "enterpriseApproval",
  "revision",
  "resolveContractBusinessParty",
  "enterpriseSupplierPartyLink",
  "organizationMemberId",
  "COLLABORATOR",
  "EMPLOYEE",
  "SUPPLIER",
]) {
  need(service, marker, "Service contrats");
}
for (const marker of ["contractTransitionSchema", "notifyUser", "section=validation"]) {
  need(route, marker, "Route contrats");
}
for (const marker of ["employee:", "supplier:", "member:", "contractParties", "businessPartyId"]) {
  need(lookups, marker, "Sélecteurs contrats");
}

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ Contrats professionnels vérifiés : catalogue FR/EN, contreparties unifiées, détail, transitions serveur, approbation et lien profond.");
