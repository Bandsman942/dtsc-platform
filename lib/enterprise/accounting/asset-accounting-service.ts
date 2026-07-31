import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";

function addMonthsUtc(date: Date, months: number) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  return next;
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
  const profile = await prisma.$transaction(async (tx) => {
    const asset = await tx.enterpriseAsset.findFirst({ where: { id: assetId, organizationId, archivedAt: null } });
    if (!asset) throw new EnterpriseAccountingError("ASSET_NOT_FOUND", 404);
    const existing = await tx.enterpriseAssetAccountingProfile.findUnique({ where: { assetId } });
    if (existing) return existing;
    const accountIds = [input.assetAccountId, input.accumulatedDepreciationAccountId, input.depreciationExpenseAccountId];
    const accounts = await tx.enterpriseLedgerAccount.findMany({ where: { organizationId, id: { in: accountIds }, isActive: true, archivedAt: null } });
    if (accounts.length !== 3) throw new EnterpriseAccountingError("ASSET_ACCOUNTING_ACCOUNTS_INVALID", 409);
    const originalCost = new Prisma.Decimal(input.originalCost);
    const residualValue = new Prisma.Decimal(input.residualValue);
    if (!originalCost.isPositive() || residualValue.isNegative() || residualValue.greaterThanOrEqualTo(originalCost) || input.usefulLifeMonths <= 0) throw new EnterpriseAccountingError("ASSET_DEPRECIATION_PARAMETERS_INVALID", 400);
    const created = await tx.enterpriseAssetAccountingProfile.create({ data: { organizationId, assetId: asset.id, capitalizationSourceType: input.capitalizationSourceType, capitalizationSourceId: input.capitalizationSourceId || null, currencyCode: input.currencyCode, originalCost, residualValue, usefulLifeMonths: input.usefulLifeMonths, inServiceDate: input.inServiceDate, depreciationMethod: "STRAIGHT_LINE", depreciationFrequency: "MONTHLY", assetAccountId: input.assetAccountId, accumulatedDepreciationAccountId: input.accumulatedDepreciationAccountId, depreciationExpenseAccountId: input.depreciationExpenseAccountId, createdByUserId: actorUserId } });
    const depreciableAmount = originalCost.minus(residualValue);
    const monthly = money(depreciableAmount.dividedBy(input.usefulLifeMonths));
    let accumulated = new Prisma.Decimal(0);
    const schedules = [];
    for (let index = 0; index < input.usefulLifeMonths; index += 1) {
      const amount = index === input.usefulLifeMonths - 1 ? money(depreciableAmount.minus(accumulated)) : monthly;
      accumulated = accumulated.plus(amount);
      const scheduledDate = addMonthsUtc(input.inServiceDate, index + 1);
      schedules.push({ organizationId, profileId: created.id, periodCode: `${scheduledDate.getUTCFullYear()}-${String(scheduledDate.getUTCMonth() + 1).padStart(2, "0")}`, scheduledDate, openingBookValue: originalCost.minus(accumulated).plus(amount), depreciationAmount: amount, closingBookValue: originalCost.minus(accumulated) });
    }
    await tx.enterpriseAssetDepreciationSchedule.createMany({ data: schedules });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseAssetAccountingProfile", entityId: created.id, eventType: "ASSET_ACCOUNTING_PROFILE_CREATED", summary: `Asset ${asset.code} accounting profile created`, actorUserId, toStatus: "ACTIVE", metadataJson: { originalCost: originalCost.toFixed(), residualValue: residualValue.toFixed(), usefulLifeMonths: input.usefulLifeMonths, currency: input.currencyCode } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  const posting = await postBusinessEvent(organizationId, actorUserId, { postingEvent: "ASSET_CAPITALIZED", sourceEntityType: "EnterpriseAssetAccountingProfile", sourceEntityId: profile.id });
  await prisma.enterpriseAssetAccountingProfile.update({ where: { id: profile.id }, data: { capitalizationJournalEntryId: posting.entry.id } });
  return { profile, posting };
}

export async function postAssetDepreciation(organizationId: string, scheduleId: string, actorUserId: string) {
  const approved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAssetDepreciationSchedule" WHERE id = ${scheduleId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const schedule = await tx.enterpriseAssetDepreciationSchedule.findFirst({ where: { id: scheduleId, organizationId }, include: { profile: true } });
    if (!schedule) throw new EnterpriseAccountingError("ASSET_DEPRECIATION_SCHEDULE_NOT_FOUND", 404);
    if (schedule.status === "POSTED") return schedule;
    if (schedule.status !== "PLANNED" || schedule.profile.status !== "ACTIVE") throw new EnterpriseAccountingError("ASSET_DEPRECIATION_NOT_ELIGIBLE", 409);
    return tx.enterpriseAssetDepreciationSchedule.update({ where: { id: schedule.id }, data: { status: "APPROVED" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (approved.status === "POSTED") return approved;
  const posting = await postBusinessEvent(organizationId, actorUserId, { postingEvent: "ASSET_DEPRECIATION_POSTED", sourceEntityType: "EnterpriseAssetDepreciationSchedule", sourceEntityId: approved.id });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAssetDepreciationSchedule" WHERE id = ${approved.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterpriseAssetDepreciationSchedule.findFirstOrThrow({ where: { id: approved.id, organizationId } });
    if (current.status === "POSTED") return current;
    await tx.enterpriseAssetDepreciationEntry.create({ data: { organizationId, scheduleId: current.id, journalEntryId: posting.entry.id, amount: current.depreciationAmount, postedByUserId: actorUserId } });
    const posted = await tx.enterpriseAssetDepreciationSchedule.update({ where: { id: current.id }, data: { status: "POSTED", journalEntryId: posting.entry.id, postedAt: new Date() } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseAssetDepreciationSchedule", entityId: current.id, eventType: "ASSET_DEPRECIATION_POSTED", summary: `Asset depreciation ${current.periodCode} posted`, actorUserId, fromStatus: current.status, toStatus: "POSTED", metadataJson: { journalEntryId: posting.entry.id, amount: current.depreciationAmount.toFixed() } });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
  input: { disposalDate: Date; proceedsAmount: string; proceedsCurrencyCode: string; reason: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAssetAccountingProfile" WHERE id = ${profileId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const profile = await tx.enterpriseAssetAccountingProfile.findFirst({ where: { id: profileId, organizationId, status: "ACTIVE" }, include: { schedules: { where: { status: "POSTED", scheduledDate: { lte: input.disposalDate } } }, disposals: true } });
    if (!profile || profile.disposals.length) throw new EnterpriseAccountingError("ASSET_NOT_DISPOSABLE", 409);
    const accumulated = profile.schedules.reduce<Prisma.Decimal>((total, schedule) => total.plus(schedule.depreciationAmount), new Prisma.Decimal(0));
    const netBookValue = money(profile.originalCost.minus(accumulated));
    const proceeds = new Prisma.Decimal(input.proceedsAmount);
    const gainOrLoss = money(proceeds.minus(netBookValue));
    const disposal = await tx.enterpriseAssetDisposal.create({ data: { organizationId, profileId: profile.id, disposalDate: input.disposalDate, proceedsAmount: proceeds, proceedsCurrencyCode: input.proceedsCurrencyCode, grossBookValue: profile.originalCost, accumulatedDepreciation: accumulated, netBookValue, gainOrLoss, reason: input.reason, createdByUserId: actorUserId, status: "PENDING_APPROVAL" } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseAssetDisposal", entityId: disposal.id, eventType: "ASSET_DISPOSAL_PREPARED", summary: `Asset disposal prepared`, actorUserId, toStatus: "PENDING_APPROVAL", metadataJson: { grossBookValue: profile.originalCost.toFixed(), accumulatedDepreciation: accumulated.toFixed(), netBookValue: netBookValue.toFixed(), proceeds: proceeds.toFixed(), gainOrLoss: gainOrLoss.toFixed(), currency: input.proceedsCurrencyCode } });
    return disposal;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
