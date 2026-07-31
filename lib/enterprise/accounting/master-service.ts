import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

export async function createFiscalYear(
  organizationId: string,
  actorUserId: string,
  input: { code: string; startDate: Date; endDate: Date },
) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const overlap = await tx.enterpriseFiscalYear.findFirst({
      where: { organizationId, OR: [{ startDate: { lte: input.endDate }, endDate: { gte: input.startDate } }] },
    });
    if (overlap) throw new EnterpriseAccountingError("FISCAL_YEAR_OVERLAP", 409, { fiscalYearId: overlap.id });
    const year = await tx.enterpriseFiscalYear.create({ data: { organizationId, code: input.code, startDate: input.startDate, endDate: input.endDate, createdByUserId: actorUserId } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseFiscalYear", entityId: year.id, eventType: "FISCAL_YEAR_CREATED", summary: `Fiscal year ${year.code} created`, actorUserId, toStatus: "DRAFT" });
    return year;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function openFiscalYear(organizationId: string, fiscalYearId: string, actorUserId: string, revision: number) {
  return prisma.$transaction(async (tx) => {
    const year = await tx.enterpriseFiscalYear.findFirst({ where: { id: fiscalYearId, organizationId }, include: { periods: true } });
    if (!year) throw new EnterpriseAccountingError("FISCAL_YEAR_NOT_FOUND", 404);
    if (year.status !== "DRAFT" || year.revision !== revision || year.periods.length === 0) throw new EnterpriseAccountingError("FISCAL_YEAR_NOT_OPENABLE", 409);
    const updated = await tx.enterpriseFiscalYear.update({ where: { id: year.id }, data: { status: "OPEN", openedAt: new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseFiscalYear", entityId: year.id, eventType: "FISCAL_YEAR_OPENED", summary: `Fiscal year ${year.code} opened`, actorUserId, fromStatus: year.status, toStatus: "OPEN" });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createFiscalPeriod(
  organizationId: string,
  actorUserId: string,
  input: { fiscalYearId: string; code: string; startDate: Date; endDate: Date },
) {
  return prisma.$transaction(async (tx) => {
    const year = await tx.enterpriseFiscalYear.findFirst({ where: { id: input.fiscalYearId, organizationId, status: { in: ["DRAFT", "OPEN"] } } });
    if (!year || input.startDate < year.startDate || input.endDate > year.endDate) throw new EnterpriseAccountingError("FISCAL_PERIOD_OUTSIDE_YEAR", 409);
    const overlap = await tx.enterpriseFiscalPeriod.findFirst({ where: { organizationId, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } } });
    if (overlap) throw new EnterpriseAccountingError("FISCAL_PERIOD_OVERLAP", 409, { fiscalPeriodId: overlap.id });
    const period = await tx.enterpriseFiscalPeriod.create({ data: { organizationId, fiscalYearId: year.id, code: input.code, startDate: input.startDate, endDate: input.endDate, status: "OPEN", createdByUserId: actorUserId } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseFiscalPeriod", entityId: period.id, eventType: "FISCAL_PERIOD_CREATED", summary: `Fiscal period ${period.code} created`, actorUserId, toStatus: "OPEN" });
    return period;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createChartOfAccounts(organizationId: string, actorUserId: string, input: { code: string; nameFr: string; nameEn: string; templateCode?: string }) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const chart = await tx.enterpriseChartOfAccounts.create({ data: { organizationId, code: input.code, nameFr: input.nameFr, nameEn: input.nameEn, templateCode: input.templateCode || null, createdByUserId: actorUserId } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseChartOfAccounts", entityId: chart.id, eventType: "CHART_OF_ACCOUNTS_CREATED", summary: `Chart ${chart.code} created`, actorUserId, toStatus: "DRAFT" });
    return chart;
  });
}

export async function createLedgerAccount(
  organizationId: string,
  actorUserId: string,
  input: {
    chartId: string;
    accountGroupId?: string;
    code: string;
    nameFr: string;
    nameEn: string;
    accountType: string;
    accountSubtype?: string;
    parentId?: string;
    currencyCode?: string;
    isControlAccount: boolean;
    isSystemAccount: boolean;
    allowDirectPosting: boolean;
  },
) {
  return prisma.$transaction(async (tx) => {
    const chart = await tx.enterpriseChartOfAccounts.findFirst({ where: { id: input.chartId, organizationId, status: { in: ["DRAFT", "ACTIVE"] } } });
    if (!chart) throw new EnterpriseAccountingError("CHART_OF_ACCOUNTS_INVALID", 409);
    let level = 1;
    if (input.parentId) {
      const parent = await tx.enterpriseLedgerAccount.findFirst({ where: { id: input.parentId, organizationId, chartId: chart.id } });
      if (!parent) throw new EnterpriseAccountingError("LEDGER_PARENT_INVALID", 409);
      if (parent.accountType !== input.accountType) throw new EnterpriseAccountingError("LEDGER_PARENT_TYPE_MISMATCH", 409);
      level = parent.level + 1;
    }
    if (input.accountGroupId) {
      const group = await tx.enterpriseAccountGroup.findFirst({ where: { id: input.accountGroupId, organizationId, chartId: chart.id } });
      if (!group || group.accountType !== input.accountType) throw new EnterpriseAccountingError("ACCOUNT_GROUP_INVALID", 409);
    }
    const account = await tx.enterpriseLedgerAccount.create({ data: { organizationId, chartId: chart.id, accountGroupId: input.accountGroupId || null, code: input.code, nameFr: input.nameFr, nameEn: input.nameEn, accountType: input.accountType, accountSubtype: input.accountSubtype || null, parentId: input.parentId || null, level, currencyCode: input.currencyCode || null, isControlAccount: input.isControlAccount, isSystemAccount: input.isSystemAccount, allowDirectPosting: input.allowDirectPosting } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseLedgerAccount", entityId: account.id, eventType: "LEDGER_ACCOUNT_CREATED", summary: `Ledger account ${account.code} created`, actorUserId, toStatus: "ACTIVE", metadataJson: { accountType: account.accountType, accountSubtype: account.accountSubtype } });
    return account;
  });
}

export async function deactivateLedgerAccount(organizationId: string, accountId: string, actorUserId: string, revision: number) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.enterpriseLedgerAccount.findFirst({ where: { id: accountId, organizationId } });
    if (!account) throw new EnterpriseAccountingError("LEDGER_ACCOUNT_NOT_FOUND", 404);
    if (account.revision !== revision) throw new EnterpriseAccountingError("LEDGER_ACCOUNT_REVISION_CONFLICT", 409);
    if (account.isSystemAccount) throw new EnterpriseAccountingError("SYSTEM_ACCOUNT_REQUIRES_REINFORCED_PERMISSION", 403);
    const updated = await tx.enterpriseLedgerAccount.update({ where: { id: account.id }, data: { isActive: false, revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseLedgerAccount", entityId: account.id, eventType: "LEDGER_ACCOUNT_DEACTIVATED", summary: `Ledger account ${account.code} deactivated`, actorUserId, fromStatus: "ACTIVE", toStatus: "INACTIVE" });
    return updated;
  });
}

export async function createJournal(organizationId: string, actorUserId: string, input: { code: string; nameFr: string; nameEn: string; journalType: string; sequencePrefix?: string; requiresApproval: boolean }) {
  return prisma.$transaction(async (tx) => {
    const journal = await tx.enterpriseJournal.create({ data: { organizationId, code: input.code, nameFr: input.nameFr, nameEn: input.nameEn, journalType: input.journalType, sequencePrefix: input.sequencePrefix || null, requiresApproval: input.requiresApproval, createdByUserId: actorUserId } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseJournal", entityId: journal.id, eventType: "JOURNAL_CREATED", summary: `Journal ${journal.code} created`, actorUserId, toStatus: "ACTIVE" });
    return journal;
  });
}

export async function upsertAccountMapping(organizationId: string, actorUserId: string, input: { mappingKey: string; ledgerAccountId: string; sourceModule?: string; sourceEntityType?: string; effectiveFrom?: Date; effectiveTo?: Date }) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.enterpriseLedgerAccount.findFirst({ where: { id: input.ledgerAccountId, organizationId, isActive: true, archivedAt: null } });
    if (!account) throw new EnterpriseAccountingError("ACCOUNT_MAPPING_LEDGER_INVALID", 409);
    const mapping = await tx.enterpriseAccountMapping.create({ data: { organizationId, mappingKey: input.mappingKey, ledgerAccountId: account.id, sourceModule: input.sourceModule || null, sourceEntityType: input.sourceEntityType || null, effectiveFrom: input.effectiveFrom || null, effectiveTo: input.effectiveTo || null, createdByUserId: actorUserId } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseAccountMapping", entityId: mapping.id, eventType: "ACCOUNT_MAPPING_CREATED", summary: `Account mapping ${mapping.mappingKey} created`, actorUserId, toStatus: "ACTIVE", metadataJson: { ledgerAccountId: account.id } });
    return mapping;
  });
}

export async function createTaxCode(
  organizationId: string,
  actorUserId: string,
  input: { code: string; nameFr: string; nameEn: string; category: string; jurisdiction?: string; payableAccountId?: string; recoverableAccountId?: string; roundingRule: string; rate: string; effectiveFrom: Date },
) {
  return prisma.$transaction(async (tx) => {
    for (const accountId of [input.payableAccountId, input.recoverableAccountId].filter(Boolean) as string[]) {
      const account = await tx.enterpriseLedgerAccount.findFirst({ where: { id: accountId, organizationId, isActive: true, archivedAt: null } });
      if (!account) throw new EnterpriseAccountingError("TAX_LEDGER_ACCOUNT_INVALID", 409);
    }
    const taxCode = await tx.enterpriseTaxCode.create({ data: { organizationId, code: input.code, nameFr: input.nameFr, nameEn: input.nameEn, category: input.category, jurisdiction: input.jurisdiction || null, payableAccountId: input.payableAccountId || null, recoverableAccountId: input.recoverableAccountId || null, roundingRule: input.roundingRule, rates: { create: { organizationId, rate: new Prisma.Decimal(input.rate), effectiveFrom: input.effectiveFrom, createdByUserId: actorUserId } } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseTaxCode", entityId: taxCode.id, eventType: "TAX_CODE_CREATED", summary: `Tax code ${taxCode.code} created`, actorUserId, toStatus: "ACTIVE", metadataJson: { category: taxCode.category, jurisdiction: taxCode.jurisdiction } });
    return taxCode;
  });
}

export const DRAFT_CHART_TEMPLATES = {
  GENERIC_SMALL_BUSINESS: [
    ["1000", "Trésorerie", "Cash and cash equivalents", "ASSET", "CASH"],
    ["1100", "Créances clients", "Accounts receivable", "ASSET", "ACCOUNTS_RECEIVABLE"],
    ["1200", "Stocks", "Inventory", "ASSET", "INVENTORY"],
    ["1500", "Immobilisations", "Fixed assets", "ASSET", "FIXED_ASSET"],
    ["1590", "Amortissements cumulés", "Accumulated depreciation", "ASSET", "ACCUMULATED_DEPRECIATION"],
    ["2000", "Dettes fournisseurs", "Accounts payable", "LIABILITY", "ACCOUNTS_PAYABLE"],
    ["2100", "Taxes à payer", "Tax payable", "LIABILITY", "TAX_PAYABLE"],
    ["2200", "Dettes salariales", "Payroll payable", "LIABILITY", "PAYROLL_PAYABLE"],
    ["3000", "Capitaux propres", "Equity", "EQUITY", "RETAINED_EARNINGS"],
    ["4000", "Produits", "Revenue", "REVENUE", "REVENUE"],
    ["5000", "Coût des ventes", "Cost of sales", "EXPENSE", "COST_OF_SALES"],
    ["6000", "Charges d'exploitation", "Operating expenses", "EXPENSE", "OPERATING_EXPENSE"],
    ["9990", "Compte de passage", "Clearing", "ASSET", "CLEARING"],
  ] as const,
};

export async function applyDraftChartTemplate(organizationId: string, actorUserId: string, chartId: string, templateCode: keyof typeof DRAFT_CHART_TEMPLATES) {
  return prisma.$transaction(async (tx) => {
    const [chart, postedEntries, accounts] = await Promise.all([
      tx.enterpriseChartOfAccounts.findFirst({ where: { id: chartId, organizationId, status: "DRAFT" } }),
      tx.enterpriseJournalEntry.count({ where: { organizationId, status: "POSTED" } }),
      tx.enterpriseLedgerAccount.count({ where: { organizationId, chartId } }),
    ]);
    if (!chart || postedEntries > 0 || accounts > 0) throw new EnterpriseAccountingError("CHART_TEMPLATE_NOT_APPLICABLE", 409);
    const template = DRAFT_CHART_TEMPLATES[templateCode];
    await tx.enterpriseLedgerAccount.createMany({ data: template.map(([code, nameFr, nameEn, accountType, accountSubtype]) => ({ organizationId, chartId, code, nameFr, nameEn, accountType, accountSubtype, isSystemAccount: true, allowDirectPosting: !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(accountSubtype) })) });
    return tx.enterpriseChartOfAccounts.update({ where: { id: chart.id }, data: { templateCode, status: "ACTIVE", revision: { increment: 1 } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
