import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

const checks = [];
function check(name, condition, details = "") {
  checks.push({ name, ok: Boolean(condition), details });
}
function includesAll(source, fragments) {
  return fragments.every((fragment) => source.includes(fragment));
}

const toggleRoute = read("app/api/enterprise/[organizationId]/modules/[moduleId]/route.ts");
const reconciliation = read("lib/enterprise/module-subscription-reconciliation.ts");
const moduleAccess = read("lib/enterprise/module-access.ts");
const moduleLoader = read("lib/enterprise/enterprise-modules-loader.ts");
const mobileShell = read("components/dtsc/mobile-shell.tsx");
const consoleBilling = read("lib/console/console-billing.ts");
const planManager = read("components/admin/billing-plan-manager.tsx");
const planLimits = read("lib/billing/plan-limits.ts");
const planCatalog = read("lib/billing/plan-catalog.ts");
const moduleRegistry = read("lib/enterprise/module-registry.ts");

check(
  "L’activation de module gère explicitement les prérequis",
  includesAll(toggleRoute, ["activateEnterpriseModule", "activateDependencies", "disableEnterpriseModule"]),
);
check(
  "La désactivation protège les modules dépendants actifs",
  includesAll(reconciliation, ["ACTIVE_DEPENDENTS", "activeDependents", "disableEnterpriseModule"]),
);
check(
  "La réconciliation tient compte du secteur, du plan et de l’abonnement",
  includesAll(reconciliation, ["isEnterpriseModuleSectorCompatible", "planMeetsRequirement", "subscriptionActive", "reconcileOrganizationModulesWithSubscription"]),
);
check(
  "Les aliases et anciennes lignes sont désactivés pendant la réconciliation",
  includesAll(reconciliation, ["normalizeEnterpriseModuleCode", "disabledLegacyOrExcludedRows", "tenantModule.moduleCode !== canonicalCode"]),
);
check(
  "Navigation et administration partagent le même ordre canonique",
  moduleAccess.includes("compareEnterpriseModuleDefinitions") && moduleLoader.includes("compareEnterpriseModuleRows"),
);
check(
  "Le rail mobile secondaire possède des icônes et surveille le module actif",
  includesAll(mobileShell, ["data-mobile-secondary-nav", "data-mobile-module-active", "resolveEnterpriseModuleIcon", "scrollIntoView", "aria-current"]),
);
check(
  "L’administration DTSC expose le catalogue des modules par offre",
  consoleBilling.includes("getPlanModuleCatalog") && planManager.includes("moduleCatalog") && planManager.includes("Modules ERP inclus"),
);
check(
  "Les offres utilisent des libellés commerciaux français",
  includesAll(planCatalog, ["Essentiel", "Professionnel", "Entreprise"]),
);
check(
  "Les limites de modules couvrent les offres ERP réelles",
  includesAll(planLimits, ["maxActiveModules: 12", "maxActiveModules: 60", "maxActiveModules: 250"]),
);
check(
  "La navigation mobile ne présente plus les anciens libellés techniques",
  !mobileShell.includes("Admin entreprise") && !mobileShell.includes("fallback: \"Plans\"") && !mobileShell.includes("ChevronRight"),
);
check(
  "Les niveaux commerciaux sont appliqués par le registre canonique",
  includesAll(moduleRegistry, ["module-registry-commercial-overrides.json", "applyCommercialOverride"]),
);

const registryData = readJson("lib/enterprise/module-registry-data.json");
const commonData = readJson("lib/enterprise/module-registry-common-domains.json");
const financeData = readJson("lib/enterprise/module-registry-finance.json");
const sectorOverrides = new Map(readJson("lib/enterprise/module-registry-sector-convergence.json").overrides.map((item) => [item.code, item]));
const cleanupOverrides = new Map(readJson("lib/enterprise/module-registry-final-cleanup.json").overrides.map((item) => [item.code, item]));
const commercialOverrides = new Map(readJson("lib/enterprise/module-registry-commercial-overrides.json").overrides.map((item) => [item.code, item]));
const levels = { STARTER: 1, BUSINESS: 2, ENTERPRISE: 3 };

const modules = [...registryData.modules, ...commonData.modules, ...financeData.modules].map((definition) => {
  const sector = sectorOverrides.get(definition.code);
  const cleanup = cleanupOverrides.get(definition.code);
  const commercial = commercialOverrides.get(definition.code);
  return {
    ...definition,
    ...(sector ? { dependencies: sector.dependencies } : {}),
    ...(cleanup ? {
      implementationStatus: cleanup.implementationStatus,
      routeKind: cleanup.routeKind,
      dependencies: cleanup.dependencies,
    } : {}),
    ...(commercial ? { minimumPlan: commercial.minimumPlan } : {}),
  };
});
const byCode = new Map(modules.map((definition) => [definition.code, definition]));
const activeModules = modules.filter((definition) =>
  ["ACTIVE", "BETA"].includes(definition.implementationStatus) &&
  definition.routeKind !== "ADMIN_SECTION" &&
  definition.routeKind !== "HIDDEN"
);

for (const definition of activeModules) {
  for (const dependencyCode of definition.dependencies || []) {
    const dependency = byCode.get(dependencyCode);
    check(
      `${definition.code} référence un prérequis canonique ${dependencyCode}`,
      Boolean(dependency),
    );
    if (dependency) {
      check(
        `${definition.code} n’est pas vendu dans une offre inférieure à ${dependencyCode}`,
        levels[definition.minimumPlan] >= levels[dependency.minimumPlan],
        `${definition.minimumPlan} / ${dependency.minimumPlan}`,
      );
    }
  }
}

const planCapacity = { STARTER: 12, BUSINESS: 60, ENTERPRISE: 250 };
for (const planCode of Object.keys(levels)) {
  const included = activeModules.filter((definition) => levels[definition.minimumPlan] <= levels[planCode]).length;
  check(
    `La capacité ${planCode} couvre ses ${included} modules canoniques`,
    included <= planCapacity[planCode],
    `${included}/${planCapacity[planCode]}`,
  );
}

const failures = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? "✓" : "✗"} ${item.name}${item.details ? ` — ${item.details}` : ""}`);
}
if (failures.length) {
  console.error(`\n${failures.length} contrôle(s) ERP module expérience en échec.`);
  process.exit(1);
}
console.log(`\n${checks.length} contrôles ERP module expérience réussis.`);
