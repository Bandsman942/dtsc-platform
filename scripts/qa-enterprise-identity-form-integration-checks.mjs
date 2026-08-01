import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const files = [
  "components/enterprise/professional/enterprise-customers-workspace.tsx",
  "components/enterprise/professional/enterprise-crm-workspace.tsx",
  "components/enterprise/core-v2/enterprise-suppliers-workspace.tsx",
  "components/enterprise/professional/enterprise-employees-identity-workspace.tsx",
];

for (const file of files) {
  const content = read(file);
  if (!content.includes("EnterpriseIdentityLinkChoice")) failures.push(`${file}: choix identité absent`);
  if (content.includes('name="positionCode"')) failures.push(`${file}: code technique encore saisi librement`);
}

const admin = read("components/enterprise/identity-links/enterprise-identity-admin-panel.tsx");
for (const marker of ["Rechercher une fiche", "Créer une nouvelle fiche", "supplierContactId", "employeeId"]) {
  if (!admin.includes(marker)) failures.push(`Sélecteur approbation: ${marker}`);
}

const notificationAccess = read("lib/notification-access.ts");
for (const marker of ["GLOBAL_ACCOUNT_NOTIFICATION_TYPES", "ENTERPRISE_IDENTITY"]) {
  if (!notificationAccess.includes(marker)) failures.push(`Notification globale identité: ${marker}`);
}

const registry = read("lib/enterprise/module-registry-common-domains.json");
for (const marker of ["IDENTITY_CONSENTS", "Identités & consentements", "/enterprise-identity-admin", "ADMIN_ONLY"]) {
  if (!registry.includes(marker)) failures.push(`Registre identité: ${marker}`);
}

const access = read("lib/enterprise/module-access.ts");
for (const marker of ['definition.accessPolicy === "ADMIN_ONLY"', "listEnterpriseModuleDefinitions", "candidateCodes"]) {
  if (!access.includes(marker)) failures.push(`Navigation identité: ${marker}`);
}

const dtscAdmin = read("app/admin/page.tsx");
for (const marker of ["Maturité ERP", "/admin/erp-readiness", "erpReadiness"]) {
  if (!dtscAdmin.includes(marker)) failures.push(`Administration DTSC: ${marker}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ Intégration identité vérifiée : formulaires, notification globale, navigation ERP et registre de maturité DTSC.");
