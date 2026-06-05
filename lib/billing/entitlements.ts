import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { FEATURE_ENTITLEMENTS, moduleRequiresActiveSubscription, requiredPlanForModule, type SaasFeatureCode } from "@/lib/billing/module-entitlements";
import { getPlanUsageLimits, type OrganizationUsageLimits } from "@/lib/billing/plan-limits";
import { normalizePlanRequirement, planMeetsRequirement, resolveSaasPlanCode, SAAS_PLANS, type SaasPlanCode } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";

export type EntitlementDecision = {
  allowed: boolean;
  code: "OK" | "ORGANIZATION_INACTIVE" | "SUBSCRIPTION_REQUIRED" | "PLAN_REQUIRED" | "MODULE_DISABLED" | "MODULE_NOT_FOUND";
  message: string;
  requiredPlan?: SaasPlanCode;
};

export type OrganizationEntitlements = {
  organizationId: string;
  organizationStatus: string;
  organizationType: string;
  isDtscInternal: boolean;
  planCode: SaasPlanCode;
  planLabel: string;
  subscriptionStatus: string;
  subscriptionActive: boolean;
  subscriptionId: string | null;
  trialEndsAt: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  limits: OrganizationUsageLimits;
  modules: Array<{
    id: string;
    moduleCode: string;
    isEnabled: boolean;
    isCore: boolean;
    requiredPlan: SaasPlanCode;
    includedInPlan: boolean;
    allowed: boolean;
    code: EntitlementDecision["code"];
    message: string;
  }>;
};

export class SaasEntitlementError extends Error {
  status: number;
  code: EntitlementDecision["code"];

  constructor(decision: EntitlementDecision) {
    super(decision.message);
    this.name = "SaasEntitlementError";
    this.status = decision.code === "SUBSCRIPTION_REQUIRED" || decision.code === "PLAN_REQUIRED" ? 402 : 403;
    this.code = decision.code;
  }
}

function activeSubscriptionStatus(status?: string | null) {
  return status === "ACTIVE" || status === "TRIAL";
}

function subscriptionDateValid(subscription?: { expiresAt?: Date | null; trialEndsAt?: Date | null; status?: string | null } | null, now = new Date()) {
  if (!subscription || !activeSubscriptionStatus(subscription.status)) {
    return false;
  }
  if (subscription.status === "TRIAL" && subscription.trialEndsAt && subscription.trialEndsAt.getTime() < now.getTime()) {
    return false;
  }
  return !subscription.expiresAt || subscription.expiresAt.getTime() >= now.getTime();
}

function inactiveOrganizationMessage(status: string) {
  return status === "SUSPENDED"
    ? "Votre espace est suspendu. Le support reste disponible pour régulariser l'accès."
    : "Votre espace n'est pas actif. Contactez DTSC pour finaliser l'activation.";
}

function subscriptionRequiredMessage(label: string) {
  return `${label} nécessite un abonnement actif. Vérifiez votre statut dans votre espace ou contactez le support DTSC.`;
}

function planRequiredMessage(label: string, requiredPlan: SaasPlanCode) {
  return `${label} nécessite le plan ${SAAS_PLANS[requiredPlan].label} ou supérieur.`;
}

export function isSubscriptionActive(subscription?: { status?: string | null; expiresAt?: Date | string | null; trialEndsAt?: Date | string | null } | null) {
  if (!subscription || !activeSubscriptionStatus(subscription.status)) {
    return false;
  }
  const expiresAt = typeof subscription.expiresAt === "string" ? new Date(subscription.expiresAt) : subscription.expiresAt;
  const trialEndsAt = typeof subscription.trialEndsAt === "string" ? new Date(subscription.trialEndsAt) : subscription.trialEndsAt;
  return subscriptionDateValid({ status: subscription.status, expiresAt, trialEndsAt });
}

