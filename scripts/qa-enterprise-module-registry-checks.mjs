import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import "./qa-erp-stabilization-rbac.mjs";

const root = process.cwd();
const registryPath = path.join(root, "lib/enterprise/module-registry-data.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const modules = registry.modules || [];
const errors = [];

function fail(condition, message) {
  if (condition) errors.push(message);
}

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const canonicalCodes = new Set();
const aliasOwners = new Map();
for (const moduleDefinition of modules) {
  fail(canonicalCodes.has(moduleDefinition.code), `Code canonique dupliqué: ${moduleDefinition.code}`);
  canonicalCodes.add(moduleDefinition.code);
}

for (const moduleDefinition of modules) {
  for (const alias of [...(moduleDefinition.aliases || []), ...(moduleDefinition.legacyCodes || [])]) {
    fail(alias === moduleDefinition.code, `Alias auto-référent: ${alias}`);
    const previousOwner = aliasOwners.get(alias);
    fail(Boolean(previousOwner && previousOwner !== moduleDefinition.code), `Alias ambigu ${alias}: ${previousOwner} / ${moduleDefinition.code}`);
    aliasOwners.set(alias, moduleDefinition.code);
  }
}

for (const [alias, canonicalCode] of aliasOwners) {
  fail(!canonicalCodes.has(canonicalCode), `Alias ${alias} vers module canonique absent: ${canonicalCode}`);
}

const implementedStatuses = new Set(["ACTIVE", "BETA"]);
const validRouteKinds = new Set(["DEDICATED_CORE", "SECTOR_HEALTH", "SECTOR_PHARMACY", "ADMIN_SECTION", "AI_SERVICE", "HIDDEN"]);
const adminCodes = new Set(["ADMIN_DASHBOARD", "COLLABORATORS_POSITIONS", "DEPARTMENTS", "PERMISSIONS", "SETTINGS", "AUDIT_LOGS"]);
const requiredAdminRedirects = new Map([
  ["ADMIN_DASHBOARD", "section=overview"],
  ["COLLABORATORS_POSITIONS", "section=members"],
  ["DEPARTMENTS", "section=departments"],
  ["PERMISSIONS", "section=permissions"],
  ["SETTINGS", "section=settings"],
  ["AUDIT_LOGS", "section=audit"],
]);

for (const moduleDefinition of modules) {
  fail(!validRouteKinds.has(moduleDefinition.routeKind), `${moduleDefinition.code}: routeKind invalide`);
  if (implementedStatuses.has(moduleDefinition.implementationStatus)) {
    fail(!moduleDefinition.routePath, `${moduleDefinition.code}: module implémenté sans route/redirection`);
    fail(!moduleDefinition.workspaceKey, `${moduleDefinition.code}: module implémenté sans workspace/redirection`);
    fail(!moduleDefinition.accessPolicy, `${moduleDefinition.code}: politique d'accès absente`);
    fail(!moduleDefinition.minimumPlan, `${moduleDefinition.code}: entitlement absent`);
    fail(!moduleDefinition.iconKey, `${moduleDefinition.code}: icône absente`);
    if (["SECTOR_HEALTH", "SECTOR_PHARMACY"].includes(moduleDefinition.routeKind)) {
      fail(moduleDefinition.applicableSectors === "ALL" || !moduleDefinition.applicableSectors?.length, `${moduleDefinition.code}: module sectoriel sans secteur compatible`);
    }
  }
  if (["PLANNED", "HIDDEN", "RETIRED"].includes(moduleDefinition.implementationStatus)) {
    fail(moduleDefinition.routeKind !== "HIDDEN", `${moduleDefinition.code}: module ${moduleDefinition.implementationStatus} rendu navigable`);
  }
  for (const dependencyCode of moduleDefinition.dependencies || []) {
    fail(!canonicalCodes.has(dependencyCode), `${moduleDefinition.code}: dépendance inconnue ${dependencyCode}`);
  }
  if (adminCodes.has(moduleDefinition.code)) {
    fail(moduleDefinition.routeKind !== "ADMIN_SECTION", `${moduleDefinition.code}: ancien module administratif encore autonome`);
    fail(!moduleDefinition.routePath?.includes(requiredAdminRedirects.get(moduleDefinition.code)), `${moduleDefinition.code}: redirection administrative absente ou imprécise`);
  }
}

const adjacency = new Map(modules.map((moduleDefinition) => [moduleDefinition.code, moduleDefinition.dependencies || []]));
const visiting = new Set();
const visited = new Set();
function visit(code, stack = []) {
  if (visiting.has(code)) {
    errors.push(`Dépendance circulaire: ${[...stack, code].join(" -> ")}`);
    return;
  }
  if (visited.has(code)) return;
  visiting.add(code);
  for (const dependency of adjacency.get(code) || []) visit(dependency, [...stack, code]);
  visiting.delete(code);
  visited.add(code);
}
for (const code of canonicalCodes) visit(code);

const routeSource = fs.readFileSync(path.join(root, "app/enterprise-modules/[moduleCode]/page.tsx"), "utf8");
const navigationSource = fs.readFileSync(path.join(root, "lib/enterprise/enterprise-navigation.ts"), "utf8");
const accessSource = fs.readFileSync(path.join(root, "lib/enterprise/module-access.ts"), "utf8");
const registrySource = fs.readFileSync(path.join(root, "lib/enterprise/module-registry.ts"), "utf8");
const templateSource = fs.readFileSync(path.join(root, "lib/enterprise/sector-template-application.ts"), "utf8");
const routeExecutableSource = withoutComments(routeSource);
const navigationExecutableSource = withoutComments(navigationSource);

fail(routeExecutableSource.includes("!enterpriseModule.isCore"), "La route générique rejette encore les modules sectoriels sur isCore=false");
fail(navigationExecutableSource.includes(".filter((enterpriseModule) => enterpriseModule.isCore"), "La navigation filtre encore uniquement isCore");
fail(!routeExecutableSource.includes("resolveEnterpriseModuleCapabilities"), "La route n'utilise pas le résolveur canonique de capacités");
fail(!routeExecutableSource.includes("EnterpriseSectorModuleWorkspace"), "Aucun renderer sectoriel allow-listé n'est monté");
fail(!accessSource.includes("organizationId"), "Le résolveur ne démontre pas l'isolation organizationId");
fail(accessSource.includes("prisma[moduleCode]") || registrySource.includes("prisma[moduleCode]"), "Import ou accès Prisma dynamique arbitraire détecté");
fail(/import\([^)]*moduleCode/.test(routeExecutableSource + registrySource), "Import dynamique piloté par moduleCode détecté");
fail(!templateSource.includes("isEnterpriseModuleImplemented"), "L'application des templates ne valide pas le statut d'implémentation");
fail(!templateSource.includes("isEnterpriseModuleSectorCompatible"), "L'application des templates ne valide pas le secteur");

const iconSource = fs.readFileSync(path.join(root, "lib/enterprise/enterprise-module-icons.ts"), "utf8");
for (const moduleDefinition of modules.filter((item) => implementedStatuses.has(item.implementationStatus))) {
  fail(!iconSource.includes(`"${moduleDefinition.iconKey}"`) && !iconSource.includes(`${moduleDefinition.iconKey}:`), `${moduleDefinition.code}: iconKey non résoluble ${moduleDefinition.iconKey}`);
}

if (errors.length) {
  console.error(`\nEnterprise module registry QA: ${errors.length} erreur(s).`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Enterprise module registry QA OK: ${modules.length} définitions, ${aliasOwners.size} alias, aucune dépendance circulaire.`);
