import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Fichier absent: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function requireText(relativePath, needles) {
  const content = read(relativePath);
  for (const needle of needles) {
    if (!content.includes(needle)) failures.push(`${relativePath}: contrat absent: ${needle}`);
  }
}

function forbidText(relativePath, needles) {
  const content = read(relativePath);
  for (const needle of needles) {
    if (content.includes(needle)) failures.push(`${relativePath}: motif régressif présent: ${needle}`);
  }
}

const objectTypes = [
  "CALENDAR_EVENT",
  "TASK",
  "OPERATION",
  "DEPARTMENT_REQUEST",
  "BLOCKER",
  "MEETING",
  "COLLAB_REQUEST",
  "CEO_OBJECTIVE",
  "CEO_SUPERVISION",
  "SCO_PURCHASE_REQUEST",
  "SCO_LOGISTICS",
  "MPO_PROJECT",
  "MPO_RECORD",
  "CTO_PROJECT",
  "CTO_RECORD",
];

const reference = read("lib/operational-sla-reference.ts");
const access = read("lib/operational-access.ts");
for (const objectType of objectTypes) {
  if (!reference.includes(`${objectType}: {`)) failures.push(`Référentiel SLA absent pour ${objectType}`);
  if (!access.includes(`"${objectType}"`)) failures.push(`Le référentiel SLA contient ${objectType} mais operational-access ne le reconnaît pas.`);
}

requireText("lib/operational-sla-reference.ts", [
  "OPERATIONAL_SLA_OBJECT_TYPES",
  "priorityField: \"severity\"",
  "priorityField: \"urgency\"",
  'statuses: ["Planifié", "En cours", "Terminé", "Reporté", "Annulé"]',
  'statuses: ["TODO", "IN_PROGRESS", "PENDING_VALIDATION", "COMPLETED", "VALIDATED"',
]);

requireText("app/api/operations/sla/route.ts", [
  "getOperationalSlaReference(data.objectType)",
  "reference.priorities.includes(data.priority)",
  "reference.statuses.includes(data.startStatus)",
  "reference.statuses.includes(status)",
  "targetObjectType",
  "listOperationalSlaTargets",
  "SLA_POLICY_PRIORITY_MISMATCH",
  "SLA_POLICY_START_STATUS_MISMATCH",
  "SLA_POLICY_STOP_STATUS_REACHED",
]);

requireText("lib/operational-sla.ts", [
  "matchOperationalSlaPolicy",
  "resolveOperationalSlaPolicyFilters",
  "SLA_POLICY_PRIORITY_MISMATCH",
  "SLA_POLICY_START_STATUS_MISMATCH",
  "SLA_POLICY_STOP_STATUS_REACHED",
  'status: "COMPLETED", completedAt: now, lastEvaluatedAt: now',
  "loadOperationalSlaStateMap",
  "resolveOperationalObjectAccess",
  "listOperationalSlaTargets",
]);

requireText("components/admin/operational-sla-panel.tsx", [
  'name="priority"',
  'name="startStatus"',
  'name="stopStatuses"',
  "OPERATIONAL_SLA_OBJECT_TYPES",
  "useAppLocale",
  "getOperationalSlaAdminCopy",
  "formatEnumLabelForLocale",
  "copy.binding.title",
  "copy.binding.noMatch",
  "copy.binding.reference",
]);
forbidText("components/admin/operational-sla-panel.tsx", [
  '<Input name="priority"',
  '<Input name="startStatus"',
  '<Input name="stopStatuses"',
  "Les anciens filtres libres de priorité et de statut ont été retirés",
  ">Démarrer un suivi<",
]);

requireText("lib/operational-sla-i18n.ts", [
  "getOperationalSlaAdminCopy",
  'title: "Démarrer un suivi"',
  'title: "Start tracking"',
  "Aucune règle active ne correspond actuellement",
  "No active rule currently matches",
  "Les filtres historiques non reconnus restent lisibles",
  "Unrecognized historical filters remain readable",
  'CALENDAR_EVENT: "Événement calendrier"',
  'CALENDAR_EVENT: "Calendar event"',
]);

requireText("docs/MANUAL_E2E_OPERATIONAL_SLA_469.md", [
  "TASK",
  "OPERATION",
  "DEPARTMENT_REQUEST",
  "OWNER_E2E",
  "NON EXÉCUTÉ",
]);

if (failures.length) {
  console.error("Échec QA filtres SLA opérationnels");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("QA filtres SLA opérationnels réussie.");