export async function getOrganizationEntitlements(organizationId: string | null | undefined): Promise<OrganizationEntitlements | null> {
  if (!organizationId) {
    return null;
  }

  if (organizationId === DTSC_INTERNAL_ORGANIZATION_ID) {
    return {
      organizationId,
      organizationStatus: "ACTIVE",
      organizationType: "INTERNAL",
      isDtscInternal: true,
      planCode: "ENTERPRISE",
      planLabel: SAAS_PLANS.ENTERPRISE.label,
      subscriptionStatus: "ACTIVE",
      subscriptionActive: true,
      subscriptionId: null,
      trialEndsAt: null,
      startedAt: null,
      expiresAt: null,
      limits: getPlanUsageLimits("ENTERPRISE"),
      modules: [],
    };
  }

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: {
      id: true,
      status: true,
      organizationType: true,
      subscriptions: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        include: { plan: { select: { id: true, slug: true, name: true } } },
      },
      enterpriseModules: {
        select: { id: true, moduleCode: true, isEnabled: true, isCore: true, requiresPlanLevel: true },
      },
    },
  });

  if (!organization) {
    return null;
  }

  const subscription = organization.subscriptions[0] || null;
  const planCode = resolveSaasPlanCode(subscription?.plan);
  const subscriptionActive = organization.status === "ACTIVE" && subscriptionDateValid(subscription);
  const limits = getPlanUsageLimits(planCode);
  const modules = organization.enterpriseModules.map((enterpriseModule) => {
    const requiredPlan = requiredPlanForModule(enterpriseModule.moduleCode, normalizePlanRequirement(enterpriseModule.requiresPlanLevel));
    const includedInPlan = planMeetsRequirement(planCode, requiredPlan);
    const requiresActiveSubscription = moduleRequiresActiveSubscription(enterpriseModule.moduleCode, requiredPlan);
    const decision = decideAccess({
      label: enterpriseModule.moduleCode,
      organizationStatus: organization.status,
      planCode,
      subscriptionActive,
      requiredPlan,
      requiresActiveSubscription,
      enabled: enterpriseModule.isEnabled,
    });
    return {
      id: enterpriseModule.id,
      moduleCode: enterpriseModule.moduleCode,
      isEnabled: enterpriseModule.isEnabled,
      isCore: enterpriseModule.isCore,
      requiredPlan,
      includedInPlan,
      allowed: decision.allowed,
      code: decision.code,
      message: decision.message,
    };
  });

  return {
    organizationId: organization.id,
    organizationStatus: organization.status,
    organizationType: organization.organizationType,
    isDtscInternal: false,
    planCode,
    planLabel: SAAS_PLANS[planCode].label,
    subscriptionStatus: subscription?.status || "MISSING",
    subscriptionActive,
    subscriptionId: subscription?.id || null,
    trialEndsAt: subscription?.trialEndsAt?.toISOString() || null,
    startedAt: subscription?.startedAt?.toISOString() || null,
    expiresAt: subscription?.expiresAt?.toISOString() || null,
    limits,
    modules,
  };
}

function decideAccess({
  label,
  organizationStatus,
  planCode,
  subscriptionActive,
  requiredPlan,
  requiresActiveSubscription,
  enabled,
}: {
  label: string;
  organizationStatus: string;
  planCode: SaasPlanCode;
  subscriptionActive: boolean;
  requiredPlan: SaasPlanCode;
  requiresActiveSubscription: boolean;
  enabled?: boolean;
}): EntitlementDecision {
  if (organizationStatus !== "ACTIVE" && label !== FEATURE_ENTITLEMENTS.support.label) {
    return { allowed: false, code: "ORGANIZATION_INACTIVE", message: inactiveOrganizationMessage(organizationStatus), requiredPlan };
  }
  if (!planMeetsRequirement(planCode, requiredPlan)) {
    return { allowed: false, code: "PLAN_REQUIRED", message: planRequiredMessage(label, requiredPlan), requiredPlan };
  }
  if (requiresActiveSubscription && !subscriptionActive) {
    return { allowed: false, code: "SUBSCRIPTION_REQUIRED", message: subscriptionRequiredMessage(label), requiredPlan };
  }
  if (enabled === false) {
    return { allowed: false, code: "MODULE_DISABLED", message: `${label} est désactivé pour cette organisation.`, requiredPlan };
  }
  return { allowed: true, code: "OK", message: "Accès autorisé.", requiredPlan };
}

export async function canUseFeature(organizationId: string | null | undefined, feature: SaasFeatureCode): Promise<EntitlementDecision> {
  const entitlements = await getOrganizationEntitlements(organizationId);
  const entitlement = FEATURE_ENTITLEMENTS[feature];
  if (!entitlements) {
    return { allowed: false, code: "ORGANIZATION_INACTIVE", message: "Aucun espace organisation actif.", requiredPlan: entitlement.requiredPlan };
  }
  if (entitlements.isDtscInternal) {
    return { allowed: true, code: "OK", message: "Accès autorisé.", requiredPlan: entitlement.requiredPlan };
  }
  return decideAccess({
    label: entitlement.label,
    organizationStatus: entitlements.organizationStatus,
    planCode: entitlements.planCode,
    subscriptionActive: entitlements.subscriptionActive,
    requiredPlan: entitlement.requiredPlan,
    requiresActiveSubscription: entitlement.requiresActiveSubscription,
  });
}

export async function canUseModule(organizationId: string | null | undefined, moduleCode: string): Promise<EntitlementDecision> {
  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements) {
    return { allowed: false, code: "ORGANIZATION_INACTIVE", message: "Aucun espace organisation actif." };
  }
  if (entitlements.isDtscInternal) {
    return { allowed: true, code: "OK", message: "Accès autorisé.", requiredPlan: "ENTERPRISE" };
  }
  const enterpriseModule = entitlements.modules.find((item) => item.moduleCode === moduleCode);
  if (!enterpriseModule) {
    return { allowed: false, code: "MODULE_NOT_FOUND", message: "Ce module n'est pas configuré pour cette organisation." };
  }
  return {
    allowed: enterpriseModule.allowed,
    code: enterpriseModule.code,
    message: enterpriseModule.message,
    requiredPlan: enterpriseModule.requiredPlan,
  };
}

export async function assertCanUseModule(organizationId: string | null | undefined, moduleCode: string) {
  const decision = await canUseModule(organizationId, moduleCode);
  if (!decision.allowed) {
    throw new SaasEntitlementError(decision);
  }
  return decision;
}

export async function getOrganizationUsageLimits(organizationId: string | null | undefined): Promise<OrganizationUsageLimits | null> {
  const entitlements = await getOrganizationEntitlements(organizationId);
  return entitlements?.limits || null;
}
