import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { serializeFinanceValue } from "@/lib/enterprise/accounting/helpers";

export type FinancialStatementType = "TRIAL_BALANCE" | "GENERAL_LEDGER" | "JOURNALS" | "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW" | "AR_AGING" | "AP_AGING" | "TREASURY" | "BUDGET_VS_ACTUAL" | "TAX" | "ASSET_REGISTER" | "INVENTORY_VALUATION";

function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(serializeFinanceValue(value))).digest("hex");
}

async function assertStatementCurrency(organizationId: string, currencyCode: string) {
  const config = await prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
  if (!config) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
  if (currencyCode !== config.functionalCurrencyCode) throw new EnterpriseAccountingError("FINANCIAL_STATEMENT_FUNCTIONAL_CURRENCY_REQUIRED", 409, { functionalCurrencyCode: config.functionalCurrencyCode });
  return config;
}

async function trialBalance(organizationId: string, periodStart: Date, periodEnd: Date) {
  return prisma.$queryRaw<Array<{ accountId: string; code: string; nameFr: string; nameEn: string; accountType: string; accountSubtype: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal; balance: Prisma.Decimal }>>(Prisma.sql`
    SELECT a.id AS "accountId", a.code, a."nameFr", a."nameEn", a."accountType", a."accountSubtype",
      COALESCE(SUM(l.debit), 0) AS debit,
      COALESCE(SUM(l.credit), 0) AS credit,
      COALESCE(SUM(l.debit - l.credit), 0) AS balance
    FROM "EnterpriseLedgerAccount" a
    LEFT JOIN "EnterpriseJournalLine" l ON l."ledgerAccountId" = a.id AND l."organizationId" = a."organizationId"
    LEFT JOIN "EnterpriseJournalEntry" e ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
      AND e.status = 'POSTED' AND e."accountingDate" BETWEEN ${periodStart} AND ${periodEnd}
    WHERE a."organizationId" = ${organizationId} AND a."archivedAt" IS NULL
    GROUP BY a.id, a.code, a."nameFr", a."nameEn", a."accountType", a."accountSubtype"
    ORDER BY a.code ASC
  `);
}

async function generalLedger(organizationId: string, periodStart: Date, periodEnd: Date) {
  return prisma.$queryRaw<Array<{ entryId: string; entryNumber: string; accountingDate: Date; journalCode: string; accountCode: string; accountName: string; description: string | null; reference: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal; businessPartyId: string | null; projectId: string | null }>>(Prisma.sql`
    SELECT e.id AS "entryId", e.number AS "entryNumber", e."accountingDate", j.code AS "journalCode", a.code AS "accountCode", a."nameFr" AS "accountName", l.description, e.reference, l.debit, l.credit, l."businessPartyId", l."projectId"
    FROM "EnterpriseJournalLine" l
    INNER JOIN "EnterpriseJournalEntry" e ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
    INNER JOIN "EnterpriseJournal" j ON j.id = e."journalId" AND j."organizationId" = e."organizationId"
    INNER JOIN "EnterpriseLedgerAccount" a ON a.id = l."ledgerAccountId" AND a."organizationId" = l."organizationId"
    WHERE l."organizationId" = ${organizationId} AND e.status = 'POSTED' AND e."accountingDate" BETWEEN ${periodStart} AND ${periodEnd}
    ORDER BY e."accountingDate" ASC, e.number ASC, l."createdAt" ASC
    LIMIT 50000
  `);
}

async function journalSummary(organizationId: string, periodStart: Date, periodEnd: Date) {
  return prisma.$queryRaw<Array<{ journalCode: string; journalType: string; entryCount: bigint; debit: Prisma.Decimal; credit: Prisma.Decimal }>>(Prisma.sql`
    SELECT j.code AS "journalCode", j."journalType", COUNT(DISTINCT e.id)::bigint AS "entryCount", COALESCE(SUM(l.debit), 0) AS debit, COALESCE(SUM(l.credit), 0) AS credit
    FROM "EnterpriseJournalEntry" e
    INNER JOIN "EnterpriseJournal" j ON j.id = e."journalId" AND j."organizationId" = e."organizationId"
    INNER JOIN "EnterpriseJournalLine" l ON l."journalEntryId" = e.id AND l."organizationId" = e."organizationId"
    WHERE e."organizationId" = ${organizationId} AND e.status = 'POSTED' AND e."accountingDate" BETWEEN ${periodStart} AND ${periodEnd}
    GROUP BY j.code, j."journalType"
    ORDER BY j.code
  `);
}

