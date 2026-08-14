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
const enterpriseCoreSurfaces = [
  "components/enterprise/core-v2/erp-v2-ui.tsx",
  "components/enterprise/core-v2/enterprise-tasks-workspace.tsx",
  "components/enterprise/core-v2/task-form.tsx",
  "components/enterprise/core-v2/task-coordination-panel.tsx",
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

const enterpriseCoreFr = JSON.parse(read("locales/enterprise-core.fr.json"));
const enterpriseCoreEn = JSON.parse(read("locales/enterprise-core.en.json"));
const enterpriseCoreFrKeys = Object.keys(enterpriseCoreFr).sort();
const enterpriseCoreEnKeys = Object.keys(enterpriseCoreEn).sort();
if (JSON.stringify(enterpriseCoreFrKeys) !== JSON.stringify(enterpriseCoreEnKeys)) {
  failures.push("Les catalogues Enterprise Core FR/EN doivent garder une parité stricte de clés.");
}
for (const key of ["status.TODO", "status.OPEN", "status.RESOLVED", "priority.NORMAL", "tasks.sectionTitle", "tasks.form.create", "tasks.coordination.unableLoad"]) {
  if (!enterpriseCoreFrKeys.includes(key)) failures.push(`Clé Enterprise Core absente : ${key}`);
}

const i18nEngine = read("lib/i18n.ts");
if (!i18nEngine.includes("translateEnterpriseCore") || !i18nEngine.includes("enterpriseCoreDictionaries")) {
  failures.push("Le catalogue Enterprise Core doit être enregistré dans le moteur canonique lib/i18n.ts.");
}

for (const surfacePath of enterpriseCoreSurfaces) {
  const source = read(surfacePath);
  if (!source.includes("enterpriseCoreT") && surfacePath !== "components/enterprise/core-v2/erp-v2-ui.tsx") {
    failures.push(`${surfacePath} doit utiliser le helper Enterprise Core canonique.`);
  }
  if (source.includes('const en = locale === "en"') || /\ben\s*\?\s*["']/.test(source)) {
    failures.push(`${surfacePath} contient encore un sélecteur FR/EN local pour la copie utilisateur.`);
  }
}

const erpV2Ui = read("components/enterprise/core-v2/erp-v2-ui.tsx");
for (const forbidden of ["const FR_STATUS", "const EN_STATUS", "const FR_PRIORITY", "const EN_PRIORITY"]) {
  if (erpV2Ui.includes(forbidden)) failures.push(`erp-v2-ui conserve un dictionnaire local interdit : ${forbidden}`);
}
if (!erpV2Ui.includes("enterpriseCoreIntlLocale") || !erpV2Ui.includes("enterpriseCoreT")) {
  failures.push("erp-v2-ui doit déléguer labels et formatage locale au helper Enterprise Core.");
}

const coordination = read("components/enterprise/core-v2/task-coordination-panel.tsx");
if (/\{\s*blocker\.status\s*\}/.test(coordination)) {
  failures.push("Task coordination affiche directement un statut de blocage serveur.");
}
if (!coordination.includes("statusLabel(locale, blocker.status)")) {
  failures.push("Task coordination doit projeter les statuts de blocage via statusLabel.");
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
console.log("✅ Contrat i18n ERP vérifié : dictionnaires contrôlés, Enterprise Core canonique, surfaces pilotes et typographie responsive.");
