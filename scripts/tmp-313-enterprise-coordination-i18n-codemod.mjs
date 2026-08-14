import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const frPath = path.join(root, "locales/enterprise-core.fr.json");
const enPath = path.join(root, "locales/enterprise-core.en.json");
const fr = JSON.parse(fs.readFileSync(frPath, "utf8"));
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));

const targets = [
  ["components/enterprise/core-v2/enterprise-meetings-workspace.tsx", "meetings"],
  ["components/enterprise/core-v2/meeting-form.tsx", "meetings.form"],
  ["components/enterprise/core-v2/meeting-coordination-panel.tsx", "meetings.coordination"],
  ["components/enterprise/core-v2/enterprise-requests-workspace.tsx", "requests"],
  ["components/enterprise/core-v2/request-form.tsx", "requests.form"],
  ["components/enterprise/core-v2/request-coordination-panel.tsx", "requests.coordination"],
  ["components/enterprise/core-v2/enterprise-approvals-workspace.tsx", "approvals"],
  ["components/enterprise/core-v2/approval-coordination-panel.tsx", "approvals.coordination"],
];

const explicit = {
  "status.TRIAGED": ["Triaged", "Triée"],
  "status.ASSIGNED": ["Assigned", "Assignée"],
  "status.WAITING_REQUESTER": ["Waiting for requester", "En attente du demandeur"],
  "status.WAITING_APPROVAL": ["Waiting for approval", "En attente de validation"],
  "status.CORRECTION_REQUESTED": ["Correction requested", "Correction demandée"],
  "status.REOPENED": ["Reopened", "Rouverte"],
  "status.DISCUSSED": ["Discussed", "Discuté"],
  "status.DEFERRED": ["Deferred", "Reporté"],
  "status.PUBLISHED": ["Published", "Publié"],
  "meeting.locationMode.ONLINE": ["Online", "En ligne"],
  "meeting.locationMode.PHYSICAL": ["In person", "Présentiel"],
  "meeting.locationMode.HYBRID": ["Hybrid", "Hybride"],
  "approval.decision.APPROVE": ["Approve", "Approuver"],
  "approval.decision.REJECT": ["Reject", "Rejeter"],
  "request.action.REQUEST_INFORMATION": ["Request information", "Demander des informations"],
  "request.action.RESPOND": ["Respond", "Répondre"],
  "request.action.RESOLVE": ["Resolve", "Résoudre"],
  "request.action.CLOSE": ["Close", "Clôturer"],
  "request.action.REOPEN": ["Reopen", "Rouvrir"],
  "approval.action.REQUEST_CORRECTION": ["Request correction", "Demander une correction"],
  "approval.action.RESUBMIT": ["Resubmit correction", "Soumettre à nouveau"],
  "approval.action.DELEGATE": ["Delegate", "Déléguer"],
};
for (const [key, [enValue, frValue]] of Object.entries(explicit)) {
  en[key] ??= enValue;
  fr[key] ??= frValue;
}

const reverse = new Map();
for (const key of Object.keys(en)) {
  if (typeof en[key] === "string" && typeof fr[key] === "string") reverse.set(`${en[key]}\u0000${fr[key]}`, key);
}

function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\{\{[^}]+\}\}/g, "value")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .split(".")
    .filter(Boolean)
    .slice(0, 8)
    .join(".") || "copy";
}

function keyFor(namespace, enValue, frValue) {
  const pair = `${enValue}\u0000${frValue}`;
  const existing = reverse.get(pair);
  if (existing) return existing;
  const base = `${namespace}.${slug(enValue)}`;
  let key = base;
  let index = 2;
  while ((en[key] && en[key] !== enValue) || (fr[key] && fr[key] !== frValue)) key = `${base}.${index++}`;
  en[key] = enValue;
  fr[key] = frValue;
  reverse.set(pair, key);
  return key;
}

function decodeDouble(raw) {
  return JSON.parse(`"${raw}"`);
}

function ensureImport(source, statement, marker) {
  if (source.includes(marker)) return source;
  if (source.startsWith('"use client";')) return source.replace('"use client";\n', `"use client";\n\n${statement}\n`);
  return `${statement}\n${source}`;
}

