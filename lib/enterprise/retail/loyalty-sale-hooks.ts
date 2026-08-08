import { Prisma } from "@prisma/client";
import { earnRetailLoyaltyPoints } from "@/lib/enterprise/retail/customer-payments";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prisma } from "@/lib/prisma";

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function autoEarnEnabled(settings: Prisma.JsonValue | null | undefined) {
  return Boolean(settings && typeof settings === "object" && !Array.isArray(settings) && (settings as Record<string, unknown>).autoEarn === true);
}

export async function autoEarnRetailLoyaltyForSale(organizationId: string, actorUserId: string, saleId: string) {
  const sale = await prisma.enterpriseRetailSale.findFirst({
    where: { id: saleId, organizationId, status: "COMPLETED" },
    select: { id: true, customerBusinessPartyId: true, currencyCode: true, grandTotal: true, soldAt: true },
  });
  if (!sale) throw new EnterpriseRetailError("RETAIL_SALE_NOT_FOUND", 404);
  if (!sale.customerBusinessPartyId) return { applied: [], skipped: "WALK_IN" as const };

  const programs = await prisma.enterpriseRetailLoyaltyProgram.findMany({
    where: {
      organizationId,
      currencyCode: sale.currencyCode,
      status: "ACTIVE",
      archivedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: sale.soldAt } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: sale.soldAt } }] },
      ],
    },
  });
  const autoPrograms = programs.filter((program) => autoEarnEnabled(program.settingsJson) && program.earnPointsPerCurrencyUnit.isPositive());
  const applied = [];
  for (const program of autoPrograms) {
    const points = decimal(sale.grandTotal).times(program.earnPointsPerCurrencyUnit).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    if (!points.isPositive()) continue;
    const result = await earnRetailLoyaltyPoints(organizationId, actorUserId, {
      programId: program.id,
      customerBusinessPartyId: sale.customerBusinessPartyId,
      points: Number(points),
      monetaryAmount: Number(sale.grandTotal),
      currencyCode: sale.currencyCode,
      saleId: sale.id,
      reason: `Auto earn ${sale.id}`,
      expiresAt: null,
      idempotencyKey: `loyalty:auto-earn:${sale.id}:${program.id}`,
    });
    applied.push({ programId: program.id, entryId: result.entry.id, points: result.entry.points.toString(), idempotent: result.idempotent });
  }
  return { applied, skipped: autoPrograms.length ? null : "NO_AUTO_PROGRAM" as const };
}

export async function reverseRetailLoyaltyForCompletedReturn(organizationId: string, actorUserId: string, returnId: string) {
  return prisma.$transaction(async (tx) => {
    const retailReturn = await tx.enterpriseRetailReturn.findFirst({
      where: { id: returnId, organizationId, status: "COMPLETED" },
      select: { id: true, saleId: true, grandTotal: true, currencyCode: true },
    });
    if (!retailReturn) throw new EnterpriseRetailError("RETAIL_RETURN_NOT_FOUND", 404);
    const sale = await tx.enterpriseRetailSale.findFirst({ where: { id: retailReturn.saleId, organizationId }, select: { id: true, customerBusinessPartyId: true, grandTotal: true } });
    if (!sale?.customerBusinessPartyId || !decimal(sale.grandTotal).isPositive()) return { applied: [], skipped: "NO_CUSTOMER_OR_VALUE" as const };

    const earnedEntries = await tx.enterpriseRetailLoyaltyEntry.findMany({
      where: { organizationId, saleId: sale.id, entryType: "EARN", points: { gt: 0 } },
      orderBy: { createdAt: "asc" },
    });
    const applied = [];
    for (const earned of earnedEntries) {
      const idempotencyKey = `loyalty:return-reversal:${retailReturn.id}:${earned.id}`;
      const existing = await tx.enterpriseRetailLoyaltyEntry.findFirst({ where: { organizationId, idempotencyKey } });
      if (existing) {
        applied.push({ entryId: existing.id, points: existing.points.toString(), idempotent: true });
        continue;
      }
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailLoyaltyAccount" WHERE id = ${earned.accountId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const account = await tx.enterpriseRetailLoyaltyAccount.findFirstOrThrow({ where: { id: earned.accountId, organizationId } });
      const proportional = decimal(earned.points).times(retailReturn.grandTotal).div(sale.grandTotal).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
      if (!proportional.isPositive()) continue;
      const reversible = Prisma.Decimal.min(proportional, account.pointsBalance);
      if (!reversible.isPositive()) continue;
      const entry = await tx.enterpriseRetailLoyaltyEntry.create({
        data: {
          organizationId,
          accountId: account.id,
          entryType: "REVERSAL",
          points: reversible.negated(),
          monetaryAmount: retailReturn.grandTotal,
          currencyCode: retailReturn.currencyCode,
          returnId: retailReturn.id,
          reason: `Auto reversal for return ${retailReturn.id}`,
          idempotencyKey,
          createdByUserId: actorUserId,
        },
      });
      await tx.enterpriseRetailLoyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: { decrement: reversible }, revision: { increment: 1 } } });
      applied.push({ entryId: entry.id, points: entry.points.toString(), idempotent: false });
    }
    return { applied, skipped: earnedEntries.length ? null : "NO_EARNED_POINTS" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
