import { Prisma } from "@prisma/client";
import {
  automaticRetailEffectSupported,
  calculateRetailRelationshipDiscount,
  evaluateRelationshipBenefitSnapshot,
} from "@/lib/enterprise/relationship-benefits/enforcement";
import type { RetailRelationshipBenefitEffect } from "@/lib/enterprise/relationship-benefits/retail-adapter";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";

const EFFECT_ENTITY_TYPE = "EnterpriseSalesOrder";
const EXECUTION_MODE = "AUTO_RETAIL_OMNICHANNEL";
const conflict = (code: string) => new EnterpriseRetailError(code, 409);

/**
 * A confirmed order fixes the customer's discounted price, but does not prove
 * delivery. Reserve the quota here; consume only after completed fulfillment.
 * The caller executes this in the same DB transaction as order confirmation.
 */
export async function reserveRetailOmnichannelRelationshipBenefitsTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  actorUserId: string;
  orderId: string;
  sourceSiteId: string;
  effects: RetailRelationshipBenefitEffect[];
  expectedTotal: Prisma.Decimal;
}) {
  if (!args.effects.length) return;

  const order = await args.tx.enterpriseSalesOrder.findFirst({
    where: { id: args.orderId, organizationId: args.organizationId, archivedAt: null },
    select: { id: true, businessPartyId: true, currency: true, totalAmount: true, status: true },
  });
  if (!order || order.status !== "CONFIRMED" || !order.totalAmount.equals(args.expectedTotal)) {
    throw conflict("RELATIONSHIP_BENEFIT_OMNICHANNEL_ORDER_PRICE_MISMATCH");
  }
  const modules = await args.tx.enterpriseModule.findMany({
    where: {
      organizationId: args.organizationId,
      moduleCode: { in: ["RELATIONSHIP_BENEFITS", "RETAIL_POS"] },
      isEnabled: true,
    },
    select: { moduleCode: true },
  });
  const enabled = new Set(modules.map((item) => normalizeEnterpriseModuleCode(item.moduleCode)));
  if (!enabled.has("RELATIONSHIP_BENEFITS") || !enabled.has("RETAIL_POS")) {
    throw conflict("RELATIONSHIP_BENEFIT_OMNICHANNEL_MODULE_DISABLED");
  }

  for (const effect of args.effects) {
    if (
      effect.context.businessPartyId !== order.businessPartyId ||
      effect.context.siteId !== args.sourceSiteId ||
      effect.currencyCode.toUpperCase() !== order.currency.toUpperCase() ||
      effect.context.currencyCode?.toUpperCase() !== order.currency.toUpperCase()
    ) {
      throw conflict("RELATIONSHIP_BENEFIT_OMNICHANNEL_CONTEXT_MISMATCH");
    }
    const effectIdempotencyKey = `retail-order:${order.id}:relationship-benefit:${effect.benefitId}`;
    await args.tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${args.organizationId + ":" + effect.identityLinkId + ":" + effect.benefitId})::bigint)`,
    );
    const existing = await args.tx.enterpriseRelationshipBenefitUsage.findUnique({
      where: {
        organizationId_effectIdempotencyKey: {
          organizationId: args.organizationId,
          effectIdempotencyKey,
        },
      },
    });
    if (existing) {
      if (
        existing.benefitId !== effect.benefitId ||
        existing.identityLinkId !== effect.identityLinkId ||
        existing.userId !== effect.userId ||
        existing.effectEntityId !== order.id ||
        existing.executionMode !== EXECUTION_MODE
      ) throw conflict("RELATIONSHIP_BENEFIT_OMNICHANNEL_IDEMPOTENCY_COLLISION");
      continue;
    }

    const [benefit, link, assignment, usages] = await Promise.all([
      args.tx.enterpriseRelationshipBenefit.findFirst({
        where: { id: effect.benefitId, organizationId: args.organizationId },
        include: { audiences: true },
      }),
      args.tx.enterpriseIdentityLink.findFirst({
        where: { id: effect.identityLinkId, organizationId: args.organizationId, userId: effect.userId },
        select: {
          id: true, userId: true, requestedRelationType: true, requestedRoleCode: true,
          status: true, activatedAt: true, userDecisionAt: true, organizationDecisionAt: true,
          personIdentityId: true,
        },
      }),
      args.tx.enterpriseRelationshipBenefitAssignment.findFirst({
        where: {
          organizationId: args.organizationId,
          benefitId: effect.benefitId,
          identityLinkId: effect.identityLinkId,
        },
        select: { benefitId: true, status: true, startsAt: true, endsAt: true },
      }),
      args.tx.enterpriseRelationshipBenefitUsage.findMany({
        where: {
          organizationId: args.organizationId,
          benefitId: effect.benefitId,
          identityLinkId: effect.identityLinkId,
          userId: effect.userId,
        },
        select: { benefitId: true, status: true, requestedAt: true },
        take: 100000,
      }),
    ]);
    if (!benefit || !link || !automaticRetailEffectSupported(benefit)) {
      throw conflict("RELATIONSHIP_BENEFIT_OMNICHANNEL_EFFECT_UNSUPPORTED");
    }
    const reference = await args.tx.enterprisePersonBusinessReference.findFirst({
      where: {
        organizationId: args.organizationId,
        personIdentityId: link.personIdentityId,
        businessPartyId: order.businessPartyId,
        status: "ACTIVE",
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!reference) throw conflict("RELATIONSHIP_BENEFIT_OMNICHANNEL_PARTY_MISMATCH");

    const evaluation = evaluateRelationshipBenefitSnapshot({
      benefit,
      link,
      assignment,
      usages,
      context: effect.context,
      now: effect.context.occurredAt
        ? new Date(effect.context.occurredAt)
        : new Date(),
      requireBusinessContext: true,
    });
    if (!evaluation.allowed) {
      throw conflict(`RELATIONSHIP_BENEFIT_OMNICHANNEL_${evaluation.code}`);
    }
    const amount = calculateRetailRelationshipDiscount({
      benefitType: benefit.benefitType,
      valueType: benefit.valueType,
      valueDecimal: benefit.valueDecimal!,
      eligibleAmount: effect.eligibleAmount,
    });
    if (effect.amount.lte(0) || effect.eligibleAmount.lte(0) || !amount.equals(effect.amount)) {
      throw conflict("RELATIONSHIP_BENEFIT_OMNICHANNEL_AMOUNT_INVALID");
    }
    await args.tx.enterpriseRelationshipBenefitUsage.create({
      data: {
        organizationId: args.organizationId,
        benefitId: effect.benefitId,
        identityLinkId: effect.identityLinkId,
        userId: effect.userId,
        actionCode: "CLAIM",
        status: "REQUESTED",
        idempotencyKey: effectIdempotencyKey,
        executionMode: EXECUTION_MODE,
        effectModuleCode: "RETAIL_POS",
        effectEntityType: EFFECT_ENTITY_TYPE,
        effectEntityId: order.id,
        effectAmount: effect.amount,
        effectCurrencyCode: effect.currencyCode,
        effectIdempotencyKey,
        effectMetadataJson: {
          businessPartyId: order.businessPartyId,
          siteId: effect.context.siteId || null,
          channelCode: effect.context.channelCode || null,
          benefitCode: effect.benefitCode,
          eligibleAmount: effect.eligibleAmount.toFixed(),
          stage: "ORDER_PRICE_RESERVED",
        },
        requestedAt: new Date(),
      },
    });
  }
}

/** No consumption on a reservation or a partial delivery. */
export async function consumeRetailOmnichannelRelationshipBenefitsTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  orderId: string;
  actorUserId: string;
}) {
  return args.tx.enterpriseRelationshipBenefitUsage.updateMany({
    where: {
      organizationId: args.organizationId,
      effectModuleCode: "RETAIL_POS",
      effectEntityType: EFFECT_ENTITY_TYPE,
      effectEntityId: args.orderId,
      executionMode: EXECUTION_MODE,
      status: "REQUESTED",
    },
    data: {
      status: "CONSUMED",
      consumedAt: new Date(),
      decidedAt: new Date(),
      executedAt: new Date(),
      decidedByUserId: args.actorUserId,
      revision: { increment: 1 },
    },
  });
}

/** Compensate an order that could not reserve its actual inventory. */
export async function releaseRetailOmnichannelRelationshipBenefitsTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  orderId: string;
}) {
  return args.tx.enterpriseRelationshipBenefitUsage.updateMany({
    where: {
      organizationId: args.organizationId,
      effectModuleCode: "RETAIL_POS",
      effectEntityType: EFFECT_ENTITY_TYPE,
      effectEntityId: args.orderId,
      executionMode: EXECUTION_MODE,
      status: "REQUESTED",
    },
    data: { status: "CANCELLED", cancelledAt: new Date(), revision: { increment: 1 } },
  });
}