async function incomeStatement(organizationId: string, periodStart: Date, periodEnd: Date) {
  const rows = await trialBalance(organizationId, periodStart, periodEnd);
  const revenueTypes = new Set(["REVENUE", "OTHER_INCOME"]);
  const expenseTypes = new Set(["EXPENSE", "OTHER_EXPENSE"]);
  const revenueRows = rows.filter((row) => revenueTypes.has(row.accountType)).map((row) => ({ ...row, statementAmount: row.credit.minus(row.debit) }));
  const expenseRows = rows.filter((row) => expenseTypes.has(row.accountType)).map((row) => ({ ...row, statementAmount: row.debit.minus(row.credit) }));
  const revenue = revenueRows.reduce((total, row) => total.plus(row.statementAmount), new Prisma.Decimal(0));
  const expenses = expenseRows.reduce((total, row) => total.plus(row.statementAmount), new Prisma.Decimal(0));
  return { revenueRows, expenseRows, revenue, expenses, result: revenue.minus(expenses), equation: "Result = Revenue - Expenses" };
}

async function balanceSheet(organizationId: string, periodEnd: Date) {
  const rows = await trialBalance(organizationId, new Date("1900-01-01T00:00:00.000Z"), periodEnd);
  const assets = rows.filter((row) => row.accountType === "ASSET").map((row) => ({ ...row, statementAmount: row.debit.minus(row.credit) }));
  const liabilities = rows.filter((row) => row.accountType === "LIABILITY").map((row) => ({ ...row, statementAmount: row.credit.minus(row.debit) }));
  const equity = rows.filter((row) => row.accountType === "EQUITY").map((row) => ({ ...row, statementAmount: row.credit.minus(row.debit) }));
  const income = await incomeStatement(organizationId, new Date("1900-01-01T00:00:00.000Z"), periodEnd);
  const assetTotal = assets.reduce((total, row) => total.plus(row.statementAmount), new Prisma.Decimal(0));
  const liabilityTotal = liabilities.reduce((total, row) => total.plus(row.statementAmount), new Prisma.Decimal(0));
  const equityTotal = equity.reduce((total, row) => total.plus(row.statementAmount), new Prisma.Decimal(0)).plus(income.result);
  const difference = assetTotal.minus(liabilityTotal.plus(equityTotal));
  return { assets, liabilities, equity, currentResult: income.result, assetTotal, liabilityTotal, equityTotal, difference, balanced: difference.abs().lte(new Prisma.Decimal("0.000001")), equation: "Assets = Liabilities + Equity" };
}

async function cashFlow(organizationId: string, periodStart: Date, periodEnd: Date) {
  const rows = await prisma.$queryRaw<Array<{ accountType: string; transactionType: string; direction: string; amount: Prisma.Decimal }>>(Prisma.sql`
    SELECT fa."accountType", t."transactionType", t.direction, COALESCE(SUM(t.amount), 0) AS amount
    FROM "EnterpriseTreasuryTransaction" t
    INNER JOIN "EnterpriseFinancialAccount" fa ON fa.id = t."financialAccountId" AND fa."organizationId" = t."organizationId"
    WHERE t."organizationId" = ${organizationId} AND t.status = 'CONFIRMED' AND t."transactionDate" BETWEEN ${periodStart} AND ${periodEnd}
    GROUP BY fa."accountType", t."transactionType", t.direction
    ORDER BY fa."accountType", t."transactionType", t.direction
  `);
  const classified = rows.map((row) => ({ ...row, classification: ["CUSTOMER_PAYMENT", "SUPPLIER_PAYMENT", "PAYROLL_PAYMENT", "EXPENSE_REIMBURSEMENT", "TAX_PAYMENT"].includes(row.transactionType) ? "OPERATING" : row.transactionType === "ASSET" ? "INVESTING" : "FINANCING", signedAmount: row.direction === "INBOUND" ? row.amount : row.amount.negated() }));
  const totals = classified.reduce<Record<string, Prisma.Decimal>>((acc, row) => ({ ...acc, [row.classification]: (acc[row.classification] || new Prisma.Decimal(0)).plus(row.signedAmount) }), {});
  return { method: "DIRECT_OPERATIONAL_CLASSIFICATION", reliableFor: "Internal configurable cash-flow view", rows: classified, totals, netCashFlow: Object.values(totals).reduce((total, amount) => total.plus(amount), new Prisma.Decimal(0)) };
}

