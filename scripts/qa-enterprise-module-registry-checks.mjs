import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import "./qa-erp-stabilization-rbac.mjs";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const registryData = readJson("lib/enterprise/module-registry-data.json");
const commonDomainRegistryData = readJson("lib/enterprise/module-registry-common-domains.json");
const financeRegistryData = readJson("lib/enterprise/module-registry-finance.json");
const manufacturingRegistryData = readJson("lib/enterprise/module-registry-manufacturing.json");
const tailoringRegistryData = readJson("lib/enterprise/module-registry-tailoring.json");
const gamingRegistryData = readJson("lib/enterprise/module-registry-gaming.json");
const retailRegistryData = readJson("lib/enterprise/module-registry-retail.json");
const registrySources = [
  registryData,
  commonDomainRegistryData,
  financeRegistryData,
  manufacturingRegistryData,
  tailoringRegistryData,
  gamingRegistryData,
  retailRegistryData,
];
const sourceModules = registrySources.flatMap((source) => source.modules || []);
const sectorConvergenceRegistryData = readJson("lib/enterprise/module-registry-sector-convergence.json");
const finalCleanupRegistryData = readJson("lib/enterprise/module-registry-final-cleanup.json");
const commercialRegistryData = readJson("lib/enterprise/module-registry-commercial-overrides.json");

const sectorOverrides = new Map((sectorConvergenceRegistryData.overrides || []).map((override) => [override.code, override]));
const finalCleanupOverrides = new Map((finalCleanupRegistryData.overrides || []).map((override) => [override.code, override]));
const commercialOverrides = new Map((commercialRegistryData.overrides || []).map((override) => [override.code, override]));

function applyEffectiveOverrides(sourceDefinition) {
  let definition = { ...sourceDefinition };
  const sectorOverride = sectorOverrides.get(definition.code);
  if (sectorOverride) {
    definition = {
      ...definition,
      dependencies: [...new Set(sectorOverride.dependencies || [])],
      permissionPrefixes: [...new Set(sectorOverride.permissionPrefixes || [])],
    };
  }
  const cleanupOverride = finalCleanupOverrides.get(definition.code);
  if (cleanupOverride) {
    definition = {
      ...definition,
      implementationStatus: cleanupOverride.implementationStatus,
      routeKind: cleanupOverride.routeKind,
      workspaceKey: cleanupOverride.workspaceKey,
      permissionPrefixes: [...(cleanupOverride.permissionPrefixes || [])],
      accessPolicy: cleanupOverride.accessPolicy,
      dependencies: [...(cleanupOverride.dependencies || [])],
    };
  }
  const commercialOverride = commercialOverrides.get(definition.code);
  if (commercialOverride) definition = { ...definition, minimumPlan: commercialOverride.minimumPlan };
  return definition;
}

