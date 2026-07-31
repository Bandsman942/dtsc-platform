import type { SaasPlanCode } from "@/lib/billing/plans";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

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

export function requiredPlanForModule(moduleCode: string, fallbackRequiredPlan?: SaasPlanCode | null): SaasPlanCode {
  if (fallbackRequiredPlan) {
    return fallbackRequiredPlan;
  }
  return getEnterpriseModuleDefinition(moduleCode)?.minimumPlan || "BUSINESS";
}

export function moduleRequiresActiveSubscription(moduleCode: string, requiredPlan: SaasPlanCode) {
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (definition) {
    return definition.requiresActiveSubscription;
  }
  return requiredPlan !== "STARTER";
}
