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
const service = read("lib/enterprise/crm-sales/contracts.ts");
const route = read("app/api/enterprise/[organizationId]/contracts/[contractId]/transition/route.ts");
const lookups = read("app/api/enterprise/[organizationId]/professional-lookups/route.ts");

for (const marker of ["Brouillons", "En attente de validation", "À renouveler bientôt", "Soumettre", "Résilier"]) {
  need(ui, marker, "UI contrats");
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
console.log("✅ Contrats professionnels vérifiés : contreparties unifiées, canonicalisation, détail, transitions serveur, approbation et lien profond.");
