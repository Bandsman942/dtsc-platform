import { Prisma } from "@prisma/client";
import { validateAccountingDimensions } from "@/lib/enterprise/accounting/accounting-dimension-validation";
import type { PostingEvent } from "@/lib/enterprise/accounting/constants";
import { resolveExchangeRate } from "@/lib/enterprise/accounting/currency";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { reverseJournalEntry } from "@/lib/enterprise/accounting/reversal-service";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";
import { prisma } from "@/lib/prisma";

export const ACCOUNTING_AUTOMATION_TYPES = ["RECURRING", "ACCRUAL", "DEFERRAL", "ALLOCATION"] as const;
export type AccountingAutomationType = (typeof ACCOUNTING_AUTOMATION_TYPES)[number];
export const ACCOUNTING_AUTOMATION_FREQUENCIES = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type AccountingAutomationFrequency = (typeof ACCOUNTING_AUTOMATION_FREQUENCIES)[number];

type AutomationLineInput = {
  accountMappingKey: string;
  description: string;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  businessPartyId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  siteId?: string | null;
  assetId?: string | null;
  inventoryItemId?: string | null;
  allocationWeight?: string | null;
};

type AutomationPayloadLine = Omit<AutomationLineInput, "allocationWeight"> & {
  transactionCurrencyCode: string;
  transactionAmount: string;
};

type AutomationPayload = {
  journalType: string;
  currencyCode: string;
  description: string;
  reference: string;
  sourceModule: string;
  lines: AutomationPayloadLine[];
};

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate(), 12, 0, 0));
}

function nextRunDate(date: Date, frequency: AccountingAutomationFrequency) {
  if (frequency === "MONTHLY") return addUtcMonths(date, 1);
  if (frequency === "QUARTERLY") return addUtcMonths(date, 3);
  return addUtcMonths(date, 12);
}

function eventForAutomation(type: AccountingAutomationType): PostingEvent {
  if (type === "RECURRING") return "ACCOUNTING_RECURRING_POSTED";
  if (type === "ACCRUAL") return "ACCOUNTING_ACCRUAL_POSTED";
  if (type === "DEFERRAL") return "ACCOUNTING_DEFERRAL_POSTED";
  return "ACCOUNTING_ALLOCATION_POSTED";
}

function normalizedAmount(value: string, field: string) {
  const amount = new Prisma.Decimal(value);
  if (!amount.gt(0)) throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_AMOUNT_INVALID", 400, { field });
  return money(amount);
}

function assertBalanced(lines: AutomationLineInput[]) {
  const debit = money(sumDecimals(lines.filter((line) => line.direction === "DEBIT").map((line) => normalizedAmount(line.amount, "amount"))));
  const credit = money(sumDecimals(lines.filter((line) => line.direction === "CREDIT").map((line) => normalizedAmount(line.amount, "amount"))));
  if (!debit.equals(credit)) {
    throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_NOT_BALANCED", 409, { debit: debit.toFixed(), credit: credit.toFixed() });
  }
  return debit;
}

async function validateAutomationReferences(
  tx: Prisma.TransactionClient,
  organizationId: string,
  accountingDate: Date,
  lines: AutomationLineInput[],
) {
  await validateAccountingDimensions(tx, organizationId, lines);
  for (const line of lines) {
    await resolveSemanticPostingAccount(tx, {
      organizationId,
      mappingKey: line.accountMappingKey,
      accountingDate,
    });
  }
}

