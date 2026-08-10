import { resolveSaasPlanCode, type SaasPlanCode } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";

const ACTIVE_ORGANIZATION_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIAL"];

export type CanonicalAiUsageLimits = {
  planId: string | null;
  planName: string;
  planCode: SaasPlanCode;
  audience: "PERSONAL" | "ORGANIZATION";
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxDocuments: number;
  source: "ORGANIZATION_SUBSCRIPTION" | "PERSONAL_SUBSCRIPTION" | "FREEMIUM_PLAN" | "LEGACY_USER_FALLBACK";
};

export async function getCanonicalAiUsageLimits({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId?: string | null;
}): Promise<CanonicalAiUsageLimits> {
  if (organizationId) {
    const organizationSubscription = await prisma.organizationSubscription.findFirst({
      where: {
        organizationId,
        status: { in: ACTIVE_ORGANIZATION_SUBSCRIPTION_STATUSES },
        plan: { isActive: true, audience: { in: ["ORGANIZATION", "BOTH"] } },
      },
      include: { plan: true },
      orderBy: { updatedAt: "desc" },
    });
    if (organizationSubscription) {
      return fromPlan(organizationSubscription.plan, "ORGANIZATION", "ORGANIZATION_SUBSCRIPTION");
    }
  }

  const personalSubscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      plan: { isActive: true, audience: { in: ["PERSONAL", "BOTH"] } },
    },
    include: { plan: true },
    orderBy: { updatedAt: "desc" },
  });
  if (personalSubscription) {
    return fromPlan(personalSubscription.plan, "PERSONAL", "PERSONAL_SUBSCRIPTION");
  }

  const freemium = await prisma.billingPlan.findFirst({
    where: { slug: "freemium", isActive: true, audience: { in: ["PERSONAL", "BOTH"] } },
    orderBy: { sortOrder: "asc" },
  });
  if (freemium) return fromPlan(freemium, "PERSONAL", "FREEMIUM_PLAN");

  const legacyUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyMessageLimit: true, dailyTokenLimit: true },
  });
  return {
    planId: null,
    planName: "Legacy fallback",
    planCode: "STARTER",
    audience: "PERSONAL",
    dailyMessageLimit: legacyUser?.dailyMessageLimit || 5,
    dailyTokenLimit: legacyUser?.dailyTokenLimit || 15_000,
    maxDocuments: 0,
    source: "LEGACY_USER_FALLBACK",
  };
}

function fromPlan(
  plan: { id: string; name: string; slug?: string | null; dailyMessageLimit: number; dailyTokenLimit: number; maxDocuments: number },
  audience: CanonicalAiUsageLimits["audience"],
  source: CanonicalAiUsageLimits["source"],
): CanonicalAiUsageLimits {
  return {
    planId: plan.id,
    planName: plan.name,
    planCode: resolveSaasPlanCode(plan),
    audience,
    dailyMessageLimit: plan.dailyMessageLimit,
    dailyTokenLimit: plan.dailyTokenLimit,
    maxDocuments: plan.maxDocuments,
    source,
  };
}
