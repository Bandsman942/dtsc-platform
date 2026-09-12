import { Prisma } from "@prisma/client";
import { resolveC5SemanticAliasAccount } from "@/lib/enterprise/accounting/c5-semantic-aliases";
import { getFinanceConfiguration, resolveExchangeRateDetails, snapshotExchangeRate } from "@/lib/enterprise/accounting/currency";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import type { PostingBuilder, PostingDocument, PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";

const MONETARY_ACCOUNT_SUBTYPES = [
  "CASH",
  "BANK",
  "MOBILE_MONEY",
  "ACCOUNTS_RECEIVABLE",
  "ACCOUNTS_PAYABLE",
  "TAX_RECEIVABLE",
  "TAX_PAYABLE",
  "PAYROLL_PAYABLE",
  "CLEARING",
] as const;

// Some monetary balances intentionally have no dedicated account subtype in the
// immutable baseline. Resolve their eligibility through active semantic mappings
// instead of treating every untyped asset/liability as monetary.
const MONETARY_SEMANTIC_KEYS = [
  "BORROWINGS",
  "CUSTOMER_ADVANCES",
  "SUPPLIER_ADVANCES",
  "EMPLOYEE_PAYABLE",
  "PAYROLL_WITHHOLDING_PAYABLE",
  "SOCIAL_SECURITY_PAYABLE",
  "ACCRUED_RECEIVABLES",
  "ACCRUED_PAYABLES",
] as const;

function parseFxSourceId(sourceEntityId: string) {
  const separator = sourceEntityId.lastIndexOf(":");
  if (separator <= 0 || separator === sourceEntityId.length - 1) {
    throw new EnterpriseAccountingError("FX_REVALUATION_SOURCE_INVALID", 409);
  }
  return {
    fiscalPeriodId: sourceEntityId.slice(0, separator),
    currencyCode: sourceEntityId.slice(separator + 1).trim().toUpperCase(),
  };
}

type FxBalanceRow = {
  ledgerAccountId: string;
  businessPartyId: string | null;
  projectId: string | null;
  departmentId: string | null;
  siteId: string | null;
  assetId: string | null;
  inventoryItemId: string | null;
  transactionBalance: Prisma.Decimal;
  functionalBalance: Prisma.Decimal;
};

export const buildClosingFxRevaluationPosting: PostingBuilder = async (tx, input) => {
  if (input.sourceEntityType !== "EnterpriseFxRevaluation") {
    throw new EnterpriseAccountingError("FX_REVALUATION_SOURCE_INVALID", 409);
  }
  const { fiscalPeriodId, currencyCode } = parseFxSourceId(input.sourceEntityId);
  const [period, configuration] = await Promise.all([
    tx.enterpriseFiscalPeriod.findFirst({ where: { id: fiscalPeriodId, organizationId: input.organizationId } }),
    getFinanceConfiguration(tx, input.organizationId),
  ]);
  if (!period) throw new EnterpriseAccountingError("FISCAL_PERIOD_NOT_FOUND", 404);
  if (!["OPEN", "SOFT_CLOSED"].includes(period.status)) {
    throw new EnterpriseAccountingError("FINANCE_PERIOD_CLOSED", 409, { status: period.status });
  }
  if (currencyCode === configuration.functionalCurrencyCode) {
    throw new EnterpriseAccountingError("FX_REVALUATION_FOREIGN_CURRENCY_REQUIRED", 409);
  }

  const resolution = await resolveExchangeRateDetails(tx, {
    organizationId: input.organizationId,
    sourceCurrencyCode: currencyCode,
    targetCurrencyCode: configuration.functionalCurrencyCode,
    rateDate: period.endDate,
  });
  await snapshotExchangeRate(tx, {
    organizationId: input.organizationId,
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    sourceCurrencyCode: currencyCode,
    targetCurrencyCode: configuration.functionalCurrencyCode,
    rateDate: resolution.rateDate,
    rate: resolution.rate,
    source: `CLOSING:${resolution.direction}:${resolution.rateId || "NONE"}:${resolution.source}`,
  });

  const rows = await tx.$queryRaw<FxBalanceRow[]>(Prisma.sql`
    SELECT
      l."ledgerAccountId" AS "ledgerAccountId",
      l."businessPartyId" AS "businessPartyId",
      l."projectId" AS "projectId",
      l."departmentId" AS "departmentId",
      l."siteId" AS "siteId",
      l."assetId" AS "assetId",
      l."inventoryItemId" AS "inventoryItemId",
      COALESCE(SUM(CASE WHEN l.debit > 0 THEN l."transactionAmount" ELSE -l."transactionAmount" END), 0) AS "transactionBalance",
      COALESCE(SUM(l.debit - l.credit), 0) AS "functionalBalance"
    FROM "EnterpriseJournalLine" l
    INNER JOIN "EnterpriseJournalEntry" e
      ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
    INNER JOIN "EnterpriseLedgerAccount" a
      ON a.id = l."ledgerAccountId" AND a."organizationId" = l."organizationId"
    WHERE l."organizationId" = ${input.organizationId}
      AND e.status IN ('POSTED', 'REVERSED')
      AND e."accountingDate" <= ${period.endDate}
      AND l."transactionCurrencyCode" = ${currencyCode}
      AND l."transactionAmount" IS NOT NULL
      AND (
        a."accountSubtype" IN (${Prisma.join([...MONETARY_ACCOUNT_SUBTYPES])})
        OR EXISTS (
          SELECT 1
          FROM "EnterpriseAccountMapping" m
          WHERE m."organizationId" = a."organizationId"
            AND m."ledgerAccountId" = a.id
            AND m."mappingKey" IN (${Prisma.join([...MONETARY_SEMANTIC_KEYS])})
            AND m."isActive" = TRUE
            AND (m."effectiveFrom" IS NULL OR m."effectiveFrom" <= ${period.endDate})
            AND (m."effectiveTo" IS NULL OR m."effectiveTo" >= ${period.endDate})
        )
      )
    GROUP BY
      l."ledgerAccountId",
      l."businessPartyId",
      l."projectId",
      l."departmentId",
      l."siteId",
      l."assetId",
      l."inventoryItemId"
  `);

  const lines: PostingLineDraft[] = [];
  let gainTotal = new Prisma.Decimal(0);
  let lossTotal = new Prisma.Decimal(0);
  for (const row of rows) {
    const targetFunctional = money(new Prisma.Decimal(row.transactionBalance).times(resolution.rate));
    const adjustment = money(targetFunctional.minus(row.functionalBalance));
    if (adjustment.isZero()) continue;
    const amount = adjustment.abs();
    lines.push({
      accountMappingKey: `ACCOUNT_ID:${row.ledgerAccountId}`,
      description: `Closing FX revaluation ${currencyCode}`,
      debit: adjustment.gt(0) ? amount : undefined,
      credit: adjustment.lt(0) ? amount : undefined,
      transactionCurrencyCode: configuration.functionalCurrencyCode,
      transactionAmount: amount,
      businessPartyId: row.businessPartyId,
      projectId: row.projectId,
      departmentId: row.departmentId,
      siteId: row.siteId,
      assetId: row.assetId,
      inventoryItemId: row.inventoryItemId,
    });
    if (adjustment.gt(0)) gainTotal = gainTotal.plus(amount);
    else lossTotal = lossTotal.plus(amount);
  }
  if (lines.length === 0) throw new EnterpriseAccountingError("FX_REVALUATION_NOT_REQUIRED", 409, { currencyCode, fiscalPeriodId });
  if (gainTotal.gt(0)) {
    lines.push({
      accountMappingKey: "FX_GAIN",
      description: `Unrealized FX gain ${currencyCode}`,
      credit: money(gainTotal),
      transactionCurrencyCode: configuration.functionalCurrencyCode,
      transactionAmount: money(gainTotal),
    });
  }
  if (lossTotal.gt(0)) {
    lines.push({
      accountMappingKey: "FX_LOSS",
      description: `Unrealized FX loss ${currencyCode}`,
      debit: money(lossTotal),
      transactionCurrencyCode: configuration.functionalCurrencyCode,
      transactionAmount: money(lossTotal),
    });
  }

  return {
    organizationId: input.organizationId,
    journalType: "ADJUSTMENT",
    accountingDate: period.endDate,
    documentDate: period.endDate,
    reference: `${period.code}-${currencyCode}`,
    description: `Closing FX revaluation ${period.code} ${currencyCode}`,
    sourceModule: "FINANCE_CLOSE",
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    currencyCode: configuration.functionalCurrencyCode,
    lines,
  };
};

type YearEndBalanceRow = {
  ledgerAccountId: string;
  balance: Prisma.Decimal;
};

export const buildYearEndClosingPosting: PostingBuilder = async (tx, input) => {
  if (input.sourceEntityType !== "EnterpriseFiscalYear") {
    throw new EnterpriseAccountingError("YEAR_END_SOURCE_INVALID", 409);
  }
  const [fiscalYear, configuration] = await Promise.all([
    tx.enterpriseFiscalYear.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId } }),
    getFinanceConfiguration(tx, input.organizationId),
  ]);
  if (!fiscalYear) throw new EnterpriseAccountingError("FISCAL_YEAR_NOT_FOUND", 404);
  const rows = await tx.$queryRaw<YearEndBalanceRow[]>(Prisma.sql`
    SELECT a.id AS "ledgerAccountId", COALESCE(SUM(l.debit - l.credit), 0) AS balance
    FROM "EnterpriseLedgerAccount" a
    INNER JOIN "EnterpriseJournalLine" l
      ON l."ledgerAccountId" = a.id AND l."organizationId" = a."organizationId"
    INNER JOIN "EnterpriseJournalEntry" e
      ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
    WHERE a."organizationId" = ${input.organizationId}
      AND a."accountType" IN ('REVENUE', 'OTHER_INCOME', 'EXPENSE', 'OTHER_EXPENSE')
      AND e.status IN ('POSTED', 'REVERSED')
      AND e."accountingDate" BETWEEN ${fiscalYear.startDate} AND ${fiscalYear.endDate}
    GROUP BY a.id
    HAVING ABS(COALESCE(SUM(l.debit - l.credit), 0)) > 0.000001
    ORDER BY a.id ASC
  `);
  if (!rows.length) throw new EnterpriseAccountingError("YEAR_END_NO_BALANCE_TO_CLOSE", 409);

  const lines: PostingLineDraft[] = rows.map((row) => {
    const balance = money(row.balance);
    const amount = balance.abs();
    return {
      accountMappingKey: `ACCOUNT_ID:${row.ledgerAccountId}`,
      description: `Year-end close ${fiscalYear.code}`,
      debit: balance.lt(0) ? amount : undefined,
      credit: balance.gt(0) ? amount : undefined,
      transactionCurrencyCode: configuration.functionalCurrencyCode,
      transactionAmount: amount,
    };
  });
  const debit = money(sumDecimals(lines.map((line) => line.debit || 0)));
  const credit = money(sumDecimals(lines.map((line) => line.credit || 0)));
  if (!debit.equals(credit)) {
    const amount = debit.minus(credit).abs();
    lines.push({
      accountMappingKey: "RETAINED_EARNINGS",
      description: `Retained earnings ${fiscalYear.code}`,
      debit: credit.gt(debit) ? amount : undefined,
      credit: debit.gt(credit) ? amount : undefined,
      transactionCurrencyCode: configuration.functionalCurrencyCode,
      transactionAmount: amount,
    });
  }

  return {
    organizationId: input.organizationId,
    journalType: "ADJUSTMENT",
    accountingDate: fiscalYear.endDate,
    documentDate: fiscalYear.endDate,
    reference: fiscalYear.code,
    description: `Year-end close ${fiscalYear.code}`,
    sourceModule: "FINANCE_CLOSE",
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    currencyCode: configuration.functionalCurrencyCode,
    lines,
  };
};

