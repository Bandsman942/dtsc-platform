import fs from "node:fs";
import path from "node:path";

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const readJson = (file) => JSON.parse(read(file));

const registryFiles = [
  "lib/enterprise/module-registry-data.json",
  "lib/enterprise/module-registry-common-domains.json",
  "lib/enterprise/module-registry-finance.json",
  "lib/enterprise/module-registry-manufacturing.json",
  "lib/enterprise/module-registry-tailoring.json",
  "lib/enterprise/module-registry-gaming.json",
  "lib/enterprise/module-registry-retail.json",
];

const sourceDefinitions = registryFiles.flatMap((file) =>
  (readJson(file).modules || []).map((definition) => ({ ...definition, __file: file })),
);
const sectorOverrides = new Map((readJson("lib/enterprise/module-registry-sector-convergence.json").overrides || []).map((item) => [item.code, item]));
const cleanupOverrides = new Map((readJson("lib/enterprise/module-registry-final-cleanup.json").overrides || []).map((item) => [item.code, item]));
const commercialOverrides = new Map((readJson("lib/enterprise/module-registry-commercial-overrides.json").overrides || []).map((item) => [item.code, item]));

function effective(source) {
  let definition = { ...source };
  const sector = sectorOverrides.get(definition.code);
  if (sector) definition = { ...definition, dependencies: [...new Set(sector.dependencies || [])], permissionPrefixes: [...new Set(sector.permissionPrefixes || [])] };
  const cleanup = cleanupOverrides.get(definition.code);
  if (cleanup) {
    definition = {
      ...definition,
      implementationStatus: cleanup.implementationStatus,
      routeKind: cleanup.routeKind,
      workspaceKey: cleanup.workspaceKey,
      permissionPrefixes: [...(cleanup.permissionPrefixes || [])],
      accessPolicy: cleanup.accessPolicy,
      dependencies: [...(cleanup.dependencies || [])],
    };
  }
  const commercial = commercialOverrides.get(definition.code);
  if (commercial) definition = { ...definition, minimumPlan: commercial.minimumPlan };
  return definition;
}

const definitions = sourceDefinitions.map(effective);
const codeOwners = new Map();
for (const definition of sourceDefinitions) {
  const existing = codeOwners.get(definition.code);
  check(!existing, `Canonical code ${definition.code} is duplicated in ${existing || "another registry"} and ${definition.__file}.`);
  if (!existing) codeOwners.set(definition.code, definition.__file);
}

check(sourceDefinitions.filter((definition) => definition.code === "CONTRACTS").length === 1, "CONTRACTS must have exactly one canonical definition.");
const contracts = definitions.find((definition) => definition.code === "CONTRACTS");
check(Boolean(contracts), "CONTRACTS canonical definition is missing.");
if (contracts) {
  check(contracts.implementationStatus === "ACTIVE", "CONTRACTS must resolve to the active commercial module.");
  check(contracts.workspaceKey === "ENTERPRISE_CONTRACTS", "CONTRACTS must keep the professional contracts workspace.");
  check(contracts.routePath === "/enterprise-modules/CONTRACTS", "CONTRACTS must keep its canonical route.");
}

const canonicalCodes = new Set(definitions.map((definition) => definition.code));
const aliasOwners = new Map();
const routeOwners = new Map();
const workspaceOwners = new Map();
const planLevels = { STARTER: 1, BUSINESS: 2, ENTERPRISE: 3 };
const accessPolicies = new Set(["MEMBERSHIP", "POSITION_PERMISSION", "ADMIN_ONLY", "EXPLICIT_DENY"]);
const activeStatuses = new Set(["ACTIVE", "BETA"]);

