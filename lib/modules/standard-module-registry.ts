import registryData from "@/lib/modules/standard-module-registry-data.json";
import type { SaasPlanCode } from "@/lib/billing/plans";

export type StandardModuleFamily =
  | "GLOBAL_SAAS"
  | "ENTERPRISE_STANDARD"
  | "DTSC_INTERNAL"
  | "DTSC_CONSOLE"
  | "PUBLIC_ECOSYSTEM"
  | "ACCOUNT"
  | "SUPPORT";

export type StandardModuleDomain =
  | "HOME"
  | "ACCOUNT"
  | "SUBSCRIPTION"
  | "COLLABORATION"
  | "COMMUNICATION"
  | "PLANNING"
  | "WORK_COORDINATION"
  | "DOCUMENTS"
  | "ANALYTICS"
  | "INTELLIGENCE"
  | "ADMINISTRATION"
  | "CONTENT"
  | "SUPPORT"
  | "SECURITY";

export type StandardModuleImplementationStatus =
  | "ACTIVE"
  | "BETA"
  | "PLANNED"
  | "HIDDEN"
  | "DEPRECATED"
  | "RETIRED";

export type StandardModuleMaturity =
  | "BACKEND_READY"
  | "READ_ONLY_UI"
  | "OPERATIONAL_UI"
  | "PROFESSIONAL_READY"
  | "COMMERCIAL_READY";

export type StandardModuleHost = "PUBLIC" | "APP" | "ACCOUNT" | "CONSOLE" | "SUPPORT";

export type StandardModuleAccessPolicy =
  | "PUBLIC"
  | "AUTHENTICATED"
  | "GLOBAL_ROLE"
  | "ORGANIZATION_MEMBERSHIP"
  | "POSITION_PERMISSION"
  | "ADMIN_BLOCK"
  | "EXPLICIT_DENY";

export type StandardModuleDefinition = {
  code: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  family: StandardModuleFamily;
  domain: StandardModuleDomain;
  implementationStatus: StandardModuleImplementationStatus;
  maturity: StandardModuleMaturity;
  routePath: string | null;
  host: StandardModuleHost;
  iconKey: string;
  navigationGroup: string;
  navigationOrder: number;
  accessPolicy: StandardModuleAccessPolicy;
  permissionPrefixes: string[];
  minimumPlan: SaasPlanCode | null;
  requiresActiveSubscription: boolean;
  dependencies: string[];
  erpDependencies: string[];
  userGuidePath: string | null;
  qaContract: string | null;
  commercialEvidencePath?: string | null;
  aliases?: string[];
  legacyRoutes?: string[];
};

const EXACT_NATIVE_GUIDE_BY_CODE: Record<string, string> = {
  SUPPORT: "lib/user-guides/iteration07-guides.ts",
  CALENDAR: "lib/user-guides/iteration04-guides.ts",
  DTSC_ACTIVITIES: "lib/user-guides/iteration04-guides.ts",
  DTSC_AVAILABILITY: "lib/user-guides/iteration04-guides.ts",
  DTSC_ABSENCES: "lib/user-guides/iteration04-guides.ts",
  DTSC_PRESTATIONS: "lib/user-guides/iteration04-guides.ts",
};

export const STANDARD_MODULE_FALLBACK_GUIDE_PATH = "components/user-guides/standard-module-fallback-guide.tsx";
export const STANDARD_MODULE_REGISTRY_VERSION = `${registryData.version}-guide-coverage-2026-08-05`;
export const STANDARD_MODULE_REGISTRY = registryData.modules.map((rawDefinition) => {
  const definition = rawDefinition as StandardModuleDefinition;
  if (definition.userGuidePath || !definition.routePath) return definition;
  return {
    ...definition,
    userGuidePath: EXACT_NATIVE_GUIDE_BY_CODE[definition.code] || STANDARD_MODULE_FALLBACK_GUIDE_PATH,
  };
}) as StandardModuleDefinition[];
export const STANDARD_MODULE_VISIBLE_STATUSES = new Set<StandardModuleImplementationStatus>(["ACTIVE", "BETA"]);

const definitionByCode = new Map<string, StandardModuleDefinition>();
const canonicalCodeByAlias = new Map<string, string>();

for (const definition of STANDARD_MODULE_REGISTRY) {
  definitionByCode.set(definition.code, definition);
  for (const alias of definition.aliases || []) {
    canonicalCodeByAlias.set(alias.trim().toUpperCase(), definition.code);
  }
}

export function normalizeStandardModuleCode(moduleCode: string) {
  const normalized = moduleCode.trim().toUpperCase();
  return canonicalCodeByAlias.get(normalized) || normalized;
}

export function getStandardModuleDefinition(moduleCode: string) {
  return definitionByCode.get(normalizeStandardModuleCode(moduleCode)) || null;
}

export function getCanonicalStandardModuleCode(moduleCode: string) {
  return getStandardModuleDefinition(moduleCode)?.code || null;
}

export function isStandardModuleKnown(moduleCode: string) {
  return Boolean(getStandardModuleDefinition(moduleCode));
}

export function isStandardModuleVisible(definition: StandardModuleDefinition) {
  return STANDARD_MODULE_VISIBLE_STATUSES.has(definition.implementationStatus);
}

export function isStandardModuleNavigable(definition: StandardModuleDefinition) {
  return isStandardModuleVisible(definition) && Boolean(definition.routePath);
}

export function listStandardModuleDefinitions(options?: {
  family?: StandardModuleFamily;
  host?: StandardModuleHost;
  navigationGroup?: string;
  statuses?: StandardModuleImplementationStatus[];
}) {
  return STANDARD_MODULE_REGISTRY.filter((definition) => {
    if (options?.family && definition.family !== options.family) return false;
    if (options?.host && definition.host !== options.host) return false;
    if (options?.navigationGroup && definition.navigationGroup !== options.navigationGroup) return false;
    if (options?.statuses && !options.statuses.includes(definition.implementationStatus)) return false;
    return true;
  }).sort((left, right) => left.navigationOrder - right.navigationOrder);
}

export function getStandardModuleLabel(definition: StandardModuleDefinition, locale?: string | null) {
  return locale === "en" ? definition.labelEn : definition.labelFr;
}

export function getStandardModuleDescription(definition: StandardModuleDefinition, locale?: string | null) {
  return locale === "en" ? definition.descriptionEn : definition.descriptionFr;
}

export function assertStandardModuleRegistryIntegrity() {
  const failures: string[] = [];
  const codes = new Set<string>();
  const aliases = new Set<string>();

  for (const definition of STANDARD_MODULE_REGISTRY) {
    if (codes.has(definition.code)) failures.push(`Code dupliqué: ${definition.code}`);
    codes.add(definition.code);
    if (definition.maturity === "COMMERCIAL_READY" && !definition.commercialEvidencePath) {
      failures.push(`${definition.code}: COMMERCIAL_READY interdit sans preuve propriétaire versionnée.`);
    }
    if (isStandardModuleVisible(definition) && !definition.routePath) {
      failures.push(`${definition.code}: module visible sans route canonique.`);
    }
    if (isStandardModuleVisible(definition) && definition.routePath && !definition.userGuidePath) {
      failures.push(`${definition.code}: module visible sans guide utilisateur natif ni couverture de repli.`);
    }
    for (const alias of definition.aliases || []) {
      const normalized = alias.trim().toUpperCase();
      if (codes.has(normalized) || aliases.has(normalized)) failures.push(`Alias ambigu: ${normalized}`);
      aliases.add(normalized);
    }
  }

  return failures;
}