export const buildAssetDisposalPosting: PostingBuilder = async (tx, input) => {
  if (input.sourceEntityType !== "EnterpriseAssetDisposal") {
    throw new EnterpriseAccountingError("ASSET_DISPOSAL_SOURCE_INVALID", 409);
  }
  const disposal = await tx.enterpriseAssetDisposal.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["DRAFT", "APPROVED", "POSTED"] } },
    include: { profile: true },
  });
  if (!disposal) throw new EnterpriseAccountingError("ASSET_DISPOSAL_NOT_POSTABLE", 409);
  const configuration = await getFinanceConfiguration(tx, input.organizationId);
  const grossRows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
    FROM "EnterpriseJournalLine" l
    INNER JOIN "EnterpriseJournalEntry" e
      ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
    WHERE l."organizationId" = ${input.organizationId}
      AND l."ledgerAccountId" = ${disposal.profile.assetAccountId}
      AND l."assetId" = ${disposal.profile.assetId}
      AND e.status IN ('POSTED', 'REVERSED')
      AND e."accountingDate" <= ${disposal.disposalDate}
  `);
  const depreciationRows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
    SELECT COALESCE(SUM(l.credit - l.debit), 0) AS balance
    FROM "EnterpriseJournalLine" l
    INNER JOIN "EnterpriseJournalEntry" e
      ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
    WHERE l."organizationId" = ${input.organizationId}
      AND l."ledgerAccountId" = ${disposal.profile.accumulatedDepreciationAccountId}
      AND l."assetId" = ${disposal.profile.assetId}
      AND e.status IN ('POSTED', 'REVERSED')
      AND e."accountingDate" <= ${disposal.disposalDate}
  `);
  const grossFunctional = money(grossRows[0]?.balance || 0);
  const accumulatedFunctional = money(depreciationRows[0]?.balance || 0);
  if (!grossFunctional.gt(0) || accumulatedFunctional.lt(0) || accumulatedFunctional.gt(grossFunctional)) {
    throw new EnterpriseAccountingError("ASSET_DISPOSAL_LEDGER_BASIS_INVALID", 409);
  }
  const rate = await resolveExchangeRateDetails(tx, {
    organizationId: input.organizationId,
    sourceCurrencyCode: disposal.currencyCode,
    targetCurrencyCode: configuration.functionalCurrencyCode,
    rateDate: disposal.disposalDate,
  });
  const proceedsFunctional = money(disposal.proceeds.times(rate.rate));
  const netBookFunctional = money(grossFunctional.minus(accumulatedFunctional));
  const gainLossFunctional = money(proceedsFunctional.minus(netBookFunctional));
  const lines: PostingLineDraft[] = [];
  if (accumulatedFunctional.gt(0)) {
    lines.push({
      accountMappingKey: `ACCOUNT_ID:${disposal.profile.accumulatedDepreciationAccountId}`,
      description: `Derecognize accumulated depreciation ${disposal.profile.assetId}`,
      debit: accumulatedFunctional,
      transactionCurrencyCode: configuration.functionalCurrencyCode,
      transactionAmount: accumulatedFunctional,
      assetId: disposal.profile.assetId,
    });
  }
  if (disposal.proceeds.gt(0)) {
    lines.push({
      accountMappingKey: "ASSET_CLEARING",
      description: `Asset disposal proceeds ${disposal.profile.assetId}`,
      debit: disposal.proceeds,
      transactionCurrencyCode: disposal.currencyCode,
      transactionAmount: disposal.proceeds,
      assetId: disposal.profile.assetId,
    });
  }
  if (gainLossFunctional.gt(0)) {
    const gainAccount = await resolveC5SemanticAliasAccount(tx, { organizationId: input.organizationId, alias: "ASSET_DISPOSAL_GAIN", accountingDate: disposal.disposalDate });
    lines.push({
      accountMappingKey: `ACCOUNT_ID:${gainAccount.id}`,
      description: `Asset disposal gain ${disposal.profile.assetId}`,
      credit: gainLossFunctional,
      transactionCurrencyCode: configuration.functionalCurrencyCode,
      transactionAmount: gainLossFunctional,
      assetId: disposal.profile.assetId,
    });
  } else if (gainLossFunctional.lt(0)) {
    const loss = gainLossFunctional.abs();
    const lossAccount = await resolveC5SemanticAliasAccount(tx, { organizationId: input.organizationId, alias: "ASSET_DISPOSAL_LOSS", accountingDate: disposal.disposalDate });
    lines.push({
      accountMappingKey: `ACCOUNT_ID:${lossAccount.id}`,
      description: `Asset disposal loss ${disposal.profile.assetId}`,
      debit: loss,
      transactionCurrencyCode: configuration.functionalCurrencyCode,
      transactionAmount: loss,
      assetId: disposal.profile.assetId,
    });
  }
  lines.push({
    accountMappingKey: `ACCOUNT_ID:${disposal.profile.assetAccountId}`,
    description: `Derecognize asset ${disposal.profile.assetId}`,
    credit: grossFunctional,
    transactionCurrencyCode: configuration.functionalCurrencyCode,
    transactionAmount: grossFunctional,
    assetId: disposal.profile.assetId,
  });

  return {
    organizationId: input.organizationId,
    journalType: "ASSETS",
    accountingDate: disposal.disposalDate,
    documentDate: disposal.disposalDate,
    reference: disposal.id,
    description: `Asset disposal ${disposal.profile.assetId}`,
    sourceModule: "FINANCE_ASSETS",
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    currencyCode: configuration.functionalCurrencyCode,
    lines,
  } satisfies PostingDocument;
};