function replaceCopyPairs(source, namespace) {
  const patterns = [
    /locale\s*===\s*"en"\s*\?\s*"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"/g,
    /\ben\s*\?\s*"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"/g,
  ];
  for (const pattern of patterns) {
    source = source.replace(pattern, (_match, enRaw, frRaw) => {
      const enValue = decodeDouble(enRaw);
      const frValue = decodeDouble(frRaw);
      const key = keyFor(namespace, enValue, frValue);
      return `enterpriseCoreT(locale, ${JSON.stringify(key)})`;
    });
  }
  const templatePatterns = [
    /locale\s*===\s*"en"\s*\?\s*`([^`$]*)`\s*:\s*`([^`$]*)`/g,
    /\ben\s*\?\s*`([^`$]*)`\s*:\s*`([^`$]*)`/g,
  ];
  for (const pattern of templatePatterns) {
    source = source.replace(pattern, (_match, enValue, frValue) => {
      const key = keyFor(namespace, enValue, frValue);
      return `enterpriseCoreT(locale, ${JSON.stringify(key)})`;
    });
  }
  return source;
}

for (const [relative, namespace] of targets) {
  const file = path.join(root, relative);
  let source = fs.readFileSync(file, "utf8");
  const before = source;

  source = replaceCopyPairs(source, namespace);

  source = source
    .replace(/(?:locale\s*===\s*"en"|\ben)\s*\?\s*priorityChoicesEn\s*:\s*priorityChoicesFr/g, "corePriorityChoices(locale)")
    .replace(/new Date\(([^\n()]+)\)\.toLocaleString\((?:locale\s*===\s*"en"|en)\s*\?\s*"en-GB"\s*:\s*"fr-FR"\)/g, "coreFormatEnterpriseDate($1, locale)")
    .replace(/<option value="ONLINE">ONLINE<\/option>/g, '<option value="ONLINE">{enterpriseCoreT(locale, "meeting.locationMode.ONLINE")}</option>')
    .replace(/<option value="PHYSICAL">PHYSICAL<\/option>/g, '<option value="PHYSICAL">{enterpriseCoreT(locale, "meeting.locationMode.PHYSICAL")}</option>')
    .replace(/<option value="HYBRID">HYBRID<\/option>/g, '<option value="HYBRID">{enterpriseCoreT(locale, "meeting.locationMode.HYBRID")}</option>');

  source = source.replace(/(<StatusBadge[^>]*>)\{([A-Za-z_$][A-Za-z0-9_$?.]*(?:\.[A-Za-z_$][A-Za-z0-9_$?]*)*\.status)\}(<\/StatusBadge>)/g, "$1{coreStatusLabel(locale, $2)}$3");

  if (source.includes("enterpriseCoreT(")) {
    source = ensureImport(source, 'import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";', "enterpriseCoreT } from \"@/lib/enterprise-core-i18n\"");
  }
  const needsUiHelpers = source.includes("corePriorityChoices(") || source.includes("coreFormatEnterpriseDate(") || source.includes("coreStatusLabel(");
  if (needsUiHelpers) {
    source = ensureImport(
      source,
      'import { formatEnterpriseDate as coreFormatEnterpriseDate, priorityChoices as corePriorityChoices, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";',
      "coreFormatEnterpriseDate, priorityChoices as corePriorityChoices, statusLabel as coreStatusLabel",
    );
  }

  const withoutEnDeclaration = source.replace(/\n\s*const en = locale === "en";\n/g, "\n");
  if (!/\ben\b/.test(withoutEnDeclaration.replace(/from "@\/[^\n]+/g, ""))) source = withoutEnDeclaration;

  if (source !== before) fs.writeFileSync(file, source);
}

fs.writeFileSync(frPath, `${JSON.stringify(fr, null, 2)}\n`);
fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);

for (const [relative] of targets) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const localPairs = (source.match(/(?:locale\s*===\s*"en"|\ben)\s*\?\s*["`]/g) || []).length;
  console.log(`${relative}: remaining direct copy pairs=${localPairs}`);
}