async function aging(organizationId: string, periodEnd: Date, type: "AR" | "AP") {
  const source = type === "AR"
    ? await prisma.enterpriseReceivable.findMany({ where: { organizationId, status: "OPEN", outstandingAmount: { gt: 0 } }, include: { salesInvoice: true } })
    : await prisma.enterprisePayable.findMany({ where: { organizationId, status: "OPEN", outstandingAmount: { gt: 0 } }, include: { supplierInvoice: true } });
  const buckets = { current: new Prisma.Decimal(0), days1to30: new Prisma.Decimal(0), days31to60: new Prisma.Decimal(0), days61to90: new Prisma.Decimal(0), over90: new Prisma.Decimal(0) };
  const rows = source.map((row) => {
    const dueDate = row.dueDate || periodEnd;
    const days = Math.max(0, Math.floor((periodEnd.getTime() - dueDate.getTime()) / 86400000));
    const bucket = days === 0 ? "current" : days <= 30 ? "days1to30" : days <= 60 ? "days31to60" : days <= 90 ? "days61to90" : "over90";
    buckets[bucket] = buckets[bucket].plus(row.outstandingAmount);
    return { id: row.id, dueDate, daysPastDue: days, outstandingAmount: row.outstandingAmount, currencyCode: row.currencyCode, reference: type === "AR" && "salesInvoice" in row ? row.salesInvoice.number : type === "AP" && "supplierInvoice" in row ? row.supplierInvoice.number : row.id, bucket };
  });
  return { rows, buckets };
}

async function treasuryStatement(organizationId: string) {
  return prisma.enterpriseFinancialAccount.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ accountType: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, accountType: true, currencyCode: true, openingBalance: true, operationalBalance: true, reconciledBalance: true, availableBalance: true, status: true, maskedReference: true } });
}

async function budgetVsActual(organizationId: string, periodStart: Date, periodEnd: Date) {
  return prisma.$queryRaw<Array<{ budgetLineId: string; budgetName: string; lineName: string; plannedAmount: Prisma.Decimal; committedAmount: Prisma.Decimal; realizedAmount: Prisma.Decimal; approvedExpenseAmount: Prisma.Decimal }>>(Prisma.sql`
    SELECT bl.id AS "budgetLineId", b.title AS "budgetName", bl.name AS "lineName", bl."plannedAmount",
      COALESCE(SUM(DISTINCT c."committedAmount" - c."releasedAmount"), 0) AS "committedAmount",
      COALESCE(SUM(DISTINCT c."realizedAmount"), 0) AS "realizedAmount",
      COALESCE(SUM(DISTINCT CASE WHEN e.status = 'APPROVED' THEN e.amount ELSE 0 END), 0) AS "approvedExpenseAmount"
    FROM "EnterpriseBudgetLine" bl
    INNER JOIN "EnterpriseBudget" b ON b.id = bl."budgetId" AND b."organizationId" = bl."organizationId"
    LEFT JOIN "EnterpriseBudgetCommitment" c ON c."budgetLineId" = bl.id AND c."organizationId" = bl."organizationId"
    LEFT JOIN "EnterpriseExpense" e ON e."budgetLineId" = bl.id AND e."organizationId" = bl."organizationId" AND e."expenseDate" BETWEEN ${periodStart} AND ${periodEnd}
    WHERE bl."organizationId" = ${organizationId} AND b."periodStart" <= ${periodEnd} AND b."periodEnd" >= ${periodStart}
    GROUP BY bl.id, b.title, bl.name, bl."plannedAmount"
    ORDER BY b.title, bl.name
  `);
}

async function taxStatement(organizationId: string, periodStart: Date, periodEnd: Date) {
  return prisma.$queryRaw<Array<{ taxCodeId: string; code: string; category: string; currencyCode: string; taxableAmount: Prisma.Decimal; outputTax: Prisma.Decimal; inputTax: Prisma.Decimal; netTax: Prisma.Decimal }>>(Prisma.sql`
    SELECT t."taxCodeId", c.code, c.category, t."currencyCode", SUM(t."taxableAmount") AS "taxableAmount",
      SUM(CASE WHEN t.direction = 'OUTPUT' THEN t."taxAmount" ELSE 0 END) AS "outputTax",
      SUM(CASE WHEN t.direction = 'INPUT' THEN t."taxAmount" ELSE 0 END) AS "inputTax",
      SUM(CASE WHEN t.direction = 'OUTPUT' THEN t."taxAmount" ELSE -t."taxAmount" END) AS "netTax"
    FROM "EnterpriseTaxLine" t
    INNER JOIN "EnterpriseTaxCode" c ON c.id = t."taxCodeId" AND c."organizationId" = t."organizationId"
    WHERE t."organizationId" = ${organizationId} AND t."createdAt" BETWEEN ${periodStart} AND ${periodEnd}
    GROUP BY t."taxCodeId", c.code, c.category, t."currencyCode"
    ORDER BY c.code, t."currencyCode"
  `);
}