function payloadFromLines(input: {
  journalType: string;
  currencyCode: string;
  description: string;
  reference: string;
  sourceModule?: string;
  lines: AutomationLineInput[];
}): AutomationPayload {
  return {
    journalType: input.journalType,
    currencyCode: input.currencyCode,
    description: input.description,
    reference: input.reference,
    sourceModule: input.sourceModule || "FINANCE_ACCOUNTING",
    lines: input.lines.map((line) => ({
      accountMappingKey: line.accountMappingKey,
      description: line.description,
      direction: line.direction,
      amount: normalizedAmount(line.amount, "amount").toFixed(),
      transactionCurrencyCode: input.currencyCode,
      transactionAmount: normalizedAmount(line.amount, "amount").toFixed(),
      businessPartyId: line.businessPartyId || null,
      projectId: line.projectId || null,
      departmentId: line.departmentId || null,
      siteId: line.siteId || null,
      assetId: line.assetId || null,
      inventoryItemId: line.inventoryItemId || null,
    })),
  };
}

function asJson(value: AutomationPayload) {
  return value as unknown as Prisma.InputJsonValue;
}

export async function listAccountingAutomationTemplates(organizationId: string) {
  return prisma.enterpriseAccountingAutomationTemplate.findMany({
    where: { organizationId },
    include: { lines: { orderBy: { lineNumber: "asc" } }, runs: { orderBy: { accountingDate: "desc" }, take: 5 } },
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });
}

