import type { SaasPlanCode } from "@/lib/billing/plans";

export type SaasFeatureCode =
  | "support"
  | "collaborators"
  | "collaboration-calls"
  | "calendar"
  | "enterprise-admin"
  | "enterprise-activities"
  | "enterprise-workflows"
  | "healthcare";

export type FeatureEntitlement = {
  feature: SaasFeatureCode;
  requiredPlan: SaasPlanCode;
  requiresActiveSubscription: boolean;
  label: string;
};

export const FEATURE_ENTITLEMENTS: Record<SaasFeatureCode, FeatureEntitlement> = {
  support: {
    feature: "support",
    requiredPlan: "STARTER",
    requiresActiveSubscription: false,
    label: "Support DTSC",
  },
  collaborators: {
    feature: "collaborators",
    requiredPlan: "STARTER",
    requiresActiveSubscription: false,
    label: "Mes collaborateurs",
  },
  "collaboration-calls": {
    feature: "collaboration-calls",
    requiredPlan: "BUSINESS",
    requiresActiveSubscription: true,
    label: "Appels collaboratifs",
  },
  calendar: {
    feature: "calendar",
    requiredPlan: "BUSINESS",
    requiresActiveSubscription: true,
    label: "Calendrier interne",
  },
  "enterprise-admin": {
    feature: "enterprise-admin",
    requiredPlan: "BUSINESS",
    requiresActiveSubscription: true,
    label: "Administration entreprise",
  },
  "enterprise-activities": {
    feature: "enterprise-activities",
    requiredPlan: "BUSINESS",
    requiresActiveSubscription: true,
    label: "Activités entreprise",
  },
  "enterprise-workflows": {
    feature: "enterprise-workflows",
    requiredPlan: "BUSINESS",
    requiresActiveSubscription: true,
    label: "Workflows entreprise",
  },
  healthcare: {
    feature: "healthcare",
    requiredPlan: "ENTERPRISE",
    requiresActiveSubscription: true,
    label: "Modules santé avancés",
  },
};

const CORE_MODULES = new Set([
  "ADMIN_DASHBOARD",
  "COLLABORATORS_POSITIONS",
  "DEPARTMENTS",
  "PERMISSIONS",
  "INTERNAL_REQUESTS",
  "REPORTS",
  "DOCUMENTS",
  "SETTINGS",
]);

const BUSINESS_MODULES = new Set([
  "TASKS_OPERATIONS",
  "MEETINGS",
  "FINANCE_BUDGETS",
  "SUPPLIERS_PURCHASES",
  "WORKFLOWS",
  "AUDIT_LOGS",
  "AI_ASSISTANT",
  "INTERNAL_CALENDAR",
]);

const ENTERPRISE_MODULES = new Set([
  "PATIENTS",
  "APPOINTMENTS",
  "CONSULTATIONS",
  "MEDICAL_RECORDS",
  "CARE_TEAM",
  "LABORATORY",
  "INTERNAL_PHARMACY",
  "MEDICAL_BILLING",
  "INSURANCE_COVERAGE",
  "QUALITY_INCIDENTS",
  "MEDICAL_DOCUMENTS",
  "MEDICAL_CONFIDENTIALITY",
  "HEALTH_SETTINGS",
  "HEALTH_REPORTS",
  "MEDICINES_PRODUCTS",
  "BATCH_EXPIRY",
  "STOCK_INVENTORY",
  "STOCK_RECEIPTS",
  "SALES_DISPENSATION",
  "PRESCRIPTIONS",
  "SUPPLIERS_ORDERS",
  "CASH_INVOICES_PAYMENTS",
  "RETURNS_ADJUSTMENTS_LOSSES",
  "ALERTS_EXPIRY_LOW_STOCK",
  "QUALITY_PHARMACOVIGILANCE",
  "PHARMACY_DOCUMENTS",
  "PHARMACY_REPORTS",
  "PHARMACY_SETTINGS",
]);

export function requiredPlanForModule(moduleCode: string, fallbackRequiredPlan?: SaasPlanCode | null): SaasPlanCode {
  if (fallbackRequiredPlan) {
    return fallbackRequiredPlan;
  }
  if (ENTERPRISE_MODULES.has(moduleCode)) {
    return "ENTERPRISE";
  }
  if (BUSINESS_MODULES.has(moduleCode)) {
    return "BUSINESS";
  }
  if (CORE_MODULES.has(moduleCode)) {
    return "STARTER";
  }
  return "BUSINESS";
}

export function moduleRequiresActiveSubscription(moduleCode: string, requiredPlan: SaasPlanCode) {
  if (requiredPlan === "STARTER") {
    return !CORE_MODULES.has(moduleCode);
  }
  return true;
}