async function assetRegister(organizationId: string, periodEnd: Date) {
  return prisma.enterpriseAssetAccountingProfile.findMany({ where: { organizationId, inServiceDate: { lte: periodEnd } }, include: { schedules: { where: { status: "POSTED", scheduledDate: { lte: periodEnd } } }, disposals: true }, orderBy: { inServiceDate: "asc" } });
}

async function inventoryValuation(organizationId: string, periodEnd: Date) {
  return prisma.$queryRaw<Array<{ inventoryItemId: string; warehouseId: string | null; currencyCode: string; quantity: Prisma.Decimal; value: Prisma.Decimal }>>(Prisma.sql`
    SELECT "inventoryItemId", "warehouseId", "currencyCode", COALESCE(SUM("remainingQuantity"), 0) AS quantity, COALESCE(SUM("remainingQuantity" * "unitCost"), 0) AS value
    FROM "EnterpriseInventoryCostLayer"
    WHERE "organizationId" = ${organizationId} AND "effectiveAt" <= ${periodEnd}
    GROUP BY "inventoryItemId", "warehouseId", "currencyCode"
    ORDER BY "inventoryItemId", "warehouseId", "currencyCode"
  `);
}

export async function generateFinancialStatement(
  organizationId: string,
  actorUserId: string,
  input: { statementType: FinancialStatementType; periodStart: Date; periodEnd: Date; currencyCode: string; publish?: boolean },
) {
  await assertStatementCurrency(organizationId, input.currencyCode);
  if (input.periodEnd < input.periodStart) throw new EnterpriseAccountingError("FINANCIAL_STATEMENT_PERIOD_INVALID", 400);
  const snapshot = await (async () => {
    switch (input.statementType) {
      case "TRIAL_BALANCE": return trialBalance(organizationId, input.periodStart, input.periodEnd);
      case "GENERAL_LEDGER": return generalLedger(organizationId, input.periodStart, input.periodEnd);
      case "JOURNALS": return journalSummary(organizationId, input.periodStart, input.periodEnd);
      case "INCOME_STATEMENT": return incomeStatement(organizationId, input.periodStart, input.periodEnd);
      case "BALANCE_SHEET": return balanceSheet(organizationId, input.periodEnd);
      case "CASH_FLOW": return cashFlow(organizationId, input.periodStart, input.periodEnd);
      case "AR_AGING": return aging(organizationId, input.periodEnd, "AR");
      case "AP_AGING": return aging(organizationId, input.periodEnd, "AP");
      case "TREASURY": return treasuryStatement(organizationId);
      case "BUDGET_VS_ACTUAL": return budgetVsActual(organizationId, input.periodStart, input.periodEnd);
      case "TAX": return taxStatement(organizationId, input.periodStart, input.periodEnd);
      case "ASSET_REGISTER": return assetRegister(organizationId, input.periodEnd);
      case "INVENTORY_VALUATION": return inventoryValuation(organizationId, input.periodEnd);
      default: throw new EnterpriseAccountingError("FINANCIAL_STATEMENT_TYPE_UNSUPPORTED", 400);
    }
  })();
  const serialized = serializeFinanceValue(snapshot) as Prisma.InputJsonValue;
  const digest = checksum(serialized);
  const statement = await prisma.enterpriseFinancialStatementSnapshot.upsert({
    where: { organizationId_statementType_periodStart_periodEnd_currencyCode_checksum: { organizationId, statementType: input.statementType, periodStart: input.periodStart, periodEnd: input.periodEnd, currencyCode: input.currencyCode, checksum: digest } },
    update: input.publish ? { status: "PUBLISHED", publishedByUserId: actorUserId, publishedAt: new Date() } : {},
    create: { organizationId, statementType: input.statementType, periodStart: input.periodStart, periodEnd: input.periodEnd, currencyCode: input.currencyCode, snapshotJson: serialized, checksum: digest, status: input.publish ? "PUBLISHED" : "GENERATED", generatedByUserId: actorUserId, publishedByUserId: input.publish ? actorUserId : null, publishedAt: input.publish ? new Date() : null },
  });
  return { statement, snapshot };
}
