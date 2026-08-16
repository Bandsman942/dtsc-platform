import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    failures.push(`Fichier introuvable: ${file}`);
    return "";
  }
  return fs.readFileSync(target, "utf8");
};
const need = (content, marker, scope) => {
  if (!content.includes(marker)) failures.push(`${scope}: contrat absent: ${marker}`);
};
const reject = (content, marker, scope) => {
  if (content.includes(marker)) failures.push(`${scope}: contrat interdit: ${marker}`);
};

const catalogFrFile = "locales/professional-erp-operations.fr.json";
const catalogEnFile = "locales/professional-erp-operations.en.json";
const frSource = read(catalogFrFile);
const enSource = read(catalogEnFile);
let fr = {};
let en = {};
try { fr = JSON.parse(frSource); } catch { failures.push(`${catalogFrFile}: JSON invalide`); }
try { en = JSON.parse(enSource); } catch { failures.push(`${catalogEnFile}: JSON invalide`); }

const frKeys = Object.keys(fr).sort();
const enKeys = Object.keys(en).sort();
if (JSON.stringify(frKeys) !== JSON.stringify(enKeys)) {
  const onlyFr = frKeys.filter((key) => !enKeys.includes(key));
  const onlyEn = enKeys.filter((key) => !frKeys.includes(key));
  failures.push(`Parité FR/EN: seulement FR=${onlyFr.join(",") || "∅"}; seulement EN=${onlyEn.join(",") || "∅"}`);
}

for (const key of [
  "inventoryStatus.PENDING_APPROVAL", "countType.FULL", "adjustmentType.IN",
  "siteType.HEADQUARTERS", "warehouseType.GENERAL", "locationType.STORAGE",
  "projectStatus.CHANGES_REQUESTED", "projectType.CLIENT", "projectRole.MEMBER", "riskLevel.CRITICAL",
  "assetStatus.MAINTENANCE", "assetCondition.GOOD", "maintenanceType.PREVENTIVE", "priority.NORMAL",
  "inventory.title", "sites.title", "projects.titleProjects", "assets.title",
]) {
  if (!(key in fr)) failures.push(`Catalogue FR: clé manquante ${key}`);
  if (!(key in en)) failures.push(`Catalogue EN: clé manquante ${key}`);
}

const files = {
  inventory: read("components/enterprise/professional/enterprise-inventory-operations-workspace.tsx"),
  sites: read("components/enterprise/professional/enterprise-sites-workspace.tsx"),
  projects: read("components/enterprise/professional/enterprise-projects-deliverables-workspace.tsx"),
  assets: read("components/enterprise/professional/enterprise-assets-maintenance-workspace.tsx"),
  helper: read("components/enterprise/professional/professional-erp-i18n.ts"),
  i18n: read("lib/i18n.ts"),
  runner: read("scripts/run-regression-qa-ci.mjs"),
};

for (const [scope, content] of Object.entries({ inventory: files.inventory, sites: files.sites, projects: files.projects, assets: files.assets })) {
  need(content, "useProfessionalErpLocale", scope);
  need(content, "professionalErpT", scope);
  reject(content, 'toLocaleDateString("fr-FR")', scope);
  reject(content, 'Intl.NumberFormat("fr-FR")', scope);
  reject(content, "const STATUS_LABELS", scope);
  reject(content, "const INVENTORY_STATUS_LABELS", scope);
  reject(content, "const CONDITION_LABELS", scope);
}

need(files.i18n, "professionalErpOperationsFr", "registre i18n");
need(files.i18n, "professionalErpOperationsEn", "registre i18n");
need(files.helper, '"inventoryStatus"', "helper enum stock");
need(files.helper, '"projectStatus"', "helper enum projets");
need(files.helper, '"assetStatus"', "helper enum actifs");
need(files.helper, "professionalErpNumber", "helper format nombre");

for (const marker of [
  "/stock-transfers", "/inventory-counts", "/stock-adjustments",
  "idempotencyKey: crypto.randomUUID()", 'decision: "APPROVE" | "REJECT"', "{ decision, revision: entity.revision }",
]) need(files.inventory, marker, "stock — invariants");

for (const marker of [
  "/sites", "/warehouses", "/storage-locations", '"PATCH"', "revision: edit.revision", "<details",
]) need(files.sites, marker, "sites — invariants");

for (const marker of [
  "/projects", "/deliverables/", '"SUBMIT"', '"ACCEPT"', '"REQUEST_CHANGES"', '"REJECT"',
  "revision: deliverable.revision", 'role: "MEMBER"', "allocationPercent: 100",
]) need(files.projects, marker, "projets — invariants");

for (const marker of [
  "/assets", "/assignments", "/asset-assignments/", "/maintenance", "/incidents", "/asset-maintenance/", "/asset-incidents/",
  '"START"', '"COMPLETE"', '"CANCEL"', "revision: item.revision", "revision: active.revision",
]) need(files.assets, marker, "actifs — invariants");

need(files.runner, "qa-professional-operations-i18n-331.mjs", "Regression QA");

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Professional ERP operations i18n #331 — PASS (${frKeys.length} clés FR/EN, invariants métier préservés).`);
