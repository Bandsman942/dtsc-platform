import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

export const ENTERPRISE_WORKSPACE_ARCHETYPES = [
  "STANDARD_PROFESSIONAL_ERP",
  "INTEGRATED_BUSINESS_SUITE",
  "TRANSACTIONAL_WORKSPACE",
  "ADMINISTRATION_GOVERNANCE",
  "AI_IMMERSIVE",
] as const;

export type EnterpriseWorkspaceArchetype = (typeof ENTERPRISE_WORKSPACE_ARCHETYPES)[number];

const INTEGRATED_SUITE_CODES = new Set([
  "MANUFACTURING_OVERVIEW",
  "BILL_OF_MATERIALS",
  "PRODUCTION_ORDERS",
  "PRODUCTION_ROUTINGS",
  "WORK_CENTERS",
  "MATERIAL_REQUIREMENTS",
  "PRODUCTION_EXECUTION",
  "QUALITY_CONTROL",
  "SCRAP_WASTE",
  "PRODUCTION_REPORTS",
  "TAILORING_OVERVIEW",
  "TAILORING_MEASUREMENTS",
  "TAILORING_STYLES_PATTERNS",
  "TAILORING_SIZE_GRADING",
  "TAILORING_MATERIAL_PROFILES",
  "TAILORING_CUTTING_PLANS",
  "TAILORING_FITTINGS",
  "TAILORING_ALTERATIONS",
  "TAILORING_GARMENT_TRACKING",
  "TAILORING_FINISHING",
]);

const TRANSACTIONAL_CODES = new Set([
  "RETAIL_POS",
  "MOBILE_MONEY_AGENCY",
  "TELCO_TOPUPS",
  "RETAIL_DAILY_CLOSE",
  "GAMING_DASHBOARD",
  "GAMING_STATIONS",
  "GAMING_SESSIONS",
  "GAMING_BOOKINGS",
  "GAMING_PRICING_PACKAGES",
  "GAMING_CHECKOUT",
  "GAMING_DAILY_CLOSE",
  "GAMING_TOURNAMENTS",
  "GAMING_REPORTS",
]);

export function getEnterpriseWorkspaceArchetype(definition: EnterpriseModuleDefinition): EnterpriseWorkspaceArchetype {
  if (definition.routeKind === "AI_SERVICE") return "AI_IMMERSIVE";
  if (definition.routeKind === "ADMIN_SECTION" || definition.domain === "ADMINISTRATION") return "ADMINISTRATION_GOVERNANCE";
  if (INTEGRATED_SUITE_CODES.has(definition.code)) return "INTEGRATED_BUSINESS_SUITE";
  if (TRANSACTIONAL_CODES.has(definition.code)) return "TRANSACTIONAL_WORKSPACE";
  return "STANDARD_PROFESSIONAL_ERP";
}

export function isEnterpriseWorkspaceArchetype(value: string): value is EnterpriseWorkspaceArchetype {
  return (ENTERPRISE_WORKSPACE_ARCHETYPES as readonly string[]).includes(value);
}
