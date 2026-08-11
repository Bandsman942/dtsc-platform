import { getSaasPlanLabel, resolveSaasPlanCode, type SaasPlanCode } from "@/lib/billing/plans";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export type CommercialAudience = "PERSONAL" | "ORGANIZATION" | "BOTH";

export type CommercialOfferSnapshot = {
  id: string;
  name: string;
  slug: string;
  audience: CommercialAudience;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxDocuments: number;
};

export type EffectiveCommercialContext = {
  scope: "PERSONAL" | "ORGANIZATION" | "DTSC_INTERNAL";
  organizationId: string | null;
  organizationStatus: string | null;
  organizationType: string | null;
  sectorCode: string | null;
  offer: CommercialOfferSnapshot | null;
  capabilityCode: SaasPlanCode;
  capabilityLabel: string;
  subscriptionId: string | null;
  subscriptionStatus: string;
  subscriptionActive: boolean;
  startedAt: Date | null;
  expiresAt: Date | null;
  trialEndsAt: Date | null;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxDocuments: number;
  source:
    | "DTSC_INTERNAL"
    | "ORGANIZATION_SUBSCRIPTION"
    | "ORGANIZATION_LEGACY_MAPPED"
    | "ORGANIZATION_BASELINE"
    | "PERSONAL_SUBSCRIPTION"
    | "FREEMIUM_PLAN"
    | "LEGACY_USER_FALLBACK";
  legacySourceOfferId: string | null;
};

const LEGACY_ORGANIZATION_OFFER_TARGETS: Record<string, string> = {
  freemium: "org-starter",
  starter: "org-starter",
  growth: "org-growth",
  premium: "org-premium",
};

function normalizeAudience(value: string | null | undefined): CommercialAudience | null {
  if (value === "PERSONAL" || value === "ORGANIZATION" || value === "BOTH") return value;
  return null;
}

function snapshotOffer(plan: {
  id: string;
  name: string;
  slug: string;
  audience: string;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxDocuments: number;
}): CommercialOfferSnapshot | null {
  const audience = normalizeAudience(plan.audience);
  if (!audience) return null;
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    audience,
    dailyMessageLimit: plan.dailyMessageLimit,
    dailyTokenLimit: plan.dailyTokenLimit,
    maxDocuments: plan.maxDocuments,
  };
}

function organizationSubscriptionActive(
  subscription: { status: string; expiresAt: Date | null; trialEndsAt: Date | null } | null,
  organizationStatus: string,
  hasValidOffer: boolean,
  now = new Date(),
) {
  if (!hasValidOffer || organizationStatus !== "ACTIVE" || !subscription) return false;
  if (subscription.status !== "ACTIVE" && subscription.status !== "TRIAL") return false;
  if (subscription.status === "TRIAL" && subscription.trialEndsAt && subscription.trialEndsAt.getTime() < now.getTime()) return false;
  return !subscription.expiresAt || subscription.expiresAt.getTime() >= now.getTime();
}

function personalSubscriptionActive(subscription: { status: string; currentPeriodEnd: Date | null } | null, now = new Date()) {
  if (!subscription || subscription.status !== "ACTIVE") return false;
  return !subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() >= now.getTime();
}

function legacyOrganizationTarget(plan: { id: string; slug: string } | null | undefined) {
  if (!plan) return null;
  return LEGACY_ORGANIZATION_OFFER_TARGETS[plan.id] || LEGACY_ORGANIZATION_OFFER_TARGETS[plan.slug] || null;
}

