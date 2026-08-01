import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const dictionaryPath = "lib/enterprise/i18n/business-labels.ts";
const dictionary = read(dictionaryPath);
const pilotSurfaces = [
  "components/admin/erp-commercial-readiness-dashboard.tsx",
  "components/enterprise/identity-links/enterprise-identity-admin-panel.tsx",
  "components/enterprise/identity-links/enterprise-identity-user-panel.tsx",
];

const requiredKeys = [
  "contracts.pendingApproval",
  "inventory.valuation.weightedAverage",
  "finance.report.trialBalance",
  "finance.report.generalLedger",
  "finance.snapshot",
  "identity.status.invitationPending",
  "identity.status.organizationApprovalRequired",
  "identity.status.revoked",
  "errors.forbidden",
  "errors.invalidPayload",
  "errors.concurrentUpdate",
];
for (const key of requiredKeys) {
  if (!dictionary.includes(`\"${key}\"`)) failures.push(`Libellé contrôlé absent : ${key}`);
}
if (/replace\([^)]*[_-]/.test(dictionary) || /split\(["']_/.test(dictionary)) {
  failures.push("Le dictionnaire ne doit pas générer des libellés en transformant automatiquement des clés techniques.");
}

const visibleTechnicalPatterns = [
  />\s*DRAFT\s*</,
  />\s*PENDING_APPROVAL\s*</,
  />\s*WEIGHTED_AVERAGE\s*</,
  />\s*Trial balance\s*</i,
  />\s*General ledger\s*</i,
  />\s*snapshot\s*</i,
  /placeholder=["'][^"']*(PENDING_APPROVAL|WEIGHTED_AVERAGE|Trial balance|General ledger)[^"']*["']/i,
];

for (const surfacePath of pilotSurfaces) {
  const source = read(surfacePath);
  for (const pattern of visibleTechnicalPatterns) {
    if (pattern.test(source)) failures.push(`${surfacePath} expose un libellé technique dans une zone utilisateur : ${pattern}`);
  }
  if (surfacePath.includes("identity-links") && !/getEnterpriseIdentity(Status|Relation)Label/.test(source)) {
    failures.push(`${surfacePath} doit traduire les statuts et types via le dictionnaire contrôlé.`);
  }
  if (/\{\s*link\.status\s*\}/.test(source)) {
    failures.push(`${surfacePath} affiche directement un statut serveur.`);
  }
  if (/\{\s*link\.requestedRelationType\s*\}/.test(source)) {
    failures.push(`${surfacePath} affiche directement un type de relation serveur.`);
  }
}

const css = read("app/mobile-stability.css");
if (/h1,[\s\S]{0,400}overflow-wrap:\s*anywhere/.test(css)) {
  failures.push("La typographie générale ne doit pas appliquer overflow-wrap:anywhere aux titres et paragraphes.");
}
if (!css.includes("[data-responsive-long-token]")) {
  failures.push("La coupure agressive doit rester disponible pour les chaînes longues explicitement marquées.");
}

if (failures.length) {
  for (const failure of failures) console.error(`❌ ${failure}`);
  process.exit(1);
}
console.log("✅ Contrat i18n ERP vérifié : dictionnaire contrôlé, surfaces pilotes et typographie responsive.");
