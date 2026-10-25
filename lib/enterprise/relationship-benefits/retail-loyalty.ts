import { Prisma } from "@prisma/client";
import { evaluateRelationshipBenefitSnapshot } from "@/lib/enterprise/relationship-benefits/enforcement";
import type { RetailRelationshipLoyaltyEffect } from "@/lib/enterprise/relationship-benefits/retail-adapter";

// Retail POS persists totals at six decimal places; truncating at two would
// incorrectly reject valid multi-line tax/discount allocations.
const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

export async function applyRetailRelationshipLoyaltyTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  saleId: string;
  actorUserId: string;
  effects: RetailRelationshipLoyaltyEffect[];
}) {
  if (!args.effects.length) return;
  const sale = await args.tx.enterpriseRetailSale.findFirst({
    where: { organizationId: args.organizationId, id: args.saleId, status: "COMPLETED" },
    select: { id: true, grandTotal: true, currencyCode: true, customerBusinessPartyId: true, soldAt: true, siteId: true },
  });
  if (!sale?.customerBusinessPartyId) throw new Error("RELATIONSHIP_LOYALTY_CUSTOMER_REQUIRED");
  const modules = await args.tx.enterpriseModule.findMany({
    where: { organizationId: args.organizationId, moduleCode: { in: ["RETAIL_POS", "RELATIONSHIP_BENEFITS"] }, isEnabled: true },
    select: { moduleCode: true },
  });
  if (!["RETAIL_POS", "RELATIONSHIP_BENEFITS"].every((code) => modules.some((item) => item.moduleCode === code))) {
    throw new Error("RELATIONSHIP_LOYALTY_MODULE_DISABLED");
  }
  for (const effect of args.effects) {
    const idempotencyKey = `loyalty:relationship:${sale.id}:${effect.benefitId}`;
    await args.tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${args.organizationId + ":relationship-benefit:" + effect.identityLinkId + ":" + effect.benefitId})::bigint)`);
    const existing = await args.tx.enterpriseRelationshipBenefitUsage.findUnique({
      where: { organizationId_effectIdempotencyKey: { organizationId: args.organizationId, effectIdempotencyKey: idempotencyKey } },
    });
    const existingEntry = await args.tx.enterpriseRetailLoyaltyEntry.findFirst({
      where: { organizationId: args.organizationId, idempotencyKey },
    });
    if (existing || existingEntry) {
      if (!existing || !existingEntry || existing.identityLinkId !== effect.identityLinkId ||
        existing.userId !== effect.userId || existing.benefitId !== effect.benefitId ||
        existing.effectEntityId !== sale.id || existingEntry.saleId !== sale.id) {
        throw new Error("RELATIONSHIP_LOYALTY_IDEMPOTENCY_COLLISION");
      }
      continue;
    }
    const [benefit, link, assignment, usages, program] = await Promise.all([
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
        select: { benefitId: true, status: true, requestedAt: true },
        take: 100000,
      }),
      args.tx.enterpriseRetailLoyaltyProgram.findFirst({
        where: { organizationId: args.organizationId, id: effect.programId, currencyCode: sale.currencyCode, status: "ACTIVE", archivedAt: null },
      }),
    ]);
    const reference = link ? await args.tx.enterprisePersonBusinessReference.findFirst({
      where: { organizationId: args.organizationId, personIdentityId: link.personIdentityId, businessPartyId: sale.customerBusinessPartyId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    }) : null;
    if (!benefit || !link || !reference || !program ||
      benefit.benefitType !== "LOYALTY" || benefit.valueType !== "POINTS" ||
      benefit.targetModuleCode !== "RETAIL_POS" || benefit.actionCode !== "NONE" ||
      !benefit.stackable || !benefit.valueDecimal?.gt(0) ||
      (benefit.settingsJson && typeof benefit.settingsJson === "object" && !Array.isArray(benefit.settingsJson)
        ? (benefit.settingsJson as Record<string, unknown>).retailLoyaltyProgramId !== effect.programId : true) ||
      program.startsAt && program.startsAt > sale.soldAt ||
      program.endsAt && program.endsAt <= sale.soldAt ||
      (program.settingsJson && typeof program.settingsJson === "object" && !Array.isArray(program.settingsJson) &&
        (program.settingsJson as Record<string, unknown>).autoEarn === true)
    ) throw new Error("RELATIONSHIP_LOYALTY_CONFIG_CHANGED");
    if (effect.currencyCode !== sale.currencyCode || effect.context.businessPartyId !== sale.customerBusinessPartyId ||
      (effect.context.siteId && effect.context.siteId !== sale.siteId) ||
      !effect.pointsPerCurrencyUnit.eq(benefit.valueDecimal) ||
      !money(effect.context.transactionAmount || 0).eq(money(sale.grandTotal))) {
      throw new Error("RELATIONSHIP_LOYALTY_SALE_MISMATCH");
    }
    const evaluation = evaluateRelationshipBenefitSnapshot({
      benefit, link, assignment, usages, context: effect.context, now: sale.soldAt, requireBusinessContext: true,
    });
    if (!evaluation.allowed) throw new Error(`RELATIONSHIP_LOYALTY_${evaluation.code}`);
    const points = sale.grandTotal.times(benefit.valueDecimal).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    if (!points.isPositive()) continue;
    let account = await args.tx.enterpriseRetailLoyaltyAccount.findFirst({
      where: { organizationId: args.organizationId, programId: program.id, customerBusinessPartyId: sale.customerBusinessPartyId },
    });
    if (!account) {
      account = await args.tx.enterpriseRetailLoyaltyAccount.create({
        data: { organizationId: args.organizationId, programId: program.id, customerBusinessPartyId: sale.customerBusinessPartyId },
      });
    }
    if (account.status !== "ACTIVE") throw new Error("RELATIONSHIP_LOYALTY_ACCOUNT_INACTIVE");
    await args.tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailLoyaltyAccount" WHERE id = ${account.id} AND "organizationId" = ${args.organizationId} FOR UPDATE`);
    const entry = await args.tx.enterpriseRetailLoyaltyEntry.create({
      data: {
        organizationId: args.organizationId,
        accountId: account.id,
        entryType: "EARN",
        points,
        monetaryAmount: sale.grandTotal,
        currencyCode: sale.currencyCode,
        saleId: sale.id,
        reason: `Avantage relationnel ${benefit.code}`,
        idempotencyKey,
        createdByUserId: args.actorUserId,
      },
    });
    await args.tx.enterpriseRetailLoyaltyAccount.update({
      where: { id: account.id },
      data: { pointsBalance: { increment: points }, lifetimeEarned: { increment: points }, revision: { increment: 1 } },
    });
    await args.tx.enterpriseRelationshipBenefitUsage.create({
      data: {
        organizationId: args.organizationId,
        benefitId: benefit.id,
        identityLinkId: link.id,
        userId: effect.userId,
        actionCode: "NONE",
        status: "CONSUMED",
        idempotencyKey,
        effectIdempotencyKey: idempotencyKey,
        executionMode: "AUTO_RETAIL_LOYALTY",
        effectModuleCode: "RETAIL_POS",
        effectEntityType: "EnterpriseRetailSale",
        effectEntityId: sale.id,
        effectAmount: points,
        effectCurrencyCode: sale.currencyCode,
        effectMetadataJson: { programId: program.id, loyaltyEntryId: entry.id, pointsPerCurrencyUnit: benefit.valueDecimal.toFixed() },
        requestedAt: new Date(), decidedAt: new Date(), consumedAt: new Date(), executedAt: new Date(),
        decidedByUserId: args.actorUserId,
      },
    });
  }
}

export async function reverseRetailRelationshipLoyaltyTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  saleId: string;
  actorUserId: string;
}) {
  const usages = await args.tx.enterpriseRelationshipBenefitUsage.findMany({
    where: {
      organizationId: args.organizationId, effectEntityType: "EnterpriseRetailSale",
      effectEntityId: args.saleId, executionMode: "AUTO_RETAIL_LOYALTY", status: "CONSUMED",
    },
  });
  for (const usage of usages) {
    const earned = await args.tx.enterpriseRetailLoyaltyEntry.findFirst({
      where: { organizationId: args.organizationId, saleId: args.saleId, idempotencyKey: usage.effectIdempotencyKey || "__missing__" },
    });
    if (!earned || earned.entryType !== "EARN") throw new Error("RELATIONSHIP_LOYALTY_EARN_MISSING");
    const reversalKey = `loyalty:sale-reversal:${args.saleId}:${earned.id}`;
    const reversed = await args.tx.enterpriseRetailLoyaltyEntry.findFirst({
      where: { organizationId: args.organizationId, idempotencyKey: reversalKey },
    });
    if (!reversed) {
      await args.tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailLoyaltyAccount" WHERE id = ${earned.accountId} AND "organizationId" = ${args.organizationId} FOR UPDATE`);
      const previous = await args.tx.enterpriseRetailLoyaltyEntry.findMany({
        where: { organizationId: args.organizationId, accountId: earned.accountId, entryType: "REVERSAL" },
        select: { points: true, idempotencyKey: true },
      });
      const alreadyReversed = previous
        .filter((entry) => entry.idempotencyKey.endsWith(`:${earned.id}`))
        .reduce((sum, entry) => sum.plus(entry.points.abs()), new Prisma.Decimal(0));
      const remaining = Prisma.Decimal.max(new Prisma.Decimal(0), earned.points.minus(alreadyReversed));
      if (remaining.gt(0)) {
        await args.tx.enterpriseRetailLoyaltyEntry.create({
          data: {
            organizationId: args.organizationId, accountId: earned.accountId,
            entryType: "REVERSAL", points: remaining.negated(),
            monetaryAmount: earned.monetaryAmount, currencyCode: earned.currencyCode,
            saleId: args.saleId, reason: `Annulation de l’avantage relationnel ${usage.benefitId}`,
            idempotencyKey: reversalKey, createdByUserId: args.actorUserId,
          },
        });
        // A previously redeemed award becomes an explicit points debt. The
        // canonical account's signed balance prevents spending until offset.
        await args.tx.enterpriseRetailLoyaltyAccount.update({
          where: { id: earned.accountId },
          data: { pointsBalance: { decrement: remaining }, revision: { increment: 1 } },
        });
      }
    }
    await args.tx.enterpriseRelationshipBenefitUsage.updateMany({
      where: { organizationId: args.organizationId, id: usage.id, status: "CONSUMED" },
      data: { status: "CANCELLED", cancelledAt: new Date(), revision: { increment: 1 } },
    });
  }
}