for (const definition of definitions) {
  const aliases = [...(definition.aliases || []), ...(definition.legacyCodes || [])];
  for (const rawAlias of aliases) {
    const alias = String(rawAlias).trim().toUpperCase();
    check(alias !== definition.code, `${definition.code} has a self-referencing alias.`);
    check(!canonicalCodes.has(alias), `Alias ${alias} collides with a canonical code.`);
    const previous = aliasOwners.get(alias);
    check(!previous || previous === definition.code, `Alias ${alias} is ambiguous between ${previous} and ${definition.code}.`);
    aliasOwners.set(alias, definition.code);
  }

  const required = definition.dependencies || [];
  const recommended = definition.recommendedIntegrations || [];
  check(Array.isArray(required), `${definition.code} dependencies must be an array.`);
  check(Array.isArray(recommended), `${definition.code} recommendedIntegrations must be an array when declared.`);
  for (const dependencyCode of required) {
    check(canonicalCodes.has(dependencyCode), `${definition.code} has unknown required dependency ${dependencyCode}.`);
    check(dependencyCode !== definition.code, `${definition.code} cannot depend on itself.`);
    const dependency = definitions.find((item) => item.code === dependencyCode);
    if (dependency && planLevels[definition.minimumPlan] && planLevels[dependency.minimumPlan]) {
      check(planLevels[definition.minimumPlan] >= planLevels[dependency.minimumPlan], `${definition.code} (${definition.minimumPlan}) cannot require ${dependencyCode} (${dependency.minimumPlan}).`);
    }
  }
  for (const integrationCode of recommended) {
    check(canonicalCodes.has(integrationCode), `${definition.code} has unknown recommended integration ${integrationCode}.`);
    check(integrationCode !== definition.code, `${definition.code} cannot recommend itself.`);
    check(!required.includes(integrationCode), `${definition.code} marks ${integrationCode} as both required and recommended.`);
  }

  if (activeStatuses.has(definition.implementationStatus)) {
    check(Boolean(definition.routePath), `${definition.code} is active without a route.`);
    check(Boolean(definition.workspaceKey), `${definition.code} is active without a workspace.`);
    check(Boolean(planLevels[definition.minimumPlan]), `${definition.code} has an unknown minimum plan.`);
    check(accessPolicies.has(definition.accessPolicy), `${definition.code} has an unknown access policy.`);
    if (definition.accessPolicy === "POSITION_PERMISSION") {
      check(Array.isArray(definition.permissionPrefixes) && definition.permissionPrefixes.length > 0, `${definition.code} requires position permissions but has no permission prefix.`);
    }
    if (definition.routeKind !== "ADMIN_SECTION" && definition.routeKind !== "HIDDEN") {
      const previousRoute = routeOwners.get(definition.routePath);
      check(!previousRoute || previousRoute === definition.code, `Route ${definition.routePath} is shared by ${previousRoute} and ${definition.code}.`);
      routeOwners.set(definition.routePath, definition.code);
      const previousWorkspace = workspaceOwners.get(definition.workspaceKey);
      check(!previousWorkspace || previousWorkspace === definition.code, `Workspace ${definition.workspaceKey} is shared by ${previousWorkspace} and ${definition.code}.`);
      workspaceOwners.set(definition.workspaceKey, definition.code);
    }
  }
}

const finance = new Map(definitions.filter((definition) => definition.domain === "FINANCE").map((definition) => [definition.code, definition]));
const requireRequired = (code, dependency) => check(finance.get(code)?.dependencies?.includes(dependency), `${code} must require ${dependency}.`);
const requireRecommended = (code, integration) => check(finance.get(code)?.recommendedIntegrations?.includes(integration), `${code} must recommend ${integration}.`);
const forbidRequired = (code, dependency) => check(!finance.get(code)?.dependencies?.includes(dependency), `${code} must not require ${dependency}.`);

requireRequired("FINANCE_RECEIVABLES", "CRM_CUSTOMERS");
forbidRequired("FINANCE_RECEIVABLES", "SALES_QUOTES_ORDERS");
requireRecommended("FINANCE_RECEIVABLES", "SALES_QUOTES_ORDERS");
requireRecommended("FINANCE_RECEIVABLES", "CONTRACTS");
requireRequired("FINANCE_PAYABLES", "SUPPLIERS_PURCHASES");
forbidRequired("FINANCE_PAYABLES", "FINANCE_OVERVIEW");
requireRecommended("FINANCE_PAYABLES", "FINANCE_OVERVIEW");
requireRequired("FINANCE_PAYMENTS", "FINANCE_TREASURY");
forbidRequired("FINANCE_PAYMENTS", "FINANCE_RECEIVABLES");
forbidRequired("FINANCE_PAYMENTS", "FINANCE_PAYABLES");
requireRecommended("FINANCE_PAYMENTS", "FINANCE_RECEIVABLES");
requireRecommended("FINANCE_PAYMENTS", "FINANCE_PAYABLES");
forbidRequired("FINANCE_TREASURY", "FINANCE_OVERVIEW");
requireRecommended("FINANCE_TREASURY", "FINANCE_OVERVIEW");
requireRequired("FINANCE_CASH", "FINANCE_TREASURY");
forbidRequired("FINANCE_CASH", "FINANCE_PAYMENTS");
requireRecommended("FINANCE_CASH", "FINANCE_PAYMENTS");
requireRequired("FINANCE_RECONCILIATION", "FINANCE_BANK");
forbidRequired("FINANCE_RECONCILIATION", "FINANCE_PAYMENTS");
requireRecommended("FINANCE_RECONCILIATION", "FINANCE_PAYMENTS");
forbidRequired("FINANCE_ACCOUNTING", "FINANCE_OVERVIEW");
requireRecommended("FINANCE_ACCOUNTING", "FINANCE_OVERVIEW");
requireRequired("FINANCE_CLOSE", "FINANCE_ACCOUNTING");
forbidRequired("FINANCE_CLOSE", "FINANCE_RECONCILIATION");
requireRecommended("FINANCE_CLOSE", "FINANCE_RECONCILIATION");

