import registryData from "@/lib/modules/standard-module-registry-data.json";
import type { SaasPlanCode } from "@/lib/billing/plans";

export type StandardModuleFamily = "GLOBAL_SAAS" | "ENTERPRISE_STANDARD" | "DTSC_INTERNAL" | "DTSC_CONSOLE" | "PUBLIC_ECOSYSTEM" | "ACCOUNT" | "SUPPORT";
export type StandardModuleDomain = "HOME" | "ACCOUNT" | "SUBSCRIPTION" | "COLLABORATION" | "COMMUNICATION" | "PLANNING" | "WORK_COORDINATION" | "DOCUMENTS" | "ANALYTICS" | "INTELLIGENCE" | "ADMINISTRATION" | "CONTENT" | "SUPPORT" | "SECURITY";
export type StandardModuleImplementationStatus = "ACTIVE" | "BETA" | "PLANNED" | "HIDDEN" | "DEPRECATED" | "RETIRED";
export type StandardModuleMaturity = "BACKEND_READY" | "READ_ONLY_UI" | "OPERATIONAL_UI" | "PROFESSIONAL_READY" | "COMMERCIAL_READY";
export type StandardModuleHost = "PUBLIC" | "APP" | "ACCOUNT" | "CONSOLE" | "SUPPORT";
export type StandardModuleAccessPolicy = "PUBLIC" | "AUTHENTICATED" | "GLOBAL_ROLE" | "ORGANIZATION_MEMBERSHIP" | "POSITION_PERMISSION" | "ADMIN_BLOCK" | "EXPLICIT_DENY";

export type StandardModuleDefinition = {
  code: string; labelFr: string; labelEn: string; descriptionFr: string; descriptionEn: string;
  family: StandardModuleFamily; domain: StandardModuleDomain; implementationStatus: StandardModuleImplementationStatus; maturity: StandardModuleMaturity;
  routePath: string | null; host: StandardModuleHost; iconKey: string; navigationGroup: string; navigationOrder: number; accessPolicy: StandardModuleAccessPolicy;
  permissionPrefixes: string[]; minimumPlan: SaasPlanCode | null; requiresActiveSubscription: boolean; dependencies: string[]; erpDependencies: string[];
  userGuidePath: string | null; qaContract: string | null; commercialEvidencePath?: string | null; aliases?: string[]; legacyRoutes?: string[];
};

const EXACT_NATIVE_GUIDE_BY_CODE: Record<string, string> = {
  SUPPORT: "lib/user-guides/iteration08-guides.ts", CALENDAR: "lib/user-guides/iteration04-guides.ts", DTSC_ACTIVITIES: "lib/user-guides/iteration04-guides.ts",
  DTSC_AVAILABILITY: "lib/user-guides/iteration04-guides.ts", DTSC_ABSENCES: "lib/user-guides/iteration04-guides.ts", DTSC_PRESTATIONS: "lib/user-guides/iteration04-guides.ts",
};

const iteration08 = (code: string, labelFr: string, labelEn: string, routePath: string, host: StandardModuleHost, family: StandardModuleFamily, domain: StandardModuleDomain, order: number, accessPolicy: StandardModuleAccessPolicy = "PUBLIC"): StandardModuleDefinition => ({
  code, labelFr, labelEn, descriptionFr: `${labelFr} consolidé pendant l’itération STANDARD-08.`, descriptionEn: `${labelEn} consolidated during STANDARD-08.`, family, domain,
  implementationStatus: "ACTIVE", maturity: "PROFESSIONAL_READY", routePath, host, iconKey: "sparkles", navigationGroup: "STANDARD_08", navigationOrder: order,
  accessPolicy, permissionPrefixes: [], minimumPlan: null, requiresActiveSubscription: false, dependencies: [], erpDependencies: [], userGuidePath: "lib/user-guides/iteration08-guides.ts",
  qaContract: "scripts/qa-standard-modules-iteration-08.mjs", aliases: [], legacyRoutes: [],
});

const ITERATION08_MODULES: StandardModuleDefinition[] = [
  iteration08("PUBLIC_SITE", "Site public", "Public website", "/", "PUBLIC", "PUBLIC_ECOSYSTEM", "HOME", 801),
  iteration08("PUBLIC_SERVICES", "Services publics", "Public services", "/services", "PUBLIC", "PUBLIC_ECOSYSTEM", "CONTENT", 802),
  iteration08("PUBLIC_SOLUTIONS", "Solutions publiques", "Public solutions", "/solutions", "PUBLIC", "PUBLIC_ECOSYSTEM", "CONTENT", 803),
  iteration08("PUBLIC_SECTORS", "Secteurs publics", "Public sectors", "/secteurs", "PUBLIC", "PUBLIC_ECOSYSTEM", "CONTENT", 804),
  iteration08("PUBLIC_PROJECTS", "Projets publics", "Public projects", "/projets", "PUBLIC", "PUBLIC_ECOSYSTEM", "CONTENT", 805),
  iteration08("PUBLIC_RESOURCES", "Ressources publiques", "Public resources", "/ressources", "PUBLIC", "PUBLIC_ECOSYSTEM", "CONTENT", 806),
  iteration08("PUBLIC_CONTACT", "Contact public", "Public contact", "/contact", "PUBLIC", "PUBLIC_ECOSYSTEM", "CONTENT", 807),
  iteration08("PUBLIC_LEGAL", "Pages légales", "Legal pages", "/politique-confidentialite", "PUBLIC", "PUBLIC_ECOSYSTEM", "SECURITY", 808),
  iteration08("PUBLIC_AI_ASSISTANT", "Assistant IA public", "Public AI assistant", "/", "PUBLIC", "PUBLIC_ECOSYSTEM", "INTELLIGENCE", 809),
  iteration08("ACCOUNT_AUTHENTICATION", "Authentification Account", "Account authentication", "/auth/sign-in", "ACCOUNT", "ACCOUNT", "ACCOUNT", 810, "PUBLIC"),
  iteration08("ACCOUNT_REGISTRATION", "Inscription Account", "Account registration", "/auth/sign-up", "ACCOUNT", "ACCOUNT", "ACCOUNT", 811, "PUBLIC"),
  iteration08("ACCOUNT_RECOVERY", "Récupération Account", "Account recovery", "/auth/forgot-password", "ACCOUNT", "ACCOUNT", "SECURITY", 812, "PUBLIC"),
  iteration08("PRODUCT_NAVIGATION", "Navigation produits", "Product navigation", "/dashboard", "APP", "GLOBAL_SAAS", "HOME", 813, "AUTHENTICATED"),
  iteration08("PWA", "PWA par produit", "Product-scoped PWA", "/dashboard", "APP", "GLOBAL_SAAS", "SECURITY", 814, "AUTHENTICATED"),
  iteration08("MULTI_DOMAIN_SESSION", "Session multidomaine", "Multi-domain session", "/dashboard", "APP", "GLOBAL_SAAS", "SECURITY", 815, "AUTHENTICATED"),
];

