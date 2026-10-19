import { Prisma } from "@prisma/client";
import { canUseModule } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { resolveEnterpriseIdentityRelationshipAccess } from "@/lib/enterprise/identity-links/access";
import {
  calculateRetailRelationshipDiscount,
  evaluateRelationshipBenefitSnapshot,
  type RelationshipBenefitExecutionContext,
} from "@/lib/enterprise/relationship-benefits/enforcement";

export type GamingRelationshipBenefitEffect = {
  benefitId: string;
  benefitCode: string;
  identityLinkId: string;
  userId: string;
  businessPartyId: string;
  currencyCode: string;
  eligibleAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  context: RelationshipBenefitExecutionContext;
};

export function automaticGamingEffectSupported(benefit: {
  targetModuleCode: string | null;
  benefitType: string;
  valueType: string;
  valueDecimal: Prisma.Decimal | null;
  actionCode?: string | null;
}) {
  if (benefit.targetModuleCode !== "GAMING_CHECKOUT") return false;
  if (benefit.actionCode && benefit.actionCode !== "NONE") return false;
  if (!benefit.valueDecimal || benefit.valueDecimal.lte(0)) return false;
  return benefit.benefitType === "DISCOUNT" && ["PERCENT", "AMOUNT"].includes(benefit.valueType)
    || benefit.benefitType === "FIXED_PRICE" && benefit.valueType === "AMOUNT";
}

/**
 * Runs inside the serializable Gaming checkout transaction.
 * Only one discount may apply: no unreviewed stacking, no extra item/tax discount.
 * Quota is re-evaluated while holding the same advisory lock as Retail POS.
 */
export async function resolveGamingRelationshipBenefitTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  businessPartyId: string;
  currencyCode: string;
  sessionServiceAmount: Prisma.Decimal;
  serviceCatalogItemId: string;
  siteId?: string | null;
}) {
  if (args.sessionServiceAmount.lte(0)) return null;
  const [benefitsEntitlement, gamingEntitlement] = await Promise.all([
    canUseModule(args.organizationId, "RELATIONSHIP_BENEFITS"),
    canUseModule(args.organizationId, "GAMING_CHECKOUT"),
  ]);
  if (!benefitsEntitlement.allowed || !gamingEntitlement.allowed) return null;
  const enabledModules = await args.tx.enterpriseModule.findMany({
    where: { organizationId: args.organizationId, moduleCode: { in: ["RELATIONSHIP_BENEFITS", "GAMING_CHECKOUT"] }, isEnabled: true },
    select: { moduleCode: true },
  });
  if (enabledModules.length !== 2) return null;

  const refs = await args.tx.enterprisePersonBusinessReference.findMany({
    where: { organizationId: args.organizationId, businessPartyId: args.businessPartyId, archivedAt: null, status: "ACTIVE" },
    select: { personIdentityId: true },
    take: 100,
  });
  const personIds = [...new Set(refs.map((ref) => ref.personIdentityId))];
  if (!personIds.length) return null;

  const links = await args.tx.enterpriseIdentityLink.findMany({
    where: {
      organizationId: args.organizationId,
      personIdentityId: { in: personIds },
      status: "ACTIVE",
      userId: { not: null },
      activatedAt: { not: null },
      userDecisionAt: { not: null },
      organizationDecisionAt: { not: null },
    },
    select: {
      id: true, userId: true, personIdentityId: true, requestedRelationType: true,
      requestedRoleCode: true, status: true, activatedAt: true, userDecisionAt: true, organizationDecisionAt: true,
    },
    orderBy: { activatedAt: "asc" },
    take: 40,
  });
  if (!links.length) return null;
  const access = await Promise.all(links.map(async (link) => ({
    link,
    authorized: Boolean(link.userId && (
      await resolveEnterpriseIdentityRelationshipAccess({
        organizationId: args.organizationId,
        identityLinkId: link.id,
        userId: link.userId,
      })
    ).capabilities.includes("ENTERPRISE_BENEFITS")),
  })));
  const eligible = access.filter((item) => item.authorized && item.link.userId).map((item) => item.link);
  if (!eligible.length) return null;

  const now = new Date();
  const benefits = (await args.tx.enterpriseRelationshipBenefit.findMany({
    where: {
      organizationId: args.organizationId, status: "ACTIVE", archivedAt: null, targetModuleCode: "GAMING_CHECKOUT",
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    include: { audiences: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  })).filter(automaticGamingEffectSupported);
  if (!benefits.length) return null;

  const linkIds = eligible.map((link) => link.id);
  const benefitIds = benefits.map((benefit) => benefit.id);
  const context: RelationshipBenefitExecutionContext = {
    moduleCode: "GAMING_CHECKOUT",
    transactionAmount: Number(args.sessionServiceAmount),
    currencyCode: args.currencyCode,
    businessPartyId: args.businessPartyId,
    siteId: args.siteId || null,
    channelCode: "GAMING",
    catalogItemIds: [args.serviceCatalogItemId],
    categoryIds: [],
    quantity: 1,
    occurredAt: now.toISOString(),
  };

  const assignments = await args.tx.enterpriseRelationshipBenefitAssignment.findMany({
    where: { organizationId: args.organizationId, benefitId: { in: benefitIds }, identityLinkId: { in: linkIds } },
    select: { benefitId: true, identityLinkId: true, status: true, startsAt: true, endsAt: true },
    take: 1000,
  });
  const assignmentByKey = new Map(assignments.map((assignment) => [`${assignment.benefitId}:${assignment.identityLinkId}`, assignment]));

  // Quota correctness is decided under the advisory lock below, not by this initial order.
  const candidates = benefits.flatMap((benefit) => eligible.flatMap((link) => {
    if (!link.userId || !benefit.valueDecimal) return [];
    const discount = calculateRetailRelationshipDiscount({
      benefitType: benefit.benefitType,
      valueType: benefit.valueType,
      valueDecimal: benefit.valueDecimal,
      eligibleAmount: args.sessionServiceAmount,
    });
    // A zero-amount service invoice is not supported by the canonical Gaming checkout workflow.
    if (discount.lte(0) || discount.gte(args.sessionServiceAmount)) return [];
    if (benefit.currencyCode && benefit.currencyCode !== args.currencyCode) return [];
    return [{ benefit, link, discount }];
  })).sort((a, b) =>
    b.discount.comparedTo(a.discount) ||
    a.benefit.id.localeCompare(b.benefit.id) ||
    a.link.id.localeCompare(b.link.id)
  );

  for (const candidate of candidates) {
    const { benefit, link, discount } = candidate;
    const lock = `${args.organizationId}:${link.id}:${benefit.id}`;
    await args.tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lock})::bigint)`);
    const usages = await args.tx.enterpriseRelationshipBenefitUsage.findMany({
      where: {
        organizationId: args.organizationId, identityLinkId: link.id, benefitId: benefit.id,
        userId: link.userId!,
      },
      select: { benefitId: true, status: true, requestedAt: true },
      take: 100000,
    });
    const evaluation = evaluateRelationshipBenefitSnapshot({
      benefit, link, assignment: assignmentByKey.get(`${benefit.id}:${link.id}`) || null,
      usages, context, now, requireBusinessContext: true,
    });
    if (!evaluation.allowed) continue;
    return {
      benefitId: benefit.id,
      benefitCode: benefit.code,
      identityLinkId: link.id,
      userId: link.userId!,
      businessPartyId: args.businessPartyId,
      currencyCode: args.currencyCode,
      eligibleAmount: args.sessionServiceAmount,
      discountAmount: discount,
      context,
    } satisfies GamingRelationshipBenefitEffect;
  }
  return null;
}

export async function applyGamingRelationshipBenefitTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  actorUserId: string;
  checkoutId: string;
  effect: GamingRelationshipBenefitEffect;
}) {
  const { effect } = args;
  const effectIdempotencyKey = `gaming-checkout:${args.checkoutId}:relationship-benefit:${effect.benefitId}`;
  const existing = await args.tx.enterpriseRelationshipBenefitUsage.findUnique({
    where: { organizationId_effectIdempotencyKey: { organizationId: args.organizationId, effectIdempotencyKey } },
  });
  if (existing) {
    if (existing.identityLinkId !== effect.identityLinkId || existing.benefitId !== effect.benefitId
      || existing.userId !== effect.userId || existing.effectEntityId !== args.checkoutId) {
      throw new Error("GAMING_RELATIONSHIP_BENEFIT_IDEMPOTENCY_CONFLICT");
    }
    return existing;
  }
  // Checkout, invoice, discount and the canonical usage are committed or rolled back together.
  const now = new Date();
  return args.tx.enterpriseRelationshipBenefitUsage.create({
    data: {
      organizationId: args.organizationId,
      benefitId: effect.benefitId,
      identityLinkId: effect.identityLinkId,
      userId: effect.userId,
      actionCode: "CLAIM",
      status: "APPROVED",
      idempotencyKey: effectIdempotencyKey,
      executionMode: "AUTO_GAMING",
      effectModuleCode: "GAMING_CHECKOUT",
      effectEntityType: "EnterpriseGamingCheckout",
      effectEntityId: args.checkoutId,
      effectAmount: effect.discountAmount,
      effectCurrencyCode: effect.currencyCode,
      effectIdempotencyKey,
      effectMetadataJson: {
        businessPartyId: effect.businessPartyId,
        benefitCode: effect.benefitCode,
        eligibleAmount: effect.eligibleAmount.toFixed(),
      },
      requestedAt: now,
      decidedAt: now,
      consumedAt: null,
      executedAt: null,
      decidedByUserId: args.actorUserId,
    },
  });
}

/** A Gaming usage becomes consumed only after the canonical sales invoice has been issued. */
export async function finalizeGamingRelationshipBenefitTx(args: {
  organizationId: string;
  checkoutId: string;
}) {
  const now = new Date();
  return prisma.enterpriseRelationshipBenefitUsage.updateMany({
    where: {
      organizationId: args.organizationId,
      effectModuleCode: "GAMING_CHECKOUT",
      effectEntityType: "EnterpriseGamingCheckout",
      effectEntityId: args.checkoutId,
      executionMode: "AUTO_GAMING",
      status: "APPROVED",
    },
    data: { status: "CONSUMED", consumedAt: now, executedAt: now, revision: { increment: 1 } },
  });
}

export async function reverseGamingRelationshipBenefitTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  checkoutId: string;
}) {
  return args.tx.enterpriseRelationshipBenefitUsage.updateMany({
    where: {
      organizationId: args.organizationId,
      effectModuleCode: "GAMING_CHECKOUT",
      effectEntityType: "EnterpriseGamingCheckout",
      effectEntityId: args.checkoutId,
      executionMode: "AUTO_GAMING",
      status: { in: ["APPROVED", "CONSUMED"] },
    },
    data: { status: "CANCELLED", cancelledAt: new Date(), revision: { increment: 1 } },
  });
}