const registrySource = read("lib/enterprise/module-registry.ts");
check(registrySource.includes("recommendedIntegrations?: string[]"), "Registry type must expose recommendedIntegrations.");
check(registrySource.includes("Duplicate canonical enterprise module code"), "Runtime registry must fail closed on duplicate canonical codes.");
check(registrySource.includes("Enterprise module alias collides with canonical code"), "Runtime registry must fail closed on alias/canonical collisions.");
check(registrySource.includes("Ambiguous enterprise module alias"), "Runtime registry must fail closed on ambiguous aliases.");

const accessSource = read("lib/enterprise/module-access.ts");
const resolveStart = accessSource.indexOf("function resolveFromSnapshot");
const resolveEnd = accessSource.indexOf("export async function resolveEnterpriseModuleAccess");
const resolveBody = resolveStart >= 0 && resolveEnd > resolveStart ? accessSource.slice(resolveStart, resolveEnd) : "";
check(resolveBody.includes("for (const dependencyCode of definition.dependencies)"), "Access resolver must enforce required dependencies.");
check(!resolveBody.includes("recommendedIntegrations"), "Recommended integrations must not become access blockers.");
check(accessSource.includes("RECOMMENDED_INTEGRATION_INACTIVE"), "Configuration diagnostics must expose inactive recommended integrations.");
check(accessSource.includes('severity: "WARNING"'), "Inactive recommended integrations must be warnings, not errors.");

const subscriptionSource = read("lib/enterprise/module-subscription-reconciliation.ts");
const collectStart = subscriptionSource.indexOf("function collectDependencyDefinitions");
const collectEnd = subscriptionSource.indexOf("function moduleWriteData");
const collectBody = collectStart >= 0 && collectEnd > collectStart ? subscriptionSource.slice(collectStart, collectEnd) : "";
check(collectBody.includes("definition.dependencies"), "Subscription activation must recurse through required dependencies.");
check(!collectBody.includes("recommendedIntegrations"), "Subscription activation must not auto-enable recommended integrations.");
check(subscriptionSource.includes("recommendedIntegrations: [...(requestedDefinition.recommendedIntegrations || [])]"), "Subscription activation must report recommended integrations without activating them.");

const adminAccessRoute = read("app/api/enterprise/[organizationId]/administration/modules/[moduleCode]/access/route.ts");
check(adminAccessRoute.includes("recommendedIntegrations: recommendedIntegrationLabels"), "Administration API must distinguish recommended integrations from required dependencies.");

const readinessResolver = read("lib/enterprise/module-commercial-readiness.ts");
check(readinessResolver.includes("recommendedIntegrations: string[]"), "Commercial readiness must expose recommended integrations.");
check(readinessResolver.includes("recommendedIntegrations: [...(definition.recommendedIntegrations || [])]"), "Commercial readiness must derive recommended integrations from the canonical registry.");
const readinessQa = read("scripts/qa-erp-commercial-readiness-checks.mjs");
check(readinessQa.includes("ne peut pas être COMMERCIAL_READY par profil ou valeur par défaut"), "Commercial readiness must not auto-promote modules.");

const aiAuthorization = read("lib/ai/tools/authorize.ts");
check(aiAuthorization.includes("resolveEnterpriseModuleAccess"), "AI tool authorization must reuse canonical module access.");
check(aiAuthorization.includes("planMeetsRequirement"), "AI tool authorization must retain plan enforcement.");

if (failures.length) {
  console.error(`Hotfix #668 Registry & Business Coherence QA failed: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Hotfix #668 Registry & Business Coherence QA passed for ${definitions.length} canonical modules, ${aliasOwners.size} aliases and Finance required/recommended integrations.`);
