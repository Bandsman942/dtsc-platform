import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { reverseJournalEntryTx } from "@/lib/enterprise/accounting/reversal-service";

function fxSourceId(fiscalPeriodId: string, currencyCode: string) {
  return `${fiscalPeriodId}:${currencyCode.trim().toUpperCase()}`;
}

export async function runClosingFxRevaluation(
  organizationId: string,
  actorUserId: string,
  input: { fiscalPeriodId: string; currencyCode: string },
) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.enterpriseFiscalPeriod.findFirst({
      where: { id: input.fiscalPeriodId, organizationId },
      include: { fiscalYear: true },
    });
    if (!period) throw new EnterpriseAccountingError("FISCAL_PERIOD_NOT_FOUND", 404);
    if (!["OPEN", "SOFT_CLOSED"].includes(period.status)) {
      throw new EnterpriseAccountingError("FINANCE_PERIOD_CLOSED", 409, { status: period.status });
    }
    const configuration = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
    if (!configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
    const currencyCode = input.currencyCode.trim().toUpperCase();
    if (currencyCode === configuration.functionalCurrencyCode) {
      throw new EnterpriseAccountingError("FX_REVALUATION_FOREIGN_CURRENCY_REQUIRED", 409);
    }
    const nextPeriod = await tx.enterpriseFiscalPeriod.findFirst({
      where: { organizationId, startDate: { gt: period.endDate }, status: "OPEN" },
      orderBy: { startDate: "asc" },
    });
    if (!nextPeriod) throw new EnterpriseAccountingError("FX_REVALUATION_NEXT_OPEN_PERIOD_REQUIRED", 409);

    const sourceEntityId = fxSourceId(period.id, currencyCode);
    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: "FX_CLOSING_REVALUATION_POSTED",
      sourceEntityType: "EnterpriseFxRevaluation",
      sourceEntityId,
    });
    const reversal = await reverseJournalEntryTx(
      tx,
      organizationId,
      posting.entry.id,
      actorUserId,
      { reason: `Automatic closing FX reversal ${period.code} ${currencyCode}`, accountingDate: nextPeriod.startDate },
      { authorization: "SYSTEM_CLOSING" },
    );
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFxRevaluation",
      entityId: sourceEntityId,
      eventType: "FX_CLOSING_REVALUATION_COMPLETED",
      summary: `Closing FX revaluation ${period.code} ${currencyCode} completed`,
      actorUserId,
      toStatus: "REVERSED_NEXT_PERIOD",
      metadataJson: {
        fiscalPeriodId: period.id,
        fiscalYearId: period.fiscalYearId,
        currencyCode,
        journalEntryId: posting.entry.id,
        reversalEntryId: reversal.id,
        reversalPeriodId: nextPeriod.id,
      },
    });
    return { period, posting, reversal, nextPeriod };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function closeFiscalYearWithRetainedEarnings(
  organizationId: string,
  fiscalYearId: string,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFiscalYear" WHERE id = ${fiscalYearId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const fiscalYear = await tx.enterpriseFiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId },
      include: { periods: { orderBy: { startDate: "asc" } } },
    });
    if (!fiscalYear) throw new EnterpriseAccountingError("FISCAL_YEAR_NOT_FOUND", 404);

    const existing = await tx.enterpriseJournalEntry.findFirst({
      where: {
        organizationId,
        sourceEntityType: "EnterpriseFiscalYear",
        sourceEntityId: fiscalYear.id,
        postingEvent: "YEAR_END_CLOSED",
        status: { in: ["POSTED", "REVERSED"] },
      },
      include: { lines: true },
    });
    if (fiscalYear.status === "CLOSED" && existing) {
      const nextYear = await tx.enterpriseFiscalYear.findFirst({
        where: { organizationId, startDate: { gt: fiscalYear.endDate } },
        orderBy: { startDate: "asc" },
      });
      return { fiscalYear, posting: { entry: existing, idempotent: true }, nextYear };
    }
    if (!["OPEN", "CLOSING"].includes(fiscalYear.status)) {
      throw new EnterpriseAccountingError("FISCAL_YEAR_NOT_CLOSABLE", 409, { status: fiscalYear.status });
    }
    if (!fiscalYear.periods.length) throw new EnterpriseAccountingError("FISCAL_YEAR_PERIODS_REQUIRED", 409);
    const closingPeriod = fiscalYear.periods[fiscalYear.periods.length - 1];
    if (!["OPEN", "SOFT_CLOSED"].includes(closingPeriod.status)) {
      throw new EnterpriseAccountingError("YEAR_END_OPEN_CLOSING_PERIOD_REQUIRED", 409, { status: closingPeriod.status });
    }
    const nextYear = await tx.enterpriseFiscalYear.findFirst({
      where: { organizationId, startDate: { gt: fiscalYear.endDate }, status: "OPEN" },
      orderBy: { startDate: "asc" },
      include: { periods: { where: { status: "OPEN" }, orderBy: { startDate: "asc" }, take: 1 } },
    });
    if (!nextYear || !nextYear.periods.length) {
      throw new EnterpriseAccountingError("YEAR_END_NEXT_OPEN_FISCAL_YEAR_REQUIRED", 409);
    }

    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: "YEAR_END_CLOSED",
      sourceEntityType: "EnterpriseFiscalYear",
      sourceEntityId: fiscalYear.id,
    });
    const closedAt = new Date();
    await tx.enterpriseFiscalPeriod.updateMany({
      where: { organizationId, fiscalYearId: fiscalYear.id, status: { in: ["OPEN", "SOFT_CLOSED", "CLOSED"] } },
      data: { status: "CLOSED", closedAt, updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    const closedYear = await tx.enterpriseFiscalYear.update({
      where: { id: fiscalYear.id },
      data: { status: "CLOSED", closedAt, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFiscalYear",
      entityId: fiscalYear.id,
      eventType: "FISCAL_YEAR_CLOSED_WITH_RETAINED_EARNINGS",
      summary: `Fiscal year ${fiscalYear.code} closed and carried forward`,
      actorUserId,
      fromStatus: fiscalYear.status,
      toStatus: "CLOSED",
      metadataJson: {
        journalEntryId: posting.entry.id,
        nextFiscalYearId: nextYear.id,
        openingPeriodId: nextYear.periods[0].id,
        carryForwardPolicy: "CONTINUOUS_LEDGER_RETAINED_EARNINGS",
      },
    });
    return { fiscalYear: closedYear, posting, nextYear };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function finalizeAssetDisposal(
  organizationId: string,
  profileId: string,
  disposalId: string,
  actorUserId: string,
  input: { revision: number },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAssetDisposal" WHERE id = ${disposalId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const disposal = await tx.enterpriseAssetDisposal.findFirst({
      where: { id: disposalId, organizationId, assetAccountingProfileId: profileId },
      include: { profile: true },
    });
    if (!disposal) throw new EnterpriseAccountingError("ASSET_DISPOSAL_NOT_FOUND", 404);
    if (disposal.status === "POSTED" && disposal.journalEntryId) {
      const entry = await tx.enterpriseJournalEntry.findFirstOrThrow({ where: { id: disposal.journalEntryId, organizationId }, include: { lines: true } });
      return { disposal, entry, idempotent: true };
    }
    if (disposal.revision !== input.revision) {
      throw new EnterpriseAccountingError("ASSET_DISPOSAL_REVISION_CONFLICT", 409, { currentRevision: disposal.revision });
    }
    if (disposal.status !== "DRAFT" || disposal.profile.status !== "ACTIVE") {
      throw new EnterpriseAccountingError("ASSET_DISPOSAL_NOT_POSTABLE", 409);
    }
    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: "ASSET_DISPOSAL_POSTED",
      sourceEntityType: "EnterpriseAssetDisposal",
      sourceEntityId: disposal.id,
    });
    const posted = await tx.enterpriseAssetDisposal.update({
      where: { id: disposal.id },
      data: {
        status: "POSTED",
        journalEntryId: posting.entry.id,
        approvedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    await tx.enterpriseAssetAccountingProfile.update({
      where: { id: disposal.profile.id },
      data: { status: "DISPOSED", revision: { increment: 1 } },
    });
    await tx.enterpriseAssetDepreciationSchedule.updateMany({
      where: {
        organizationId,
        assetAccountingProfileId: disposal.profile.id,
        scheduledDate: { gt: disposal.disposalDate },
        status: { in: ["PLANNED", "APPROVED"] },
      },
      data: { status: "CANCELLED" },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseAssetDisposal",
      entityId: disposal.id,
      eventType: "ASSET_DISPOSAL_POSTED",
      summary: `Asset disposal ${disposal.profile.assetId} posted`,
      actorUserId,
      fromStatus: disposal.status,
      toStatus: "POSTED",
      metadataJson: {
        journalEntryId: posting.entry.id,
        grossValue: disposal.grossValue.toFixed(),
        accumulatedDepreciation: disposal.accumulatedDepreciation.toFixed(),
        netBookValue: disposal.netBookValue.toFixed(),
        proceeds: disposal.proceeds.toFixed(),
        gainLoss: disposal.gainLoss.toFixed(),
        currency: disposal.currencyCode,
      },
    });
    return { disposal: posted, entry: posting.entry, idempotent: posting.idempotent };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}
