import { Prisma } from "@prisma/client";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { evaluateRelationshipBenefitSnapshot } from "@/lib/enterprise/relationship-benefits/enforcement";
import type { RetailRelationshipCashbackEffect } from "@/lib/enterprise/relationship-benefits/retail-adapter";
import { resolvePaidDeliveredOmnichannelOrderTx } from "@/lib/enterprise/relationship-benefits/omnichannel-payment-proof";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { changeRelationalStoreCreditTx, ensureRelationalStoreCreditAccountTx } from "@/lib/enterprise/retail/relationship-store-credit";

const MODE = "AUTO_RETAIL_OMNICHANNEL_CASHBACK";
const money = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
const zero = () => new Prisma.Decimal(0);
function reject(code: string): never { throw new EnterpriseRetailError(code, 409); }
const creditKey = (orderId: string, benefitId: string) => `omni-cashback:order:${orderId}:benefit:${benefitId}`;
const reservedKey = (orderId: string, benefitId: string) => `omni-cashback:reserved:${orderId}:${benefitId}`;
function metadata(raw: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
function eligibleCatalogIds(raw: unknown): string[] {
  return Array.isArray(raw) && raw.length > 0 && raw.every((x) => typeof x === "string")
    ? [...new Set(raw as string[])] : [];
}

/**
 * Reserve quota against an immutable, real Sales order. No monetary EARN at
 * this stage; paid and delivered are separate future evidence requirements.
 */
export async function reserveRetailOmnichannelCashbackTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  actorUserId: string;
  orderId: string;
  sourceSiteId: string;
  effects: RetailRelationshipCashbackEffect[];
}) {
  if (!args.effects.length) return;
  const { tx, organizationId, orderId } = args;
  const [order, modules] = await Promise.all([
    tx.enterpriseSalesOrder.findFirst({
      where: { id: orderId, organizationId, status: "CONFIRMED", archivedAt: null },
      select: {
        id: true, businessPartyId: true, currency: true, totalAmount: true,
        items: { select: { catalogItemId: true, lineTotal: true } },
      },
    }),
    tx.enterpriseModule.findMany({
      where: { organizationId, isEnabled: true, moduleCode: { in: ["RETAIL_POS", "RELATIONSHIP_BENEFITS"] } },
      select: { moduleCode: true },
    }),
  ]);
  if (!order || !order.businessPartyId || !order.totalAmount.gt(0) || !order.items.length) reject("RELATIONSHIP_OMNI_CASHBACK_ORDER_INVALID");
  if (!["RETAIL_POS", "RELATIONSHIP_BENEFITS"].every((code) => modules.some((m) => m.moduleCode === code))) {
    reject("RELATIONSHIP_OMNI_CASHBACK_MODULE_DISABLED");
  }
  for (const effect of args.effects) {
    const key = reservedKey(order.id, effect.benefitId);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId + ":relationship-benefit:" + effect.identityLinkId + ":" + effect.benefitId})::bigint)`);
    const existing = await tx.enterpriseRelationshipBenefitUsage.findUnique({
      where: { organizationId_effectIdempotencyKey: { organizationId, effectIdempotencyKey: key } },
    });
    if (existing) {
      if (existing.effectEntityId !== order.id || existing.identityLinkId !== effect.identityLinkId ||
          existing.userId !== effect.userId || existing.benefitId !== effect.benefitId ||
          existing.executionMode !== MODE) reject("RELATIONSHIP_OMNI_CASHBACK_IDEMPOTENCY_COLLISION");
      continue;
    }
    const [benefit, link, assignment, usages] = await Promise.all([
      tx.enterpriseRelationshipBenefit.findFirst({ where: { id: effect.benefitId, organizationId }, include: { audiences: true } }),
      tx.enterpriseIdentityLink.findFirst({
        where: { id: effect.identityLinkId, organizationId, userId: effect.userId },
        select: {
          id: true, userId: true, personIdentityId: true, requestedRelationType: true, requestedRoleCode: true,
          status: true, activatedAt: true, userDecisionAt: true, organizationDecisionAt: true,
        },
      }),
      tx.enterpriseRelationshipBenefitAssignment.findFirst({
        where: { organizationId, benefitId: effect.benefitId, identityLinkId: effect.identityLinkId },
        select: { benefitId: true, status: true, startsAt: true, endsAt: true },
      }),
      tx.enterpriseRelationshipBenefitUsage.findMany({
        where: { organizationId, benefitId: effect.benefitId, identityLinkId: effect.identityLinkId, userId: effect.userId },
        select: { benefitId: true, status: true, requestedAt: true }, take: 100000,
      }),
    ]);
    const linkedReference = link ? await tx.enterprisePersonBusinessReference.findFirst({
      where: {
        organizationId, personIdentityId: link.personIdentityId, businessPartyId: order.businessPartyId,
        relationType: link.requestedRelationType, status: "ACTIVE", archivedAt: null,
      }, select: { id: true },
    }) : null;
    if (!linkedReference || !benefit || !link ||
        benefit.benefitType !== "CASHBACK" || benefit.targetModuleCode !== "RETAIL_POS" ||
        benefit.valueType !== "PERCENT" || benefit.actionCode !== "NONE" || !benefit.stackable ||
        !benefit.valueDecimal?.gt(0) || benefit.valueDecimal.gt(100) ||
        !benefit.valueDecimal.equals(effect.percentage) ||
        effect.currencyCode !== order.currency ||
        effect.context.currencyCode !== order.currency ||
        effect.context.businessPartyId !== order.businessPartyId ||
        effect.context.siteId !== args.sourceSiteId ||
        effect.context.channelCode !== "POS" ||
        (benefit.currencyCode && benefit.currencyCode !== order.currency)) reject("RELATIONSHIP_OMNI_CASHBACK_CONTEXT_INVALID");

    const ids = eligibleCatalogIds(effect.eligibleCatalogItemIds);
    if (!ids.length || order.items.some((item) => !item.catalogItemId)) reject("RELATIONSHIP_OMNI_CASHBACK_LINES_INVALID");
    const eligible = money(order.items.filter((item) => ids.includes(item.catalogItemId!))
      .reduce((sum, item) => sum.plus(item.lineTotal), zero()));
    const value = money(eligible.times(benefit.valueDecimal).div(100));
    if (!eligible.gt(0) || eligible.gt(order.totalAmount) || !value.gt(0)) reject("RELATIONSHIP_OMNI_CASHBACK_AMOUNT_INVALID");
    const evaluation = evaluateRelationshipBenefitSnapshot({
      benefit, link, assignment, usages, context: {
        ...effect.context, moduleCode: "RETAIL_POS", transactionAmount: Number(order.totalAmount),
      },
      now: effect.context.occurredAt ? new Date(effect.context.occurredAt) : new Date(),
      requireBusinessContext: true,
    });
    if (!evaluation.allowed) reject(`RELATIONSHIP_OMNI_CASHBACK_${evaluation.code}`);
    await tx.enterpriseRelationshipBenefitUsage.create({
      data: {
        organizationId, benefitId: effect.benefitId, identityLinkId: effect.identityLinkId,
        userId: effect.userId, actionCode: "NONE", status: "REQUESTED",
        idempotencyKey: key, effectIdempotencyKey: key, executionMode: MODE,
        effectModuleCode: "RETAIL_POS", effectEntityType: "EnterpriseSalesOrder",
        effectEntityId: order.id, effectAmount: value, effectCurrencyCode: order.currency,
        effectMetadataJson: {
          stage: "ORDER_RESERVED", sourceSiteId: args.sourceSiteId,
          percent: effect.percentage.toFixed(), eligibleAmount: eligible.toFixed(),
          eligibleCatalogItemIds: ids, customerBusinessPartyId: order.businessPartyId,
        },
      },
    });
  }
}

/**
 * Both payment allocation and fulfillment call this same operation. Locking the
 * order first serializes these event orders and prevents duplicate EARNs.
 * Missing evidence is NOT a credit and never changes the usage.
 */
export async function tryGrantRetailOmnichannelCashbackTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  orderId: string;
  actorUserId: string;
}) {
  const { tx, organizationId, orderId, actorUserId } = args;
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesOrder" WHERE id = ${orderId} AND "organizationId" = ${organizationId} FOR UPDATE`);
  const proof = await resolvePaidDeliveredOmnichannelOrderTx({ tx, organizationId, salesOrderId: orderId });
  if (!proof) return { credited: 0, eligible: false };
  const modules = await tx.enterpriseModule.findMany({
    where: { organizationId, isEnabled: true, moduleCode: { in: ["RETAIL_POS", "RELATIONSHIP_BENEFITS"] } },
    select: { moduleCode: true },
  });
  if (!["RETAIL_POS", "RELATIONSHIP_BENEFITS"].every((code) => modules.some((m) => m.moduleCode === code))) {
    return { credited: 0, eligible: false };
  }
  const usages = await tx.enterpriseRelationshipBenefitUsage.findMany({
    where: { organizationId, executionMode: MODE, status: "REQUESTED", effectEntityType: "EnterpriseSalesOrder", effectEntityId: orderId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  let credited = 0;
  for (const usage of usages) {
    const data = metadata(usage.effectMetadataJson);
    const key = creditKey(orderId, usage.benefitId);
    const [benefit, link, customer] = await Promise.all([
      tx.enterpriseRelationshipBenefit.findFirst({ where: { organizationId, id: usage.benefitId }, select: { benefitType: true, valueType: true, valueDecimal: true, status: true, archivedAt: true } }),
      tx.enterpriseIdentityLink.findFirst({
        where: { organizationId, id: usage.identityLinkId, userId: usage.userId },
        select: { personIdentityId: true, requestedRelationType: true, status: true, activatedAt: true, userDecisionAt: true, organizationDecisionAt: true },
      }),
      tx.enterpriseBusinessParty.findFirst({
        where: {
          organizationId, id: proof.customerBusinessPartyId, status: "ACTIVE", archivedAt: null,
          roles: { some: { organizationId, roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
        }, select: { id: true },
      }),
    ]);
    const accountRef = link ? await tx.enterprisePersonBusinessReference.findFirst({
      where: {
        organizationId, businessPartyId: proof.customerBusinessPartyId,
        personIdentityId: link.personIdentityId,
        relationType: link.requestedRelationType, status: "ACTIVE", archivedAt: null,
      }, select: { id: true },
    }) : null;
    const eligibleAmount = typeof data.eligibleAmount === "string" ? money(data.eligibleAmount) : zero();
    const percent = typeof data.percent === "string" ? money(data.percent) : zero();
    const expected = money(eligibleAmount.times(percent).div(100));
    const entryAmount = usage.effectAmount;
    if (!benefit || !link || !accountRef || !customer ||
        link.status !== "ACTIVE" || !link.activatedAt || !link.userDecisionAt || !link.organizationDecisionAt ||
        benefit.benefitType !== "CASHBACK" || benefit.valueType !== "PERCENT" ||
        benefit.status !== "ACTIVE" || benefit.archivedAt ||
        !benefit.valueDecimal?.equals(percent) || !entryAmount?.equals(expected) ||
        !eligibleAmount.gt(0) || eligibleAmount.gt(proof.grossTotal) ||
        data.customerBusinessPartyId !== proof.customerBusinessPartyId ||
        data.sourceSiteId !== proof.sourceSiteId ||
        usage.effectCurrencyCode !== proof.currencyCode ||
        !eligibleCatalogIds(data.eligibleCatalogItemIds).length) {
      // Keep reserved; never mint credit on a revoked or ambiguous relation.
      continue;
    }
    const existingEntry = await tx.enterpriseRetailStoredValueEntry.findFirst({
      where: { organizationId, idempotencyKey: key },
    });
    if (existingEntry && (!existingEntry.amount.equals(entryAmount) || existingEntry.entryType !== "EARN")) {
      reject("RELATIONSHIP_OMNI_CASHBACK_IDEMPOTENCY_COLLISION");
    }
    const account = await ensureRelationalStoreCreditAccountTx({
      tx, organizationId, customerBusinessPartyId: proof.customerBusinessPartyId,
      currencyCode: proof.currencyCode, actorUserId,
    });
    if (existingEntry && existingEntry.accountId !== account.id) reject("RELATIONSHIP_OMNI_CASHBACK_IDEMPOTENCY_COLLISION");
    const entry = await changeRelationalStoreCreditTx({
      tx, organizationId, accountId: account.id,
      customerBusinessPartyId: proof.customerBusinessPartyId, currencyCode: proof.currencyCode,
      actorUserId, amount: entryAmount, entryType: "EARN", idempotencyKey: key,
      reason: `Cashback omnicanal ${usage.benefitId} — commande ${orderId}`,
    });
    const saved = await tx.enterpriseRelationshipBenefitUsage.updateMany({
      where: { organizationId, id: usage.id, status: "REQUESTED", revision: usage.revision },
      data: {
        status: "CONSUMED", consumedAt: new Date(), executedAt: new Date(),
        decidedAt: new Date(), decidedByUserId: actorUserId, revision: { increment: 1 },
        effectMetadataJson: {
          ...data, stage: "PAID_DELIVERED_CREDITED", invoiceId: proof.invoiceId,
          storedValueAccountId: account.id, storedValueEntryId: entry.id,
        },
      },
    });
    if (saved.count !== 1) reject("RELATIONSHIP_OMNI_CASHBACK_REVISION_CONFLICT");
    // Posting and store-credit attribution are atomic: no unfunded liability.
    await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: "RETAIL_RELATIONSHIP_CREDIT_GRANTED",
      sourceEntityType: "EnterpriseRetailStoredValueEntry", sourceEntityId: entry.id,
    });
    credited++;
  }
  return { credited, eligible: true };
}

/**
 * Run only after the canonical refund is CONFIRMED and the return is marked
 * COMPLETED, inside its serializable stock/return transaction.
 */
export async function reverseRetailOmnichannelCashbackTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  orderId: string;
  returnId: string;
  actorUserId: string;
  fullyReturned: boolean;
}) {
  const { tx, organizationId, orderId, returnId, actorUserId } = args;
  const [order, returned, usages] = await Promise.all([
    tx.enterpriseSalesOrder.findFirst({
      where: { organizationId, id: orderId }, select: {
        businessPartyId: true, currency: true,
        items: { select: { id: true, catalogItemId: true } },
      },
    }),
    tx.enterpriseRetailOmnichannelReturn.findMany({
      where: { organizationId, salesOrderId: orderId, status: "COMPLETED" },
      include: { lines: true },
    }),
    tx.enterpriseRelationshipBenefitUsage.findMany({
      where: {
        organizationId, executionMode: MODE, effectEntityType: "EnterpriseSalesOrder",
        effectEntityId: orderId, status: "CONSUMED",
      },
    }),
  ]);
  // A completed return without an EARN must also release the reserved quota;
  // the order has been refunded and can never mint the originally quoted credit.
  await tx.enterpriseRelationshipBenefitUsage.updateMany({
    where: {
      organizationId, executionMode: MODE, effectEntityType: "EnterpriseSalesOrder",
      effectEntityId: orderId, status: "REQUESTED",
    },
    data: { status: "CANCELLED", cancelledAt: new Date(), revision: { increment: 1 } },
  });
  if (!usages.length) return;
  if (!order?.businessPartyId || !returned.some((x) => x.id === returnId)) reject("RELATIONSHIP_OMNI_CASHBACK_RETURN_INVALID");
  const itemById = new Map(order.items.map((x) => [x.id, x.catalogItemId]));
  for (const usage of usages) {
    const data = metadata(usage.effectMetadataJson);
    const eligibleItems = new Set(eligibleCatalogIds(data.eligibleCatalogItemIds));
    const originalAmount = typeof data.eligibleAmount === "string" ? money(data.eligibleAmount) : zero();
    if (!eligibleItems.size || !originalAmount.gt(0) || !usage.effectAmount?.gt(0)) reject("RELATIONSHIP_OMNI_CASHBACK_ORIGINAL_INVALID");
    const earned = await tx.enterpriseRetailStoredValueEntry.findFirst({
      where: { organizationId, idempotencyKey: creditKey(orderId, usage.benefitId), entryType: "EARN" },
    });
    if (!earned || !earned.amount.equals(usage.effectAmount)) reject("RELATIONSHIP_OMNI_CASHBACK_EARN_MISSING");
    const refundedEligible = returned.flatMap((x) => x.lines)
      .filter((line) => eligibleItems.has(itemById.get(line.salesOrderItemId) || ""))
      .reduce((sum, line) => sum.plus(line.refundAmount), zero());
    const target = args.fullyReturned
      ? earned.amount
      : money(earned.amount.times(Prisma.Decimal.min(originalAmount, refundedEligible)).div(originalAmount));
    const already = await tx.enterpriseRetailStoredValueEntry.findMany({
      where: { organizationId, accountId: earned.accountId, entryType: "REVERSAL", idempotencyKey: { startsWith: `omni-cashback:return:${orderId}:${usage.benefitId}:` } },
      select: { amount: true },
    });
    const alreadyReversed = already.reduce((sum, row) => sum.plus(row.amount.abs()), zero());
    const delta = money(Prisma.Decimal.max(zero(), target.minus(alreadyReversed)));
    if (delta.gt(0)) {
      const reversal = await changeRelationalStoreCreditTx({
        tx, organizationId, accountId: earned.accountId,
        customerBusinessPartyId: order.businessPartyId, currencyCode: order.currency,
        actorUserId, amount: delta.negated(), entryType: "REVERSAL",
        returnId, idempotencyKey: `omni-cashback:return:${orderId}:${usage.benefitId}:${returnId}`,
        reason: `Réversion cashback omnicanal après retour ${returnId}`,
      });
      await postBusinessEventTx(tx, organizationId, actorUserId, {
        postingEvent: "RETAIL_RELATIONSHIP_CREDIT_REVERSED",
        sourceEntityType: "EnterpriseRetailStoredValueEntry", sourceEntityId: reversal.id,
      });
    }
    if (args.fullyReturned) {
      await tx.enterpriseRelationshipBenefitUsage.updateMany({
        where: { organizationId, id: usage.id, status: "CONSUMED" },
        data: { status: "CANCELLED", cancelledAt: new Date(), revision: { increment: 1 } },
      });
    }
  }
}