const modules = sourceModules.map(applyEffectiveOverrides);
const effectiveFinanceModules = (financeRegistryData.modules || []).map(applyEffectiveOverrides);
const effectiveRetailModules = (retailRegistryData.modules || []).map(applyEffectiveOverrides);
const effectiveShopFinanceModules = [...effectiveFinanceModules, ...effectiveRetailModules];
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
    fail(canonicalCodes.has(alias), `Alias en collision avec un code canonique: ${alias}`);
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
  const blockingDependencies = moduleDefinition.dependencies || [];
  const recommendedIntegrations = moduleDefinition.recommendedIntegrations || [];
  for (const dependencyCode of blockingDependencies) {
    fail(!canonicalCodes.has(dependencyCode), `${moduleDefinition.code}: dépendance inconnue ${dependencyCode}`);
    fail(dependencyCode === moduleDefinition.code, `${moduleDefinition.code}: dépendance auto-référente`);
  }
  for (const integrationCode of recommendedIntegrations) {
    fail(!canonicalCodes.has(integrationCode), `${moduleDefinition.code}: intégration recommandée inconnue ${integrationCode}`);
    fail(integrationCode === moduleDefinition.code, `${moduleDefinition.code}: intégration recommandée auto-référente`);
    fail(blockingDependencies.includes(integrationCode), `${moduleDefinition.code}: ${integrationCode} ne peut pas être à la fois bloquante et recommandée`);
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
// Preserve the historical icon-map contract for the original registry. Newer
// registries intentionally rely on resolveEnterpriseModuleIcon()'s safe
// category fallback until their visual convergence is handled by the UI hotfix.
const historicalModules = (registryData.modules || []).map(applyEffectiveOverrides);
for (const moduleDefinition of historicalModules.filter((item) => implementedStatuses.has(item.implementationStatus))) {
  fail(!iconSource.includes(`"${moduleDefinition.iconKey}"`) && !iconSource.includes(`${moduleDefinition.iconKey}:`), `${moduleDefinition.code}: iconKey non résoluble ${moduleDefinition.iconKey}`);
}

function requireEffectiveShopFinanceModule(code) {
  const definition = effectiveShopFinanceModules.find((moduleDefinition) => moduleDefinition.code === code);
  fail(!definition, `Contrat Shop/Finance: module canonique absent ${code}`);
  return definition;
}

const financeOverview = requireEffectiveShopFinanceModule("FINANCE_OVERVIEW");
const financeReceivables = requireEffectiveShopFinanceModule("FINANCE_RECEIVABLES");
const financePayables = requireEffectiveShopFinanceModule("FINANCE_PAYABLES");
const financePayments = requireEffectiveShopFinanceModule("FINANCE_PAYMENTS");
const financeTreasury = requireEffectiveShopFinanceModule("FINANCE_TREASURY");
const financeCash = requireEffectiveShopFinanceModule("FINANCE_CASH");
const financeReconciliation = requireEffectiveShopFinanceModule("FINANCE_RECONCILIATION");
const financeAccounting = requireEffectiveShopFinanceModule("FINANCE_ACCOUNTING");
const financeClose = requireEffectiveShopFinanceModule("FINANCE_CLOSE");
const retailPos = requireEffectiveShopFinanceModule("RETAIL_POS");
const retailDailyClose = requireEffectiveShopFinanceModule("RETAIL_DAILY_CLOSE");

if (financeOverview) fail(financeOverview.minimumPlan !== "BUSINESS", "Contrat Shop: FINANCE_OVERVIEW doit rester BUSINESS");
if (financeReceivables) {
  fail(!financeReceivables.dependencies?.includes("CRM_CUSTOMERS"), "Contrat Finance: Ventes & créances doit conserver Tiers & clients comme prérequis.");
  fail(financeReceivables.dependencies?.includes("SALES_QUOTES_ORDERS"), "Contrat Finance: la facturation directe ne doit pas exiger Devis & commandes.");
  fail(!financeReceivables.recommendedIntegrations?.includes("SALES_QUOTES_ORDERS"), "Contrat Finance: Devis & commandes doit rester une intégration recommandée de Ventes & créances.");
}
if (financePayables) {
  fail(!financePayables.dependencies?.includes("SUPPLIERS_PURCHASES"), "Contrat Finance: Achats & dettes doit conserver le référentiel fournisseurs.");
  fail(financePayables.dependencies?.includes("FINANCE_OVERVIEW"), "Contrat Finance: Achats & dettes ne doit pas dépendre du dashboard Finance.");
}
if (financePayments) {
  fail(!financePayments.dependencies?.includes("FINANCE_TREASURY"), "Contrat Finance: Paiements doit conserver Trésorerie comme prérequis.");
  fail(financePayments.dependencies?.includes("FINANCE_RECEIVABLES") || financePayments.dependencies?.includes("FINANCE_PAYABLES"), "Contrat Finance: Paiements ne doit pas exiger simultanément les sous-ledgers clients et fournisseurs.");
  fail(!financePayments.recommendedIntegrations?.includes("FINANCE_RECEIVABLES") || !financePayments.recommendedIntegrations?.includes("FINANCE_PAYABLES"), "Contrat Finance: Créances et Dettes doivent rester des intégrations recommandées de Paiements.");
}
if (financeTreasury) {
  fail(financeTreasury.minimumPlan !== "BUSINESS", "Contrat Shop: FINANCE_TREASURY doit rester BUSINESS");
  fail(financeTreasury.dependencies?.includes("FINANCE_ACCOUNTING"), "Contrat Shop: Trésorerie BUSINESS ne doit pas dépendre du workspace FINANCE_ACCOUNTING ENTERPRISE");
  fail(financeTreasury.dependencies?.includes("FINANCE_OVERVIEW"), "Contrat Finance: Trésorerie ne doit pas dépendre du dashboard Finance.");
  fail(!financeTreasury.recommendedIntegrations?.includes("FINANCE_OVERVIEW"), "Contrat Finance: Vue d’ensemble doit rester recommandée pour Trésorerie.");
}
if (financeCash) {
  fail(financeCash.minimumPlan !== "BUSINESS", "Contrat Shop: FINANCE_CASH doit rester BUSINESS");
  fail(!financeCash.dependencies?.includes("FINANCE_TREASURY"), "Contrat Finance: Caisse doit conserver Trésorerie comme prérequis.");
  fail(financeCash.dependencies?.includes("FINANCE_PAYMENTS"), "Contrat Finance: Caisse doit fonctionner sans imposer le module Paiements.");
  fail(!financeCash.recommendedIntegrations?.includes("FINANCE_PAYMENTS"), "Contrat Finance: Paiements doit rester recommandé pour Caisse.");
}
if (financeReconciliation) {
  fail(!financeReconciliation.dependencies?.includes("FINANCE_BANK"), "Contrat Finance: Rapprochement doit conserver Banque comme prérequis.");
  fail(financeReconciliation.dependencies?.includes("FINANCE_PAYMENTS"), "Contrat Finance: Rapprochement ne doit pas exiger Paiements.");
}
if (financeAccounting) {
  fail(financeAccounting.dependencies?.includes("FINANCE_OVERVIEW"), "Contrat Finance: Comptabilité ne doit pas dépendre du dashboard Finance.");
  fail(!financeAccounting.recommendedIntegrations?.includes("FINANCE_OVERVIEW"), "Contrat Finance: Vue d’ensemble doit rester recommandée pour Comptabilité.");
}
if (financeClose) {
  fail(!financeClose.dependencies?.includes("FINANCE_ACCOUNTING"), "Contrat Finance: Clôture doit conserver Comptabilité comme prérequis.");
  fail(financeClose.dependencies?.includes("FINANCE_RECONCILIATION"), "Contrat Finance: la Clôture ne doit pas exiger Rapprochement lorsque Banque n’est pas souscrite.");
  fail(!financeClose.recommendedIntegrations?.includes("FINANCE_RECONCILIATION"), "Contrat Finance: Rapprochement doit rester recommandé pour Clôture.");
}
if (financeAccounting) fail(financeAccounting.minimumPlan !== "ENTERPRISE", "Contrat Shop: FINANCE_ACCOUNTING complet doit rester ENTERPRISE");
if (retailPos) fail(retailPos.minimumPlan !== "BUSINESS", "Contrat Shop: RETAIL_POS doit rester BUSINESS");
if (retailDailyClose) fail(retailDailyClose.minimumPlan !== "BUSINESS", "Contrat Shop: RETAIL_DAILY_CLOSE doit rester BUSINESS");
fail(commercialOverrides.has("FINANCE_ACCOUNTING"), "Contrat Shop: aucun override commercial ne doit abaisser FINANCE_ACCOUNTING sous ENTERPRISE");

const financeConfigurationRoute = fs.readFileSync(path.join(root, "app/api/enterprise/[organizationId]/finance/configuration/route.ts"), "utf8");
const financeConfigurationService = fs.readFileSync(path.join(root, "lib/enterprise/accounting/configuration-service.ts"), "utf8");
fail(!financeConfigurationRoute.includes('"FINANCE_OVERVIEW"'), "Contrat Shop: la configuration financière BUSINESS doit rester protégée par FINANCE_OVERVIEW");
fail(!financeConfigurationService.includes("defaultAccountsJson"), "Contrat Shop: les mappings comptables assistés doivent rester dans la configuration financière canonique");

const shopOnboardingSource = fs.readFileSync(path.join(root, "docs/SHOP_ONBOARDING.md"), "utf8");
for (const marker of [
  "Comptabilité Shop assistée",
  "FINANCE_ACCOUNTING",
  "SALES_REVENUE",
  "TAX_PAYABLE",
  "COST_OF_SALES",
  "INVENTORY",
]) {
  fail(!shopOnboardingSource.includes(marker), `Documentation Shop: marqueur contractuel absent ${marker}`);
}

const syscohadaTemplate = readJson("lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json");
fail(syscohadaTemplate.code !== "OHADA_SYSCOHADA", "SYSCOHADA: le template canonique attendu OHADA_SYSCOHADA est absent");
fail(syscohadaTemplate.status !== "PUBLISHED", "SYSCOHADA: le template canonique doit rester PUBLISHED pour le contrat Shop courant");

if (errors.length) {
  console.error(`\nEnterprise module registry QA: ${errors.length} erreur(s).`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Enterprise module registry QA OK: ${modules.length} définitions canoniques, ${aliasOwners.size} alias, relations bloquantes/recommandées et contrat Shop/Finance protégés.`);