export async function createAccountingAutomationTemplate(
  organizationId: string,
  actorUserId: string,
  input: {
    code: string;
    nameFr: string;
    nameEn: string;
    automationType: AccountingAutomationType;
    journalType?: string;
    currencyCode: string;
    frequency: AccountingAutomationFrequency;
    startDate: Date;
    endDate?: Date | null;
    autoReverse?: boolean;
    reversalDelayDays?: number;
    lines: AutomationLineInput[];
  },
) {
  if (!ACCOUNTING_AUTOMATION_TYPES.includes(input.automationType) || !ACCOUNTING_AUTOMATION_FREQUENCIES.includes(input.frequency)) {
    throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_CONFIGURATION_INVALID", 400);
  }
  if (input.lines.length < 2 || input.lines.length > 500) throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_LINES_INVALID", 400);
  assertBalanced(input.lines);
  if (input.endDate && input.endDate < input.startDate) throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_DATE_RANGE_INVALID", 400);
  const reversalDelayDays = Math.max(1, Math.min(366, input.reversalDelayDays || 1));

  return prisma.$transaction(async (tx) => {
    await validateAutomationReferences(tx, organizationId, input.startDate, input.lines);
    const existing = await tx.enterpriseAccountingAutomationTemplate.findFirst({ where: { organizationId, code: input.code } });
    if (existing) throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_CODE_CONFLICT", 409);
    const template = await tx.enterpriseAccountingAutomationTemplate.create({
      data: {
        organizationId,
        code: input.code.trim().toUpperCase(),
        nameFr: input.nameFr.trim(),
        nameEn: input.nameEn.trim(),
        automationType: input.automationType,
        journalType: (input.journalType || "ADJUSTMENT").toUpperCase(),
        currencyCode: input.currencyCode.trim().toUpperCase(),
        frequency: input.frequency,
        startDate: input.startDate,
        endDate: input.endDate || null,
        nextRunAt: input.startDate,
        autoReverse: Boolean(input.autoReverse),
        reversalDelayDays,
        createdByUserId: actorUserId,
        lines: {
          create: input.lines.map((line, index) => ({
            organizationId,
            lineNumber: index + 1,
            accountMappingKey: line.accountMappingKey.trim(),
            description: line.description.trim(),
            direction: line.direction,
            amount: normalizedAmount(line.amount, `lines.${index}.amount`),
            businessPartyId: line.businessPartyId || null,
            projectId: line.projectId || null,
            departmentId: line.departmentId || null,
            siteId: line.siteId || null,
            assetId: line.assetId || null,
            inventoryItemId: line.inventoryItemId || null,
            allocationWeight: line.allocationWeight ? new Prisma.Decimal(line.allocationWeight) : null,
          })),
        },
      },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseAccountingAutomationTemplate",
      entityId: template.id,
      eventType: "ACCOUNTING_AUTOMATION_TEMPLATE_CREATED",
      summary: `Accounting automation ${template.code} created`,
      actorUserId,
      toStatus: template.status,
      metadataJson: { automationType: template.automationType, frequency: template.frequency },
    });
    return template;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

async function postAutomationRunTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  input: {
    runType: string;
    runKey: string;
    postingEvent: PostingEvent;
    accountingDate: Date;
    reversalDate?: Date | null;
    templateId?: string | null;
    sourceReference?: string | null;
    payload: AutomationPayload;
  },
) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId + ":" + input.runKey}))`);
  const existing = await tx.enterpriseAccountingAutomationRun.findUnique({
    where: { organizationId_runKey: { organizationId, runKey: input.runKey } },
  });
  if (existing?.status === "POSTED" || existing?.status === "REVERSED") {
    return { run: existing, idempotent: true };
  }
  const run = existing
    ? await tx.enterpriseAccountingAutomationRun.update({
        where: { id: existing.id },
        data: { status: "PROCESSING", errorCode: null, errorMessage: null },
      })
    : await tx.enterpriseAccountingAutomationRun.create({
        data: {
          organizationId,
          templateId: input.templateId || null,
          runType: input.runType,
          runKey: input.runKey,
          accountingDate: input.accountingDate,
          reversalDate: input.reversalDate || null,
          status: "PROCESSING",
          payloadJson: asJson(input.payload),
          sourceReference: input.sourceReference || null,
          createdByUserId: actorUserId,
        },
      });

  const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: input.postingEvent,
    sourceEntityType: "EnterpriseAccountingAutomationRun",
    sourceEntityId: run.id,
  });
  const posted = await tx.enterpriseAccountingAutomationRun.update({
    where: { id: run.id },
    data: { status: "POSTED", journalEntryId: posting.entry.id, completedAt: new Date() },
  });
  return { run: posted, idempotent: false };
}

export async function runAccountingAutomationTemplate(
  organizationId: string,
  templateId: string,
  actorUserId: string,
  accountingDate?: Date,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAccountingAutomationTemplate" WHERE id = ${templateId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const template = await tx.enterpriseAccountingAutomationTemplate.findFirst({
      where: { id: templateId, organizationId, status: "ACTIVE" },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });
    if (!template) throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_TEMPLATE_NOT_FOUND", 404);
    const runDate = accountingDate || template.nextRunAt || template.startDate;
    if (runDate < template.startDate || (template.endDate && runDate > template.endDate)) {
      throw new EnterpriseAccountingError("ACCOUNTING_AUTOMATION_DATE_NOT_ELIGIBLE", 409);
    }
    const lines: AutomationLineInput[] = template.lines.map((line) => ({
      accountMappingKey: line.accountMappingKey,
      description: line.description,
      direction: line.direction === "DEBIT" ? "DEBIT" : "CREDIT",
      amount: line.amount.toFixed(),
      businessPartyId: line.businessPartyId,
      projectId: line.projectId,
      departmentId: line.departmentId,
      siteId: line.siteId,
      assetId: line.assetId,
      inventoryItemId: line.inventoryItemId,
      allocationWeight: line.allocationWeight?.toFixed() || null,
    }));
    assertBalanced(lines);
    await validateAutomationReferences(tx, organizationId, runDate, lines);
    const payload = payloadFromLines({
      journalType: template.journalType,
      currencyCode: template.currencyCode,
      description: `${template.code} · ${template.nameFr}`,
      reference: `${template.code}-${utcDay(runDate)}`,
      lines,
    });
    const reversalDate = template.autoReverse
      ? new Date(runDate.getTime() + template.reversalDelayDays * 86_400_000)
      : null;
    const result = await postAutomationRunTx(tx, organizationId, actorUserId, {
      runType: template.automationType,
      runKey: `template:${template.id}:${utcDay(runDate)}`,
      postingEvent: eventForAutomation(template.automationType as AccountingAutomationType),
      accountingDate: runDate,
      reversalDate,
      templateId: template.id,
      sourceReference: template.code,
      payload,
    });
    if (!result.idempotent) {
      const next = nextRunDate(runDate, template.frequency as AccountingAutomationFrequency);
      await tx.enterpriseAccountingAutomationTemplate.update({
        where: { id: template.id },
        data: {
          nextRunAt: template.endDate && next > template.endDate ? null : next,
          status: template.endDate && next > template.endDate ? "COMPLETED" : template.status,
          updatedByUserId: actorUserId,
          revision: { increment: 1 },
        },
      });
    }
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function runDueAccountingAutomations(organizationId: string, actorUserId: string, throughDate: Date) {
  const templates = await prisma.enterpriseAccountingAutomationTemplate.findMany({
    where: { organizationId, status: "ACTIVE", nextRunAt: { lte: throughDate } },
    orderBy: { nextRunAt: "asc" },
    take: 200,
    select: { id: true, nextRunAt: true },
  });
  const results = [];
  for (const template of templates) {
    results.push(await runAccountingAutomationTemplate(organizationId, template.id, actorUserId, template.nextRunAt || throughDate));
  }
  return results;
}

export async function runDueAccountingAutomationReversals(organizationId: string, actorUserId: string, throughDate: Date) {
  const runs = await prisma.enterpriseAccountingAutomationRun.findMany({
    where: {
      organizationId,
      status: "POSTED",
      reversalDate: { lte: throughDate },
      journalEntryId: { not: null },
      reversalJournalEntryId: null,
    },
    orderBy: { reversalDate: "asc" },
    take: 200,
  });
  const results = [];
  for (const run of runs) {
    const reversal = await reverseJournalEntry(organizationId, run.journalEntryId as string, actorUserId, {
      reason: `Automatic reversal ${run.runKey}`,
      accountingDate: run.reversalDate || throughDate,
    });
    const updated = await prisma.enterpriseAccountingAutomationRun.update({
      where: { id: run.id },
      data: { status: "REVERSED", reversalJournalEntryId: reversal.id, reversedAt: new Date() },
    });
    results.push(updated);
  }
  return results;
}

export async function runAccountingAllocation(
  organizationId: string,
  actorUserId: string,
  input: {
    runKey: string;
    accountingDate: Date;
    currencyCode: string;
    description: string;
    sourceAccountMappingKey: string;
    sourceDirection: "DEBIT" | "CREDIT";
    amount: string;
    targets: Array<{
      accountMappingKey: string;
      weight: string;
      description: string;
      projectId?: string | null;
      departmentId?: string | null;
      siteId?: string | null;
    }>;
  },
) {
  const total = normalizedAmount(input.amount, "amount");
  if (input.targets.length < 1 || input.targets.length > 100) throw new EnterpriseAccountingError("ACCOUNTING_ALLOCATION_TARGETS_INVALID", 400);
  const weights = input.targets.map((target) => new Prisma.Decimal(target.weight));
  const weightTotal = sumDecimals(weights);
  if (!money(weightTotal).equals(1)) throw new EnterpriseAccountingError("ACCOUNTING_ALLOCATION_WEIGHTS_INVALID", 409, { total: weightTotal.toFixed() });
  let allocated = new Prisma.Decimal(0);
  const targetDirection: "DEBIT" | "CREDIT" = input.sourceDirection === "DEBIT" ? "CREDIT" : "DEBIT";
  const targets = input.targets.map((target, index) => {
    const amount = index === input.targets.length - 1 ? money(total.minus(allocated)) : money(total.times(weights[index]));
    allocated = allocated.plus(amount);
    return {
      accountMappingKey: target.accountMappingKey,
      description: target.description,
      direction: targetDirection,
      amount: amount.toFixed(),
      projectId: target.projectId || null,
      departmentId: target.departmentId || null,
      siteId: target.siteId || null,
    } satisfies AutomationLineInput;
  });
  const lines: AutomationLineInput[] = [
    {
      accountMappingKey: input.sourceAccountMappingKey,
      description: input.description,
      direction: input.sourceDirection,
      amount: total.toFixed(),
    },
    ...targets,
  ];
  assertBalanced(lines);
  return prisma.$transaction(async (tx) => {
    await validateAutomationReferences(tx, organizationId, input.accountingDate, lines);
    return postAutomationRunTx(tx, organizationId, actorUserId, {
      runType: "ALLOCATION",
      runKey: `allocation:${input.runKey}`,
      postingEvent: "ACCOUNTING_ALLOCATION_POSTED",
      accountingDate: input.accountingDate,
      sourceReference: input.runKey,
      payload: payloadFromLines({
        journalType: "ADJUSTMENT",
        currencyCode: input.currencyCode,
        description: input.description,
        reference: input.runKey,
        lines,
      }),
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

type FxBalanceRow = {
  ledgerAccountId: string;
  transactionCurrencyCode: string;
  transactionNet: Prisma.Decimal;
  functionalNet: Prisma.Decimal;
};

export async function runFxRevaluation(
  organizationId: string,
  actorUserId: string,
  input: { asOf: Date; reversalDate?: Date | null },
) {
  return prisma.$transaction(async (tx) => {
    const configuration = await tx.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true },
    });
    if (!configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
    const functional = configuration.functionalCurrencyCode;
    const balances = await tx.$queryRaw<FxBalanceRow[]>(Prisma.sql`
      SELECT
        line."ledgerAccountId" AS "ledgerAccountId",
        line."transactionCurrencyCode" AS "transactionCurrencyCode",
        COALESCE(SUM(CASE WHEN line.debit > 0 THEN line."transactionAmount" ELSE -line."transactionAmount" END), 0) AS "transactionNet",
        COALESCE(SUM(line.debit - line.credit), 0) AS "functionalNet"
      FROM "EnterpriseJournalLine" line
      INNER JOIN "EnterpriseJournalEntry" entry
        ON entry.id = line."journalEntryId"
        AND entry."organizationId" = line."organizationId"
      WHERE line."organizationId" = ${organizationId}
        AND entry.status = 'POSTED'
        AND entry."accountingDate" <= ${input.asOf}
        AND line."transactionCurrencyCode" IS NOT NULL
        AND line."transactionCurrencyCode" <> ${functional}
        AND line."transactionAmount" IS NOT NULL
      GROUP BY line."ledgerAccountId", line."transactionCurrencyCode"
      HAVING ABS(COALESCE(SUM(CASE WHEN line.debit > 0 THEN line."transactionAmount" ELSE -line."transactionAmount" END), 0)) > 0.000001
    `);
    const lines: AutomationLineInput[] = [];
    for (const balance of balances) {
      const rate = await resolveExchangeRate(tx, {
        organizationId,
        sourceCurrencyCode: balance.transactionCurrencyCode,
        targetCurrencyCode: functional,
        rateDate: input.asOf,
      });
      const closingFunctional = money(new Prisma.Decimal(balance.transactionNet).times(rate));
      const difference = money(closingFunctional.minus(new Prisma.Decimal(balance.functionalNet)));
      if (difference.abs().lte(new Prisma.Decimal("0.000001"))) continue;
      if (difference.gt(0)) {
        lines.push({ accountMappingKey: `ACCOUNT_ID:${balance.ledgerAccountId}`, description: `FX revaluation ${balance.transactionCurrencyCode}`, direction: "DEBIT", amount: difference.toFixed() });
        lines.push({ accountMappingKey: "FX_GAIN", description: `Unrealized FX gain ${balance.transactionCurrencyCode}`, direction: "CREDIT", amount: difference.toFixed() });
      } else {
        const loss = difference.abs();
        lines.push({ accountMappingKey: `ACCOUNT_ID:${balance.ledgerAccountId}`, description: `FX revaluation ${balance.transactionCurrencyCode}`, direction: "CREDIT", amount: loss.toFixed() });
        lines.push({ accountMappingKey: "FX_LOSS", description: `Unrealized FX loss ${balance.transactionCurrencyCode}`, direction: "DEBIT", amount: loss.toFixed() });
      }
    }
    if (!lines.length) return { run: null, idempotent: true, noAdjustment: true };
    assertBalanced(lines);
    await validateAutomationReferences(tx, organizationId, input.asOf, lines);
    const runKey = `fx-revaluation:${utcDay(input.asOf)}`;
    const result = await postAutomationRunTx(tx, organizationId, actorUserId, {
      runType: "FX_REVALUATION",
      runKey,
      postingEvent: "ACCOUNTING_FX_REVALUATION_POSTED",
      accountingDate: input.asOf,
      reversalDate: input.reversalDate || new Date(input.asOf.getTime() + 86_400_000),
      sourceReference: runKey,
      payload: payloadFromLines({
        journalType: "ADJUSTMENT",
        currencyCode: functional,
        description: `Foreign currency revaluation ${utcDay(input.asOf)}`,
        reference: runKey,
        lines,
      }),
    });
    return { ...result, noAdjustment: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function runYearEndClosingEntry(
  organizationId: string,
  fiscalYearId: string,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFiscalYear" WHERE id = ${fiscalYearId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const year = await tx.enterpriseFiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId },
      include: { periods: { orderBy: { endDate: "asc" } } },
    });
    if (!year) throw new EnterpriseAccountingError("FISCAL_YEAR_NOT_FOUND", 404);
    if (!["OPEN", "CLOSING"].includes(year.status)) throw new EnterpriseAccountingError("FISCAL_YEAR_NOT_CLOSABLE", 409, { status: year.status });
    if (!year.periods.length) throw new EnterpriseAccountingError("FISCAL_YEAR_HAS_NO_PERIODS", 409);
    const finalPeriod = year.periods[year.periods.length - 1];
    const earlierOpen = year.periods.slice(0, -1).filter((period) => !["CLOSED", "LOCKED"].includes(period.status));
    if (earlierOpen.length) throw new EnterpriseAccountingError("FISCAL_YEAR_PRIOR_PERIODS_NOT_CLOSED", 409, { count: earlierOpen.length });
    if (!["SOFT_CLOSED", "OPEN"].includes(finalPeriod.status)) throw new EnterpriseAccountingError("FISCAL_YEAR_FINAL_PERIOD_NOT_POSTABLE", 409);
    const approvedClose = await tx.enterpriseFinancialClose.findFirst({
      where: { organizationId, fiscalPeriodId: finalPeriod.id, status: "APPROVED" },
    });
    if (!approvedClose) throw new EnterpriseAccountingError("FISCAL_YEAR_FINAL_CLOSE_APPROVAL_REQUIRED", 409);

    const rows = await tx.enterpriseJournalLine.groupBy({
      by: ["ledgerAccountId"],
      where: {
        organizationId,
        journalEntry: { status: "POSTED", accountingDate: { gte: year.startDate, lte: year.endDate } },
        ledgerAccount: { accountType: { in: ["REVENUE", "OTHER_INCOME", "EXPENSE", "OTHER_EXPENSE"] } },
      },
      _sum: { debit: true, credit: true },
    });
    const lines: AutomationLineInput[] = [];
    let closingDebit = new Prisma.Decimal(0);
    let closingCredit = new Prisma.Decimal(0);
    for (const row of rows) {
      const balance = money(new Prisma.Decimal(row._sum.debit || 0).minus(new Prisma.Decimal(row._sum.credit || 0)));
      if (balance.abs().lte(new Prisma.Decimal("0.000001"))) continue;
      if (balance.gt(0)) {
        const amount = balance.abs();
        lines.push({ accountMappingKey: `ACCOUNT_ID:${row.ledgerAccountId}`, description: `Year-end close ${year.code}`, direction: "CREDIT", amount: amount.toFixed() });
        closingCredit = closingCredit.plus(amount);
      } else {
        const amount = balance.abs();
        lines.push({ accountMappingKey: `ACCOUNT_ID:${row.ledgerAccountId}`, description: `Year-end close ${year.code}`, direction: "DEBIT", amount: amount.toFixed() });
        closingDebit = closingDebit.plus(amount);
      }
    }
    const retainedDifference = money(closingDebit.minus(closingCredit));
    if (!retainedDifference.isZero()) {
      lines.push({
        accountMappingKey: "RETAINED_EARNINGS",
        description: `Retained earnings ${year.code}`,
        direction: retainedDifference.gt(0) ? "CREDIT" : "DEBIT",
        amount: retainedDifference.abs().toFixed(),
      });
    }
    if (!lines.length) throw new EnterpriseAccountingError("FISCAL_YEAR_NO_RESULT_TO_CLOSE", 409);
    assertBalanced(lines);
    await validateAutomationReferences(tx, organizationId, finalPeriod.endDate, lines);
    const configuration = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId }, select: { functionalCurrencyCode: true } });
    if (!configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
    const runKey = `year-end:${year.id}`;
    const result = await postAutomationRunTx(tx, organizationId, actorUserId, {
      runType: "YEAR_END",
      runKey,
      postingEvent: "ACCOUNTING_YEAR_END_POSTED",
      accountingDate: finalPeriod.endDate,
      sourceReference: year.code,
      payload: payloadFromLines({
        journalType: "ADJUSTMENT",
        currencyCode: configuration.functionalCurrencyCode,
        description: `Year-end closing entry ${year.code}`,
        reference: runKey,
        sourceModule: "FINANCE_CLOSE",
        lines,
      }),
    });
    if (year.status !== "CLOSING") {
      await tx.enterpriseFiscalYear.update({ where: { id: year.id }, data: { status: "CLOSING", revision: { increment: 1 } } });
    }
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function finalizeFiscalYearClose(organizationId: string, fiscalYearId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFiscalYear" WHERE id = ${fiscalYearId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const year = await tx.enterpriseFiscalYear.findFirst({ where: { id: fiscalYearId, organizationId }, include: { periods: true } });
    if (!year) throw new EnterpriseAccountingError("FISCAL_YEAR_NOT_FOUND", 404);
    if (year.status === "CLOSED") return year;
    if (year.status !== "CLOSING") throw new EnterpriseAccountingError("FISCAL_YEAR_NOT_CLOSING", 409);
    if (year.periods.some((period) => !["CLOSED", "LOCKED"].includes(period.status))) {
      throw new EnterpriseAccountingError("FISCAL_YEAR_PERIODS_NOT_CLOSED", 409);
    }
    const run = await tx.enterpriseAccountingAutomationRun.findUnique({
      where: { organizationId_runKey: { organizationId, runKey: `year-end:${year.id}` } },
    });
    if (!run || !["POSTED", "REVERSED"].includes(run.status) || !run.journalEntryId) {
      throw new EnterpriseAccountingError("FISCAL_YEAR_CLOSING_ENTRY_REQUIRED", 409);
    }
    const closed = await tx.enterpriseFiscalYear.update({
      where: { id: year.id },
      data: { status: "CLOSED", closedAt: new Date(), revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFiscalYear",
      entityId: year.id,
      eventType: "FISCAL_YEAR_CLOSED",
      summary: `Fiscal year ${year.code} closed`,
      actorUserId,
      fromStatus: year.status,
      toStatus: "CLOSED",
      metadataJson: { yearEndJournalEntryId: run.journalEntryId },
    });
    return closed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
