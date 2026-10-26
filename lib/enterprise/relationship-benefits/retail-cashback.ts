import { Prisma } from "@prisma/client";
import { evaluateRelationshipBenefitSnapshot } from "@/lib/enterprise/relationship-benefits/enforcement";
import type { RetailRelationshipCashbackEffect } from "@/lib/enterprise/relationship-benefits/retail-adapter";
import { changeRelationalStoreCreditTx, ensureRelationalStoreCreditAccountTx } from "@/lib/enterprise/retail/relationship-store-credit";

const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
const zero = () => new Prisma.Decimal(0);

export async function applyRetailRelationshipCashbackTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  actorUserId: string;
  saleId: string;
  effects: RetailRelationshipCashbackEffect[];
}) {
  if (!args.effects.length) return;
  const sale = await args.tx.enterpriseRetailSale.findFirst({
    where: { organizationId: args.organizationId, id: args.saleId, status: "COMPLETED" },
    select: { id: true, grandTotal: true, currencyCode: true, customerBusinessPartyId: true, siteId: true, soldAt: true, lines: { select: { catalogItemId: true, lineTotal: true } } },
  });
  if (!sale?.customerBusinessPartyId) throw new Error("RELATIONSHIP_CASHBACK_CUSTOMER_REQUIRED");
  const modules = await args.tx.enterpriseModule.findMany({
    where: { organizationId: args.organizationId, moduleCode: { in: ["RETAIL_POS", "RELATIONSHIP_BENEFITS"] }, isEnabled: true },
    select: { moduleCode: true },
  });
  if (!["RETAIL_POS", "RELATIONSHIP_BENEFITS"].every((code) => modules.some((item) => item.moduleCode === code))) {
    throw new Error("RELATIONSHIP_CASHBACK_MODULE_DISABLED");
  }
  for (const effect of args.effects) {
    const key = `cashback:relationship:${sale.id}:${effect.benefitId}`;
    await args.tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${args.organizationId + ":relationship-benefit:" + effect.identityLinkId + ":" + effect.benefitId})::bigint)`);
    const [existingUsage, existingEntry] = await Promise.all([
      args.tx.enterpriseRelationshipBenefitUsage.findUnique({ where: { organizationId_effectIdempotencyKey: { organizationId: args.organizationId, effectIdempotencyKey: key } } }),
      args.tx.enterpriseRetailStoredValueEntry.findFirst({ where: { organizationId: args.organizationId, idempotencyKey: key } }),
    ]);
    if (existingUsage || existingEntry) {
      if (!existingUsage || !existingEntry || existingUsage.benefitId !== effect.benefitId ||
        existingUsage.identityLinkId !== effect.identityLinkId || existingUsage.userId !== effect.userId || existingEntry.saleId !== sale.id) {
        throw new Error("RELATIONSHIP_CASHBACK_IDEMPOTENCY_COLLISION");
      }
      continue;
    }
    const [benefit, link, assignment, usages] = await Promise.all([
      args.tx.enterpriseRelationshipBenefit.findFirst({ where: { organizationId: args.organizationId, id: effect.benefitId }, include: { audiences: true } }),
      args.tx.enterpriseIdentityLink.findFirst({
        where: { organizationId: args.organizationId, id: effect.identityLinkId, userId: effect.userId },
        select: { id: true, userId: true, requestedRelationType: true, requestedRoleCode: true, status: true, activatedAt: true, userDecisionAt: true, organizationDecisionAt: true, personIdentityId: true },
      }),
      args.tx.enterpriseRelationshipBenefitAssignment.findFirst({
        where: { organizationId: args.organizationId, benefitId: effect.benefitId, identityLinkId: effect.identityLinkId },
        select: { benefitId: true, status: true, startsAt: true, endsAt: true },
      }),
      args.tx.enterpriseRelationshipBenefitUsage.findMany({
        where: { organizationId: args.organizationId, benefitId: effect.benefitId, identityLinkId: effect.identityLinkId, userId: effect.userId },
        select: { benefitId: true, status: true, requestedAt: true }, take: 100000,
      }),
    ]);
    const personReference = link ? await args.tx.enterprisePersonBusinessReference.findFirst({
      where: { organizationId: args.organizationId, personIdentityId: link.personIdentityId, businessPartyId: sale.customerBusinessPartyId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    }) : null;
    if (!benefit || !link || !personReference || benefit.benefitType !== "CASHBACK" || benefit.valueType !== "PERCENT" ||
      benefit.targetModuleCode !== "RETAIL_POS" || benefit.actionCode !== "NONE" || !benefit.stackable ||
      !benefit.valueDecimal?.gt(0) || benefit.valueDecimal.gt(100) ||
      (benefit.currencyCode && benefit.currencyCode !== sale.currencyCode) ||
      !benefit.valueDecimal.eq(effect.percentage) || sale.currencyCode !== effect.currencyCode ||
      effect.context.businessPartyId !== sale.customerBusinessPartyId ||
      (effect.context.siteId && effect.context.siteId !== sale.siteId) ||
      !money(effect.context.transactionAmount || 0).eq(sale.grandTotal) ||
      !effect.eligibleAmount.gt(0) || effect.eligibleAmount.gt(sale.grandTotal)) {
      throw new Error("RELATIONSHIP_CASHBACK_SALE_MISMATCH");
    }
    const eligibleItems = new Set(effect.eligibleCatalogItemIds);
    const persistedEligible = money(sale.lines.filter((line) => eligibleItems.has(line.catalogItemId))
      .reduce((sum, line) => sum.plus(line.lineTotal), zero()));
    if (!eligibleItems.size || !persistedEligible.equals(effect.eligibleAmount)) throw new Error("RELATIONSHIP_CASHBACK_ELIGIBLE_LINES_CHANGED");
    const evaluation = evaluateRelationshipBenefitSnapshot({
      benefit, link, assignment, usages, context: effect.context, now: sale.soldAt, requireBusinessContext: true,
    });
    if (!evaluation.allowed) throw new Error(`RELATIONSHIP_CASHBACK_${evaluation.code}`);
    const value = money(effect.eligibleAmount.times(benefit.valueDecimal).div(100));
    if (!value.isPositive()) continue;
    const account = await ensureRelationalStoreCreditAccountTx({
      tx: args.tx, organizationId: args.organizationId, actorUserId: args.actorUserId,
      customerBusinessPartyId: sale.customerBusinessPartyId, currencyCode: sale.currencyCode,
    });
    const entry = await changeRelationalStoreCreditTx({
      tx: args.tx, organizationId: args.organizationId, accountId: account.id,
      customerBusinessPartyId: sale.customerBusinessPartyId, currencyCode: sale.currencyCode,
      actorUserId: args.actorUserId, amount: value, entryType: "EARN", saleId: sale.id,
      idempotencyKey: key, reason: `Cashback relationnel ${benefit.code}`,
    });
    await args.tx.enterpriseRelationshipBenefitUsage.create({
      data: {
        organizationId: args.organizationId, benefitId: benefit.id, identityLinkId: link.id, userId: effect.userId,
        actionCode: "NONE", status: "CONSUMED", idempotencyKey: key, effectIdempotencyKey: key,
        executionMode: "AUTO_RETAIL_CASHBACK", effectModuleCode: "RETAIL_POS",
        effectEntityType: "EnterpriseRetailSale", effectEntityId: sale.id,
        effectAmount: value, effectCurrencyCode: sale.currencyCode,
        effectMetadataJson: { storedValueAccountId: account.id, storedValueEntryId: entry.id, percent: benefit.valueDecimal.toFixed(), eligibleAmount: effect.eligibleAmount.toFixed(), eligibleCatalogItemIds: effect.eligibleCatalogItemIds },
        requestedAt: new Date(), decidedAt: new Date(), consumedAt: new Date(), executedAt: new Date(),
        decidedByUserId: args.actorUserId,
      },
    });
  }
}

export async function reverseRetailRelationshipCashbackTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  saleId: string;
  actorUserId: string;
  returnId?: string;
}) {
  const [sale, usages] = await Promise.all([
    args.tx.enterpriseRetailSale.findFirst({ where: { id: args.saleId, organizationId: args.organizationId }, select: { id: true, grandTotal: true, currencyCode: true, customerBusinessPartyId: true, lines: { select: { id: true, quantity: true } } } }),
    args.tx.enterpriseRelationshipBenefitUsage.findMany({
      where: { organizationId: args.organizationId, effectEntityType: "EnterpriseRetailSale", effectEntityId: args.saleId, executionMode: "AUTO_RETAIL_CASHBACK", status: "CONSUMED" },
    }),
  ]);
  if (!sale?.customerBusinessPartyId) return;
  const completedReturns = args.returnId ? await args.tx.enterpriseRetailReturn.findMany({
    where: { organizationId: args.organizationId, saleId: args.saleId, status: "COMPLETED" },
    select: { grandTotal: true, lines: { select: { saleLineId: true, catalogItemId: true, quantity: true, lineTotal: true } } },
  }) : [];
  const quantities = new Map<string, Prisma.Decimal>();
  for (const returned of completedReturns) {
    for (const line of returned.lines) quantities.set(line.saleLineId, (quantities.get(line.saleLineId) || zero()).plus(line.quantity));
  }
  const fullyReturned = !args.returnId || (sale.lines.length > 0 && sale.lines.every((line) => (quantities.get(line.id) || zero()).gte(line.quantity)));
  for (const usage of usages) {
    const earned = await args.tx.enterpriseRetailStoredValueEntry.findFirst({
      where: { organizationId: args.organizationId, saleId: args.saleId, idempotencyKey: usage.effectIdempotencyKey || "__missing__", entryType: "EARN" },
    });
    if (!earned) throw new Error("RELATIONSHIP_CASHBACK_EARN_MISSING");
    const reversalKey = args.returnId ? `cashback:return:${args.returnId}:${earned.id}` : `cashback:sale-reversal:${sale.id}:${earned.id}`;
    const reversals = await args.tx.enterpriseRetailStoredValueEntry.findMany({
      where: { organizationId: args.organizationId, accountId: earned.accountId, entryType: "REVERSAL", saleId: sale.id },
      select: { amount: true, idempotencyKey: true },
    });
    const alreadyReversed = reversals.filter((item) => item.idempotencyKey.endsWith(`:${earned.id}`))
      .reduce((sum, item) => sum.plus(item.amount.abs()), zero());
    const metadata = usage.effectMetadataJson && typeof usage.effectMetadataJson === "object" && !Array.isArray(usage.effectMetadataJson)
      ? usage.effectMetadataJson as Record<string, unknown> : {};
    const catalogIds = Array.isArray(metadata.eligibleCatalogItemIds)
      ? new Set(metadata.eligibleCatalogItemIds.filter((id): id is string => typeof id === "string"))
      : new Set<string>();
    const initialEligible = typeof metadata.eligibleAmount === "string" ? money(metadata.eligibleAmount) : zero();
    if (!catalogIds.size || !initialEligible.gt(0)) throw new Error("RELATIONSHIP_CASHBACK_ELIGIBLE_LINES_MISSING");
    const refundedEligible = completedReturns.flatMap((row) => row.lines)
      .filter((line) => catalogIds.has(line.catalogItemId))
      .reduce((sum, line) => sum.plus(line.lineTotal), zero());
    const target = args.returnId && !fullyReturned
      ? money(earned.amount.times(Prisma.Decimal.min(initialEligible, refundedEligible)).div(initialEligible)) : earned.amount;
    const remaining = Prisma.Decimal.max(zero(), money(target.minus(alreadyReversed)));
    if (remaining.gt(0)) {
      await changeRelationalStoreCreditTx({
        tx: args.tx, organizationId: args.organizationId, accountId: earned.accountId,
        customerBusinessPartyId: sale.customerBusinessPartyId, currencyCode: sale.currencyCode,
        actorUserId: args.actorUserId, amount: remaining.negated(), entryType: "REVERSAL",
        saleId: sale.id, returnId: args.returnId, idempotencyKey: reversalKey,
        reason: args.returnId ? `Réversion cashback après retour ${args.returnId}` : `Annulation cashback ticket ${sale.id}`,
      });
    }
    if (fullyReturned) {
      await args.tx.enterpriseRelationshipBenefitUsage.updateMany({
        where: { organizationId: args.organizationId, id: usage.id, status: "CONSUMED" },
        data: { status: "CANCELLED", cancelledAt: new Date(), revision: { increment: 1 } },
      });
    }
  }
}
