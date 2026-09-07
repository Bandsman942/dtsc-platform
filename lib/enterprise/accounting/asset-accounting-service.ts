import { Prisma } from "@prisma/client";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { prisma } from "@/lib/prisma";

function addMonthsUtc(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export async function createAssetAccountingProfile(
  organizationId: string,
  assetId: string,
  actorUserId: string,
  input: {
    capitalizationSourceType: string;
    capitalizationSourceId?: string;
    currencyCode: string;
    originalCost: string;
    residualValue: string;
    usefulLifeMonths: number;
    inServiceDate: Date;
    assetAccountId: string;
    accumulatedDepreciationAccountId: string;
    depreciationExpenseAccountId: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.enterpriseAsset.findFirst({ where: { id: assetId, organizationId, archivedAt: null, status: { notIn: ["DISPOSED", "ARCHIVED", "CANCELLED"] } } });
    if (!asset) throw new EnterpriseAccountingError("ASSET_NOT_FOUND", 404);

    let profile = await tx.enterpriseAssetAccountingProfile.findUnique({ where: { organizationId_assetId: { organizationId, assetId } } });
    if (!profile) {
      const accountIds = [input.assetAccountId, input.accumulatedDepreciationAccountId, input.depreciationExpenseAccountId];
      const accounts = await tx.enterpriseLedgerAccount.findMany({ where: { organizationId, id: { in: accountIds }, isActive: true, archivedAt: null } });
      if (accounts.length !== 3) throw new EnterpriseAccountingError("ASSET_ACCOUNTING_ACCOUNTS_INVALID", 409);
      const assetAccount = accounts.find((account) => account.id === input.assetAccountId);
      const accumulatedAccount = accounts.find((account) => account.id === input.accumulatedDepreciationAccountId);
      const expenseAccount = accounts.find((account) => account.id === input.depreciationExpenseAccountId);
      if (assetAccount?.accountType !== "ASSET" || accumulatedAccount?.accountType !== "ASSET" || !["EXPENSE", "OTHER_EXPENSE"].includes(expenseAccount?.accountType || "")) {
        throw new EnterpriseAccountingError("ASSET_ACCOUNTING_ACCOUNT_TYPES_INVALID", 409);
      }

      const originalCost = new Prisma.Decimal(input.originalCost);
      const residualValue = new Prisma.Decimal(input.residualValue);
      if (!originalCost.isPositive() || residualValue.isNegative() || residualValue.greaterThanOrEqualTo(originalCost) || input.usefulLifeMonths <= 0) {
        throw new EnterpriseAccountingError("ASSET_DEPRECIATION_PARAMETERS_INVALID", 400);
      }

      profile = await tx.enterpriseAssetAccountingProfile.create({
        data: {
          organizationId,
          assetId: asset.id,
          capitalizationSourceType: input.capitalizationSourceType,
          capitalizationSourceId: input.capitalizationSourceId || null,
          currencyCode: input.currencyCode,
          originalCost,
          residualValue,
          usefulLifeMonths: input.usefulLifeMonths,
          inServiceDate: input.inServiceDate,
          depreciationMethod: "STRAIGHT_LINE",
          depreciationFrequency: "MONTHLY",
          assetAccountId: input.assetAccountId,
          accumulatedDepreciationAccountId: input.accumulatedDepreciationAccountId,
          depreciationExpenseAccountId: input.depreciationExpenseAccountId,
        },
      });

      const depreciableAmount = originalCost.minus(residualValue);
      const monthly = money(depreciableAmount.dividedBy(input.usefulLifeMonths));
      let accumulated = new Prisma.Decimal(0);
      const schedules: Prisma.EnterpriseAssetDepreciationScheduleCreateManyInput[] = [];
      for (let index = 0; index < input.usefulLifeMonths; index += 1) {
        const amount = index === input.usefulLifeMonths - 1 ? money(depreciableAmount.minus(accumulated)) : monthly;
        const openingNetBookValue = money(originalCost.minus(accumulated));
        accumulated = accumulated.plus(amount);
        const closingNetBookValue = money(originalCost.minus(accumulated));
        const scheduledDate = addMonthsUtc(input.inServiceDate, index + 1);
        const periodCode = `${scheduledDate.getUTCFullYear()}-${String(scheduledDate.getUTCMonth() + 1).padStart(2, "0")}`;
        schedules.push({ organizationId, assetAccountingProfileId: profile.id, periodCode, scheduledDate, openingNetBookValue, depreciationAmount: amount, closingNetBookValue, idempotencyKey: `${organizationId}:asset-depreciation:${profile.id}:${periodCode}` });
      }
      await tx.enterpriseAssetDepreciationSchedule.createMany({ data: schedules });
      await publishFinanceEvent(tx, {
        organizationId,
        entityType: "EnterpriseAssetAccountingProfile",
        entityId: profile.id,
        eventType: "ASSET_ACCOUNTING_PROFILE_CREATED",
        summary: `Asset ${asset.code} accounting profile created`,
        actorUserId,
        toStatus: "ACTIVE",
        metadataJson: { originalCost: originalCost.toFixed(), residualValue: residualValue.toFixed(), usefulLifeMonths: input.usefulLifeMonths, currency: input.currencyCode },
      });
    }

    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: "ASSET_CAPITALIZED",
      sourceEntityType: "EnterpriseAssetAccountingProfile",
      sourceEntityId: profile.id,
    });
    return { profile, posting };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function postAssetDepreciation(organizationId: string, scheduleId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAssetDepreciationSchedule" WHERE id = ${scheduleId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const schedule = await tx.enterpriseAssetDepreciationSchedule.findFirst({ where: { id: scheduleId, organizationId }, include: { profile: true } });
    if (!schedule) throw new EnterpriseAccountingError("ASSET_DEPRECIATION_SCHEDULE_NOT_FOUND", 404);
    if (schedule.status === "POSTED") return schedule;
    if (![["PLANNED", "APPROVED"].includes(schedule.status), schedule.profile.status === "ACTIVE"].every(Boolean)) {
      throw new EnterpriseAccountingError("ASSET_DEPRECIATION_NOT_ELIGIBLE", 409);
    }
    if (schedule.status === "PLANNED") await tx.enterpriseAssetDepreciationSchedule.update({ where: { id: schedule.id }, data: { status: "APPROVED" } });
    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: "ASSET_DEPRECIATION_POSTED",
      sourceEntityType: "EnterpriseAssetDepreciationSchedule",
      sourceEntityId: schedule.id,
    });
    await tx.enterpriseAssetDepreciationEntry.upsert({
      where: { organizationId_depreciationScheduleId: { organizationId, depreciationScheduleId: schedule.id } },
      update: { journalEntryId: posting.entry.id },
      create: { organizationId, depreciationScheduleId: schedule.id, journalEntryId: posting.entry.id, amount: schedule.depreciationAmount, postedByUserId: actorUserId },
    });
    const posted = await tx.enterpriseAssetDepreciationSchedule.update({ where: { id: schedule.id }, data: { status: "POSTED", journalEntryId: posting.entry.id, postedAt: new Date() } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseAssetDepreciationSchedule", entityId: schedule.id, eventType: "ASSET_DEPRECIATION_POSTED", summary: `Asset depreciation ${schedule.periodCode} posted`, actorUserId, fromStatus: schedule.status, toStatus: "POSTED", metadataJson: { journalEntryId: posting.entry.id, amount: schedule.depreciationAmount.toFixed() } });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function runDueAssetDepreciation(organizationId: string, actorUserId: string, throughDate: Date) {
  const schedules = await prisma.enterpriseAssetDepreciationSchedule.findMany({ where: { organizationId, status: "PLANNED", scheduledDate: { lte: throughDate }, profile: { status: "ACTIVE" } }, orderBy: { scheduledDate: "asc" }, take: 500 });
  const results = [];
  for (const schedule of schedules) results.push(await postAssetDepreciation(organizationId, schedule.id, actorUserId));
  return results;
}

export async function disposeEnterpriseAsset(
  organizationId: string,
  profileId: string,
  actorUserId: string,
  input: {
    disposalDate: Date;
    proceedsAmount: string;
    proceedsCurrencyCode: string;
    reason: string;
    proceedsLedgerAccountId?: string | null;
    gainLedgerAccountId?: string | null;
    lossLedgerAccountId?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAssetAccountingProfile" WHERE id = ${profileId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const profile = await tx.enterpriseAssetAccountingProfile.findFirst({ where: { id: profileId, organizationId, status: "ACTIVE" }, include: { schedules: { where: { status: "POSTED", scheduledDate: { lte: input.disposalDate } } }, disposals: true } });
    if (!profile || profile.disposals.length) throw new EnterpriseAccountingError("ASSET_NOT_DISPOSABLE", 409);
    if (input.proceedsCurrencyCode !== profile.currencyCode) throw new EnterpriseAccountingError("ASSET_DISPOSAL_CURRENCY_MISMATCH", 409);
    const asset = await tx.enterpriseAsset.findFirst({ where: { id: profile.assetId, organizationId, archivedAt: null } });
    if (!asset || asset.status === "DISPOSED") throw new EnterpriseAccountingError("ASSET_NOT_DISPOSABLE", 409);
    const [assignment, maintenance, incident, pendingDepreciation] = await Promise.all([
      tx.enterpriseAssetAssignment.findFirst({ where: { organizationId, assetId: asset.id, status: "ACTIVE" }, select: { id: true } }),
      tx.enterpriseAssetMaintenance.findFirst({ where: { organizationId, assetId: asset.id, archivedAt: null, status: "IN_PROGRESS" }, select: { id: true } }),
      tx.enterpriseAssetIncident.findFirst({ where: { organizationId, assetId: asset.id, archivedAt: null, status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } }, select: { id: true } }),
      tx.enterpriseAssetDepreciationSchedule.count({ where: { organizationId, assetAccountingProfileId: profile.id, scheduledDate: { lte: input.disposalDate }, status: { in: ["PLANNED", "APPROVED"] } } }),
    ]);
    if (assignment || maintenance || incident) throw new EnterpriseAccountingError("ASSET_DISPOSAL_OPERATIONAL_BLOCKER", 409);
    if (pendingDepreciation > 0) throw new EnterpriseAccountingError("ASSET_DISPOSAL_DEPRECIATION_PENDING", 409, { count: pendingDepreciation });

    const accumulated = profile.schedules.reduce<Prisma.Decimal>((total, schedule) => total.plus(schedule.depreciationAmount), new Prisma.Decimal(0));
    const netBookValue = money(profile.originalCost.minus(accumulated));
    const proceeds = new Prisma.Decimal(input.proceedsAmount);
    if (proceeds.isNegative()) throw new EnterpriseAccountingError("ASSET_DISPOSAL_PROCEEDS_INVALID", 400);
    const gainLoss = money(proceeds.minus(netBookValue));
    const requiredAccountIds = [
      ...(proceeds.gt(0) && input.proceedsLedgerAccountId ? [input.proceedsLedgerAccountId] : []),
      ...(gainLoss.gt(0) && input.gainLedgerAccountId ? [input.gainLedgerAccountId] : []),
      ...(gainLoss.lt(0) && input.lossLedgerAccountId ? [input.lossLedgerAccountId] : []),
    ];
    if (proceeds.gt(0) && !input.proceedsLedgerAccountId) throw new EnterpriseAccountingError("ASSET_DISPOSAL_PROCEEDS_ACCOUNT_REQUIRED", 409);
    if (gainLoss.gt(0) && !input.gainLedgerAccountId) throw new EnterpriseAccountingError("ASSET_DISPOSAL_GAIN_ACCOUNT_REQUIRED", 409);
    if (gainLoss.lt(0) && !input.lossLedgerAccountId) throw new EnterpriseAccountingError("ASSET_DISPOSAL_LOSS_ACCOUNT_REQUIRED", 409);
    const accounts = requiredAccountIds.length ? await tx.enterpriseLedgerAccount.findMany({ where: { organizationId, id: { in: requiredAccountIds }, isActive: true, archivedAt: null } }) : [];
    if (accounts.length !== new Set(requiredAccountIds).size) throw new EnterpriseAccountingError("ASSET_DISPOSAL_ACCOUNT_INVALID", 409);
    const proceedsAccount = accounts.find((account) => account.id === input.proceedsLedgerAccountId);
    const gainAccount = accounts.find((account) => account.id === input.gainLedgerAccountId);
    const lossAccount = accounts.find((account) => account.id === input.lossLedgerAccountId);
    if (proceedsAccount && proceedsAccount.accountType !== "ASSET") throw new EnterpriseAccountingError("ASSET_DISPOSAL_PROCEEDS_ACCOUNT_INVALID", 409);
    if (gainAccount && !["REVENUE", "OTHER_INCOME"].includes(gainAccount.accountType)) throw new EnterpriseAccountingError("ASSET_DISPOSAL_GAIN_ACCOUNT_INVALID", 409);
    if (lossAccount && !["EXPENSE", "OTHER_EXPENSE"].includes(lossAccount.accountType)) throw new EnterpriseAccountingError("ASSET_DISPOSAL_LOSS_ACCOUNT_INVALID", 409);

    const disposal = await tx.enterpriseAssetDisposal.create({
      data: { organizationId, assetAccountingProfileId: profile.id, disposalDate: input.disposalDate, proceeds, currencyCode: profile.currencyCode, grossValue: profile.originalCost, accumulatedDepreciation: accumulated, netBookValue, gainLoss, createdByUserId: actorUserId, status: "DRAFT" },
    });
    await tx.enterpriseAssetDisposalAccountingSettlement.create({
      data: { organizationId, assetDisposalId: disposal.id, proceedsLedgerAccountId: input.proceedsLedgerAccountId || null, gainLedgerAccountId: input.gainLedgerAccountId || null, lossLedgerAccountId: input.lossLedgerAccountId || null, reason: input.reason, createdByUserId: actorUserId },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseAssetDisposal", entityId: disposal.id, eventType: "ASSET_DISPOSAL_PREPARED", summary: "Asset disposal prepared", actorUserId, toStatus: "DRAFT", metadataJson: { grossValue: profile.originalCost.toFixed(), accumulatedDepreciation: accumulated.toFixed(), netBookValue: netBookValue.toFixed(), proceeds: proceeds.toFixed(), gainLoss: gainLoss.toFixed(), currency: profile.currencyCode, reason: input.reason.slice(0, 500) } });
    return disposal;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveAndPostEnterpriseAssetDisposal(
  organizationId: string,
  disposalId: string,
  actorUserId: string,
  revision: number,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAssetDisposal" WHERE id = ${disposalId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const disposal = await tx.enterpriseAssetDisposal.findFirst({ where: { id: disposalId, organizationId }, include: { profile: true } });
    if (!disposal) throw new EnterpriseAccountingError("ASSET_DISPOSAL_NOT_FOUND", 404);
    if (disposal.status === "POSTED" && disposal.journalEntryId) return disposal;
    if (disposal.status !== "DRAFT" || disposal.revision !== revision) throw new EnterpriseAccountingError("ASSET_DISPOSAL_CONFLICT", 409);
    assertIndependentActor({ actorUserId, relatedUserIds: [disposal.createdByUserId], errorCode: "ASSET_DISPOSAL_SELF_APPROVAL_FORBIDDEN" });
    await tx.enterpriseAssetDisposal.update({ where: { id: disposal.id }, data: { status: "APPROVED", approvedByUserId: actorUserId, revision: { increment: 1 } } });
    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, { postingEvent: "ASSET_DISPOSAL_POSTED", sourceEntityType: "EnterpriseAssetDisposal", sourceEntityId: disposal.id });
    const posted = await tx.enterpriseAssetDisposal.update({ where: { id: disposal.id }, data: { status: "POSTED", journalEntryId: posting.entry.id, revision: { increment: 1 } } });
    await tx.enterpriseAssetAccountingProfile.update({ where: { id: disposal.profile.id }, data: { status: "DISPOSED", revision: { increment: 1 } } });
    await tx.enterpriseAsset.update({ where: { id: disposal.profile.assetId }, data: { status: "DISPOSED", revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseAssetDisposal", entityId: disposal.id, eventType: "ASSET_DISPOSAL_POSTED", summary: "Asset disposal approved and posted", actorUserId, fromStatus: "DRAFT", toStatus: "POSTED", metadataJson: { journalEntryId: posting.entry.id, gainLoss: disposal.gainLoss.toFixed(), currency: disposal.currencyCode } });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}
