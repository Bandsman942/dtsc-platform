import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

const i18n = read("lib/i18n.ts");
const helper = read("lib/enterprise-core-i18n.ts");
const ui = read("components/enterprise/core-v2/erp-v2-ui.tsx");
const tasks = read("components/enterprise/core-v2/enterprise-tasks-workspace.tsx");
const form = read("components/enterprise/core-v2/task-form.tsx");
const coordination = read("components/enterprise/core-v2/task-coordination-panel.tsx");
const fr = JSON.parse(read("locales/enterprise-core.fr.json"));
const en = JSON.parse(read("locales/enterprise-core.en.json"));

const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
expect(JSON.stringify(frKeys) === JSON.stringify(enKeys), "#292: parité de clés enterprise-core FR/EN rompue");
for (const key of frKeys) {
  expect(typeof fr[key] === "string" && fr[key].length > 0, `#292: traduction FR vide/non textuelle: ${key}`);
  expect(typeof en[key] === "string" && en[key].length > 0, `#292: traduction EN vide/non textuelle: ${key}`);
}

for (const required of [
  "status.TODO",
  "status.IN_PROGRESS",
  "status.BLOCKED",
  "status.OPEN",
  "status.RESOLVED",
  "priority.LOW",
  "priority.NORMAL",
  "tasks.sectionTitle",
  "tasks.form.create",
  "tasks.coordination.unableLoad",
]) expect(frKeys.includes(required), `#292: clé canonique manquante: ${required}`);

expect(i18n.includes('enterpriseCoreFr from "@/locales/enterprise-core.fr.json"'), "#292: catalogue Enterprise Core FR non enregistré dans lib/i18n.ts");
expect(i18n.includes('enterpriseCoreEn from "@/locales/enterprise-core.en.json"'), "#292: catalogue Enterprise Core EN non enregistré dans lib/i18n.ts");
expect(i18n.includes("translateEnterpriseCore"), "#292: translateEnterpriseCore absent du moteur canonique");
expect(helper.includes("enterpriseCoreT") && helper.includes("translateEnterpriseCore"), "#292: helper Enterprise Core non raccordé au moteur canonique");
expect(helper.includes("enterpriseCoreIntlLocale"), "#292: helper de locale Intl Enterprise Core absent");

for (const forbidden of ["const FR_STATUS", "const EN_STATUS", "const FR_PRIORITY", "const EN_PRIORITY", 'locale === "en" ? "Not specified"', 'locale === "en" ? "en-US"']) {
  expect(!ui.includes(forbidden), `#292: dette locale résiduelle dans erp-v2-ui: ${forbidden}`);
}
expect(ui.includes("enterpriseCoreT") && ui.includes("enterpriseCoreIntlLocale"), "#292: primitives ERP v2 non canoniques");

for (const [path, source] of [
  ["enterprise-tasks-workspace.tsx", tasks],
  ["task-form.tsx", form],
  ["task-coordination-panel.tsx", coordination],
]) {
  expect(!source.includes('const en = locale === "en"'), `#292: drapeau locale local résiduel dans ${path}`);
  expect(!/\ben\s*\?\s*["']/.test(source), `#292: ternaire FR/EN local résiduel dans ${path}`);
  expect(source.includes("enterpriseCoreT"), `#292: helper canonique absent dans ${path}`);
}

for (const forbidden of [
  "Task created.",
  "Tâche créée.",
  "Tasks & operations",
  "Tâches & opérations",
  "Search tasks…",
  "Rechercher une tâche…",
  "Confirm action",
  "Confirmer l’action",
]) expect(!tasks.includes(forbidden), `#292: copie locale résiduelle dans Tasks: ${forbidden}`);

for (const forbidden of ["Create task", "Créer la tâche", "Due date", "Assigné à"]) {
  expect(!form.includes(forbidden), `#292: copie locale résiduelle dans Task form: ${forbidden}`);
}

for (const forbidden of ["Unable to load task coordination.", "Impossible de charger la coordination de la tâche.", "Loading coordination…", "Chargement de la coordination…", ">{blocker.status}</StatusBadge>"]) {
  expect(!coordination.includes(forbidden), `#292: copie/statut brut résiduel dans Task coordination: ${forbidden}`);
}
expect(coordination.includes("statusLabel(locale, blocker.status)"), "#292: statut de blocage non projeté via label canonique");

for (const marker of [
  "/api/enterprise/${organizationId}/tasks",
  "revision: edit.revision",
  "revision: pendingAction.task.revision",
  "action: pendingAction.action",
  "deepLinkedTaskId",
  "collection.meta.currentUserId",
]) expect(tasks.includes(marker), `#292: invariant Tasks absent: ${marker}`);

for (const marker of [
  "/api/enterprise/${organizationId}/tasks/${taskId}/coordination",
  'action: "ADD_CHECKLIST"',
  'action: "ADD_DEPENDENCY"',
  'action: "ADD_BLOCKER"',
  'action: "RESOLVE_BLOCKER"',
  "body.capabilities?.canUpdate",
]) expect(coordination.includes(marker), `#292: invariant coordination absent: ${marker}`);

if (failures.length) {
  console.error(`Enterprise Core i18n #292 QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Enterprise Core i18n #292 QA passed.");
