import { resolveOrganizationCommercialContext, resolvePersonalCommercialContext } from "@/lib/billing/commercial-context";
import { getSaasPlanLabel, type SaasPlanCode } from "@/lib/billing/plans";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export type CanonicalAiUsageLimits = {
  planId: string | null;
  planName: string;
  planSlug: string | null;
  planCode: SaasPlanCode;
  capabilityLabel: string;
  audience: "PERSONAL" | "ORGANIZATION";
  subscriptionStatus: string;
  subscriptionActive: boolean;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxDocuments: number;
  source:
    | "DTSC_INTERNAL_USER_LIMITS"
    | "ORGANIZATION_SUBSCRIPTION"
    | "ORGANIZATION_LEGACY_MAPPED"
    | "ORGANIZATION_BASELINE"
    | "PERSONAL_SUBSCRIPTION"
    | "FREEMIUM_PLAN"
    | "LEGACY_USER_FALLBACK";
};

export async function getCanonicalAiUsageLimits({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId?: string | null;
}): Promise<CanonicalAiUsageLimits> {
  if (organizationId === DTSC_INTERNAL_ORGANIZATION_ID) {
    const internalUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { dailyMessageLimit: true, dailyTokenLimit: true },
    });
    return {
      planId: null,
      planName: "DTSC Internal",
      planSlug: null,
      planCode: "ENTERPRISE",
      capabilityLabel: getSaasPlanLabel("ENTERPRISE", "fr"),
      audience: "ORGANIZATION",
      subscriptionStatus: "ACTIVE",
      subscriptionActive: true,
      dailyMessageLimit: internalUser?.dailyMessageLimit ?? 5,
      dailyTokenLimit: internalUser?.dailyTokenLimit ?? 15_000,
      maxDocuments: 0,
      source: "DTSC_INTERNAL_USER_LIMITS",
    };
  }

  if (organizationId) {
    const commercialContext = await resolveOrganizationCommercialContext(organizationId);
    if (!commercialContext?.offer) {
      return {
        planId: null,
        planName: "Aucune offre organisation active",
        planSlug: null,
        planCode: commercialContext?.capabilityCode || "STARTER",
        capabilityLabel: commercialContext?.capabilityLabel || getSaasPlanLabel("STARTER", "fr"),
        audience: "ORGANIZATION",
        subscriptionStatus: commercialContext?.subscriptionStatus || "MISSING",
        subscriptionActive: false,
        dailyMessageLimit: 0,
        dailyTokenLimit: 0,
        maxDocuments: 0,
        source: "ORGANIZATION_BASELINE",
      };
    }
    return {
      planId: commercialContext.offer.id,
      planName: commercialContext.offer.name,
      planSlug: commercialContext.offer.slug,
      planCode: commercialContext.capabilityCode,
      capabilityLabel: commercialContext.capabilityLabel,
      audience: "ORGANIZATION",
      subscriptionStatus: commercialContext.subscriptionStatus,
      subscriptionActive: commercialContext.subscriptionActive,
      dailyMessageLimit: commercialContext.dailyMessageLimit,
      dailyTokenLimit: commercialContext.dailyTokenLimit,
      maxDocuments: commercialContext.maxDocuments,
      source: commercialContext.source === "ORGANIZATION_LEGACY_MAPPED" ? "ORGANIZATION_LEGACY_MAPPED" : "ORGANIZATION_SUBSCRIPTION",
    };
  }

  const commercialContext = await resolvePersonalCommercialContext(userId);
  return {
    planId: commercialContext.offer?.id || null,
    planName: commercialContext.offer?.name || "Legacy fallback",
    planSlug: commercialContext.offer?.slug || null,
    planCode: commercialContext.capabilityCode,
    capabilityLabel: commercialContext.capabilityLabel,
    audience: "PERSONAL",
    subscriptionStatus: commercialContext.subscriptionStatus,
    subscriptionActive: commercialContext.subscriptionActive,
    dailyMessageLimit: commercialContext.dailyMessageLimit,
    dailyTokenLimit: commercialContext.dailyTokenLimit,
    maxDocuments: commercialContext.maxDocuments,
    source: commercialContext.source === "PERSONAL_SUBSCRIPTION"
      ? "PERSONAL_SUBSCRIPTION"
      : commercialContext.source === "FREEMIUM_PLAN"
        ? "FREEMIUM_PLAN"
        : "LEGACY_USER_FALLBACK",
  };
}