export async function resolveOrganizationCommercialContext(
  organizationId: string | null | undefined,
): Promise<EffectiveCommercialContext | null> {
  if (!organizationId) return null;

  if (organizationId === DTSC_INTERNAL_ORGANIZATION_ID) {
    return {
      scope: "DTSC_INTERNAL",
      organizationId,
      organizationStatus: "ACTIVE",
      organizationType: "DTSC_INTERNAL",
      sectorCode: null,
      offer: null,
      capabilityCode: "ENTERPRISE",
      capabilityLabel: getSaasPlanLabel("ENTERPRISE", "fr"),
      subscriptionId: null,
      subscriptionStatus: "ACTIVE",
      subscriptionActive: true,
      startedAt: null,
      expiresAt: null,
      trialEndsAt: null,
      dailyMessageLimit: 0,
      dailyTokenLimit: 0,
      maxDocuments: 0,
      source: "DTSC_INTERNAL",
      legacySourceOfferId: null,
    };
  }

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null, organizationType: "CLIENT" },
    select: {
      id: true,
      status: true,
      organizationType: true,
      sectorCode: true,
      subscriptions: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        include: { plan: true },
      },
    },
  });
  if (!organization) return null;

  const subscription = organization.subscriptions[0] || null;
  let offer = subscription?.plan?.isActive && (subscription.plan.audience === "ORGANIZATION" || subscription.plan.audience === "BOTH")
    ? snapshotOffer(subscription.plan)
    : null;
  let source: EffectiveCommercialContext["source"] = offer ? "ORGANIZATION_SUBSCRIPTION" : "ORGANIZATION_BASELINE";
  let legacySourceOfferId: string | null = null;

  if (!offer && subscription?.plan?.isActive) {
    const target = legacyOrganizationTarget(subscription.plan);
    if (target) {
      const mappedPlan = await prisma.billingPlan.findFirst({
        where: {
          isActive: true,
          audience: { in: ["ORGANIZATION", "BOTH"] },
          OR: [{ id: target }, { slug: target }],
        },
        orderBy: { sortOrder: "asc" },
      });
      if (mappedPlan) {
        offer = snapshotOffer(mappedPlan);
        source = "ORGANIZATION_LEGACY_MAPPED";
        legacySourceOfferId = subscription.plan.id;
      }
    }
  }

  const capabilityCode = offer ? resolveSaasPlanCode(offer) : "STARTER";
  const subscriptionActive = organizationSubscriptionActive(subscription, organization.status, Boolean(offer));

  return {
    scope: "ORGANIZATION",
    organizationId: organization.id,
    organizationStatus: organization.status,
    organizationType: organization.organizationType,
    sectorCode: organization.sectorCode,
    offer,
    capabilityCode,
    capabilityLabel: getSaasPlanLabel(capabilityCode, "fr"),
    subscriptionId: subscription?.id || null,
    subscriptionStatus: subscription?.status || "MISSING",
    subscriptionActive,
    startedAt: subscription?.startedAt || null,
    expiresAt: subscription?.expiresAt || null,
    trialEndsAt: subscription?.trialEndsAt || null,
    dailyMessageLimit: offer?.dailyMessageLimit ?? 0,
    dailyTokenLimit: offer?.dailyTokenLimit ?? 0,
    maxDocuments: offer?.maxDocuments ?? 0,
    source,
    legacySourceOfferId,
  };
}

export async function resolvePersonalCommercialContext(userId: string): Promise<EffectiveCommercialContext> {
  const [subscription, freemium, legacyUser] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: new Date() } }],
        plan: { isActive: true, audience: { in: ["PERSONAL", "BOTH"] } },
      },
      include: { plan: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.billingPlan.findFirst({
      where: { slug: "freemium", isActive: true, audience: { in: ["PERSONAL", "BOTH"] } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { dailyMessageLimit: true, dailyTokenLimit: true },
    }),
  ]);

  const activeSubscription = personalSubscriptionActive(subscription);
  const selectedPlan = activeSubscription ? subscription?.plan || null : freemium;
  const offer = selectedPlan ? snapshotOffer(selectedPlan) : null;
  const capabilityCode = offer ? resolveSaasPlanCode(offer) : "STARTER";

  return {
    scope: "PERSONAL",
    organizationId: null,
    organizationStatus: null,
    organizationType: null,
    sectorCode: null,
    offer,
    capabilityCode,
    capabilityLabel: getSaasPlanLabel(capabilityCode, "fr"),
    subscriptionId: activeSubscription ? subscription?.id || null : null,
    subscriptionStatus: activeSubscription ? subscription?.status || "ACTIVE" : offer ? "FREE" : "LEGACY_FALLBACK",
    subscriptionActive: true,
    startedAt: activeSubscription ? subscription?.currentPeriodStart || null : null,
    expiresAt: activeSubscription ? subscription?.currentPeriodEnd || null : null,
    trialEndsAt: null,
    dailyMessageLimit: offer?.dailyMessageLimit ?? legacyUser?.dailyMessageLimit ?? 5,
    dailyTokenLimit: offer?.dailyTokenLimit ?? legacyUser?.dailyTokenLimit ?? 15_000,
    maxDocuments: offer?.maxDocuments ?? 0,
    source: activeSubscription ? "PERSONAL_SUBSCRIPTION" : offer ? "FREEMIUM_PLAN" : "LEGACY_USER_FALLBACK",
    legacySourceOfferId: null,
  };
}
