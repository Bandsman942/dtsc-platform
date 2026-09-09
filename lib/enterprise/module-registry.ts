import baseRegistryData from "@/lib/enterprise/module-registry-data.json";
import commonDomainRegistryData from "@/lib/enterprise/module-registry-common-domains.json";
import financeRegistryData from "@/lib/enterprise/module-registry-finance.json";
import manufacturingRegistryData from "@/lib/enterprise/module-registry-manufacturing.json";
import retailRegistryData from "@/lib/enterprise/module-registry-retail.json";
import sectorConvergenceRegistryData from "@/lib/enterprise/module-registry-sector-convergence.json";
import finalCleanupRegistryData from "@/lib/enterprise/module-registry-final-cleanup.json";
import commercialOverrideRegistryData from "@/lib/enterprise/module-registry-commercial-overrides.json";

export const ENTERPRISE_MODULE_IMPLEMENTATION_STATUSES = ["ACTIVE", "BETA", "PLANNED", "HIDDEN"] as const;
export type EnterpriseModuleImplementationStatus = (typeof ENTERPRISE_MODULE_IMPLEMENTATION_STATUSES)[number];

export const ENTERPRISE_MODULE_DOMAINS = [
  "OPERATIONS",
  "COMMERCIAL",
  "PROCUREMENT_INVENTORY",
  "HUMAN_RESOURCES",
  "PROJECTS_ASSETS",
  "FINANCE",
  "INTELLIGENCE",
  "ADMINISTRATION",
  "SECTOR_HEALTH",
  "SECTOR_PHARMACY",
  "SECTOR_MANUFACTURING",
] as const;
export type EnterpriseModuleDomain = (typeof ENTERPRISE_MODULE_DOMAINS)[number];

export const ENTERPRISE_MODULE_NAVIGATION_GROUPS = [
  "OPERATIONS",
  "COMMERCIAL",
  "PROCUREMENT_RESOURCES",
  "HUMAN_RESOURCES",
  "PROJECTS_ASSETS",
  "FINANCE",
  "SECTOR_HEALTH",
  "SECTOR_PHARMACY",
  "SECTOR_MANUFACTURING",
  "INTELLIGENCE",
  "ADMINISTRATION",
] as const;
export type EnterpriseModuleNavigationGroup = (typeof ENTERPRISE_MODULE_NAVIGATION_GROUPS)[number];

export const ENTERPRISE_MODULE_ROUTE_KINDS = [
  "DEDICATED_CORE",
  "SECTOR_HEALTH",
  "SECTOR_PHARMACY",
  "ADMIN_SECTION",
  "AI_SERVICE",
  "HIDDEN",
] as const;
export type EnterpriseModuleRouteKind = (typeof ENTERPRISE_MODULE_ROUTE_KINDS)[number];

export const ENTERPRISE_MODULE_ACCESS_POLICIES = ["POSITION_PERMISSION", "MEMBERSHIP", "ADMIN_ONLY", "EXPLICIT_DENY"] as const;
export type EnterpriseModuleAccessPolicy = (typeof ENTERPRISE_MODULE_ACCESS_POLICIES)[number];

export const ENTERPRISE_MODULE_PLAN_LEVELS = ["STARTER", "BUSINESS", "ENTERPRISE"] as const;
export type EnterpriseModulePlanLevel = (typeof ENTERPRISE_MODULE_PLAN_LEVELS)[number];

export type EnterpriseModuleDefinition = {
  code: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  domain: EnterpriseModuleDomain;
  implementationStatus: EnterpriseModuleImplementationStatus;
  navigationGroup: EnterpriseModuleNavigationGroup;
  navigationOrder: number;
  iconKey: string;
  routeKind: EnterpriseModuleRouteKind;
  routePath?: string;
  workspaceKey: string;
  permissionPrefixes: string[];
  accessPolicy: EnterpriseModuleAccessPolicy;
  minimumPlan: EnterpriseModulePlanLevel;
  requiresActiveSubscription: boolean;
  applicableSectors: "ALL" | string[];
  dependencies: string[];
  aliases?: string[];
  legacyCodes?: string[];
  qaContract?: string;
};

type RegistryFile = { version: number; modules: EnterpriseModuleDefinition[] };
type RegistryOverride = Partial<EnterpriseModuleDefinition> & { code: string };
type RegistryOverrideFile = { version: number; overrides: RegistryOverride[] };

const baseRegistry = baseRegistryData as RegistryFile;
const commonRegistry = commonDomainRegistryData as RegistryFile;
const financeRegistry = financeRegistryData as RegistryFile;
const manufacturingRegistry = manufacturingRegistryData as RegistryFile;
const retailRegistry = retailRegistryData as RegistryFile;
const convergenceRegistry = sectorConvergenceRegistryData as RegistryFile;
const cleanupRegistry = finalCleanupRegistryData as RegistryOverrideFile;
const commercialOverrideRegistry = commercialOverrideRegistryData as RegistryOverrideFile;

const CANONICAL_MODULE_DEFINITIONS = [
  ...baseRegistry.modules,
  ...commonRegistry.modules,
  ...financeRegistry.modules,
  ...manufacturingRegistry.modules,
  ...retailRegistry.modules,
].map((definition) => {
  const convergence = convergenceRegistry.modules.find((candidate) => candidate.code === definition.code);
  const cleaned = cleanupRegistry.overrides.find((candidate) => candidate.code === definition.code);
  const commercial = commercialOverrideRegistry.overrides.find((candidate) => candidate.code === definition.code);
  return { ...definition, ...(convergence || {}), ...(cleaned || {}), ...(commercial || {}) };
});