export const STANDARD_MODULE_FALLBACK_GUIDE_PATH = "components/user-guides/standard-module-fallback-guide.tsx";
export const STANDARD_MODULE_REGISTRY_VERSION = `${registryData.version}-iteration-08-frontend-closure`;
const rawDefinitions = registryData.modules as StandardModuleDefinition[];
const existingCodes = new Set(rawDefinitions.map((definition) => definition.code));
export const STANDARD_MODULE_REGISTRY = [...rawDefinitions, ...ITERATION08_MODULES.filter((definition) => !existingCodes.has(definition.code))].map((definition) => {
  if (definition.userGuidePath || !definition.routePath) return definition;
  return { ...definition, userGuidePath: EXACT_NATIVE_GUIDE_BY_CODE[definition.code] || STANDARD_MODULE_FALLBACK_GUIDE_PATH };
}) as StandardModuleDefinition[];
export const STANDARD_MODULE_VISIBLE_STATUSES = new Set<StandardModuleImplementationStatus>(["ACTIVE", "BETA"]);

const definitionByCode = new Map<string, StandardModuleDefinition>();
const canonicalCodeByAlias = new Map<string, string>();
for (const definition of STANDARD_MODULE_REGISTRY) { definitionByCode.set(definition.code, definition); for (const alias of definition.aliases || []) canonicalCodeByAlias.set(alias.trim().toUpperCase(), definition.code); }
export function normalizeStandardModuleCode(moduleCode: string) { const normalized = moduleCode.trim().toUpperCase(); return canonicalCodeByAlias.get(normalized) || normalized; }
export function getStandardModuleDefinition(moduleCode: string) { return definitionByCode.get(normalizeStandardModuleCode(moduleCode)) || null; }
export function getCanonicalStandardModuleCode(moduleCode: string) { return getStandardModuleDefinition(moduleCode)?.code || null; }
export function isStandardModuleKnown(moduleCode: string) { return Boolean(getStandardModuleDefinition(moduleCode)); }
export function isStandardModuleVisible(definition: StandardModuleDefinition) { return STANDARD_MODULE_VISIBLE_STATUSES.has(definition.implementationStatus); }
export function isStandardModuleNavigable(definition: StandardModuleDefinition) { return isStandardModuleVisible(definition) && Boolean(definition.routePath); }
export function listStandardModuleDefinitions(options?: { family?: StandardModuleFamily; host?: StandardModuleHost; navigationGroup?: string; statuses?: StandardModuleImplementationStatus[] }) { return STANDARD_MODULE_REGISTRY.filter((definition) => { if (options?.family && definition.family !== options.family) return false; if (options?.host && definition.host !== options.host) return false; if (options?.navigationGroup && definition.navigationGroup !== options.navigationGroup) return false; if (options?.statuses && !options.statuses.includes(definition.implementationStatus)) return false; return true; }).sort((left, right) => left.navigationOrder - right.navigationOrder); }
export function getStandardModuleLabel(definition: StandardModuleDefinition, locale?: string | null) { return locale === "en" ? definition.labelEn : definition.labelFr; }
export function getStandardModuleDescription(definition: StandardModuleDefinition, locale?: string | null) { return locale === "en" ? definition.descriptionEn : definition.descriptionFr; }
export function assertStandardModuleRegistryIntegrity() {
  const failures: string[] = []; const codes = new Set<string>(); const aliases = new Set<string>();
  for (const definition of STANDARD_MODULE_REGISTRY) {
    if (codes.has(definition.code)) failures.push(`Code dupliqué: ${definition.code}`); codes.add(definition.code);
    if (definition.maturity === "COMMERCIAL_READY" && !definition.commercialEvidencePath) failures.push(`${definition.code}: COMMERCIAL_READY interdit sans preuve propriétaire versionnée.`);
    if (isStandardModuleVisible(definition) && !definition.routePath) failures.push(`${definition.code}: module visible sans route canonique.`);
    if (isStandardModuleVisible(definition) && definition.routePath && !definition.userGuidePath) failures.push(`${definition.code}: module visible sans guide utilisateur natif ni couverture de repli.`);
    for (const alias of definition.aliases || []) { const normalized = alias.trim().toUpperCase(); if (codes.has(normalized) || aliases.has(normalized)) failures.push(`Alias ambigu: ${normalized}`); aliases.add(normalized); }
  }
  return failures;
}