for (const convergence of convergenceRegistry.modules) {
  if (!CANONICAL_MODULE_DEFINITIONS.some((definition) => definition.code === convergence.code)) {
    const cleaned = cleanupRegistry.overrides.find((candidate) => candidate.code === convergence.code);
    const commercial = commercialOverrideRegistry.overrides.find((candidate) => candidate.code === convergence.code);
    CANONICAL_MODULE_DEFINITIONS.push({ ...convergence, ...(cleaned || {}), ...(commercial || {}) });
  }
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

const definitionsByCode = new Map<string, EnterpriseModuleDefinition>();
const aliasesToCanonical = new Map<string, string>();

for (const definition of CANONICAL_MODULE_DEFINITIONS) {
  const canonicalCode = normalizeCode(definition.code);
  if (definitionsByCode.has(canonicalCode)) {
    throw new Error(`DUPLICATE_ENTERPRISE_MODULE_CODE:${canonicalCode}`);
  }
  definitionsByCode.set(canonicalCode, { ...definition, code: canonicalCode });
}

for (const definition of definitionsByCode.values()) {
  for (const alias of [...(definition.aliases || []), ...(definition.legacyCodes || [])]) {
    const normalizedAlias = normalizeCode(alias);
    const existing = aliasesToCanonical.get(normalizedAlias);
    if (existing && existing !== definition.code) {
      throw new Error(`DUPLICATE_ENTERPRISE_MODULE_ALIAS:${normalizedAlias}`);
    }
    aliasesToCanonical.set(normalizedAlias, definition.code);
  }
}

export const ENTERPRISE_MODULE_REGISTRY = Array.from(definitionsByCode.values());

export function normalizeEnterpriseModuleCode(moduleCode: string) {
  const normalized = normalizeCode(moduleCode);
  return aliasesToCanonical.get(normalized) || normalized;
}

export function getEnterpriseModuleDefinition(moduleCode: string) {
  return definitionsByCode.get(normalizeEnterpriseModuleCode(moduleCode)) || null;
}

export function listEnterpriseModuleDefinitions(options?: { statuses?: EnterpriseModuleImplementationStatus[]; sectorCode?: string | null }) {
  const statuses = options?.statuses ? new Set(options.statuses) : null;
  const sectorCode = options?.sectorCode?.trim().toUpperCase() || null;
  return ENTERPRISE_MODULE_REGISTRY.filter((definition) => {
    if (statuses && !statuses.has(definition.implementationStatus)) return false;
    if (!sectorCode || definition.applicableSectors === "ALL") return true;
    return definition.applicableSectors.includes(sectorCode);
  });
}

export function isEnterpriseModuleImplemented(moduleCode: string) {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  return definition ? definition.implementationStatus === "ACTIVE" || definition.implementationStatus === "BETA" : false;
}

export function isEnterpriseModuleNavigable(moduleCodeOrDefinition: string | EnterpriseModuleDefinition) {
  const definition = typeof moduleCodeOrDefinition === "string" ? getEnterpriseModuleDefinition(moduleCodeOrDefinition) : moduleCodeOrDefinition;
  if (!definition || !isEnterpriseModuleImplemented(definition.code)) return false;
  if (definition.routeKind === "HIDDEN" || definition.accessPolicy === "EXPLICIT_DENY") return false;
  if (!definition.routePath || !definition.workspaceKey) return false;
  return true;
}

export function isEnterpriseModuleSectorCompatible(moduleCodeOrDefinition: string | EnterpriseModuleDefinition, sectorCode?: string | null) {
  const definition = typeof moduleCodeOrDefinition === "string" ? getEnterpriseModuleDefinition(moduleCodeOrDefinition) : moduleCodeOrDefinition;
  if (!definition) return false;
  if (definition.applicableSectors === "ALL") return true;
  const normalizedSector = sectorCode?.trim().toUpperCase();
  return Boolean(normalizedSector && definition.applicableSectors.includes(normalizedSector));
}

export function getEnterpriseModuleLabel(definition: EnterpriseModuleDefinition, locale?: string | null) {
  return locale === "en" ? definition.labelEn : definition.labelFr;
}

export function getEnterpriseModuleDescription(definition: EnterpriseModuleDefinition, locale?: string | null) {
  return locale === "en" ? definition.descriptionEn : definition.descriptionFr;
}

export function getEnterpriseNavigationGroupLabel(group: EnterpriseModuleNavigationGroup, locale?: string | null) {
  const english = locale === "en";
  const labels: Record<EnterpriseModuleNavigationGroup, [string, string]> = {
    OPERATIONS: ["Opérations", "Operations"],
    COMMERCIAL: ["Commercial", "Commercial"],
    PROCUREMENT_RESOURCES: ["Achats, stocks & ressources", "Procurement, inventory & resources"],
    HUMAN_RESOURCES: ["Ressources humaines", "Human resources"],
    PROJECTS_ASSETS: ["Projets & actifs", "Projects & assets"],
    FINANCE: ["Finance", "Finance"],
    SECTOR_HEALTH: ["Santé", "Health"],
    SECTOR_PHARMACY: ["Pharmacie", "Pharmacy"],
    SECTOR_MANUFACTURING: ["Production", "Manufacturing"],
    INTELLIGENCE: ["Intelligence & IA", "Intelligence & AI"],
    ADMINISTRATION: ["Administration", "Administration"],
  };
  return labels[group][english ? 1 : 0];
}

export function resolveEnterpriseModuleRoute(moduleCode: string) {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition || !isEnterpriseModuleNavigable(definition)) return null;
  return { definition, canonicalCode: definition.code, path: definition.routePath as string };
}

export function getEnterpriseAdminLegacyRedirect(moduleCode: string) {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  return definition?.routeKind === "ADMIN_SECTION" ? definition.routePath || "/enterprise-admin" : null;
}
