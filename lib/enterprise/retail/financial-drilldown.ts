import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** The 12 other executive cards. Posted COGS retains its dedicated stock reconciliation. */
export const RETAIL_FINANCIAL_TRACES = [
  "financeCollections", "invoices", "outstanding", "overdue",
  "postedRevenue", "postedGrossMargin", "postedOperatingResult",
  "treasuryAvailable", "expenses", "mobileMoneyCommission", "telcoMargin", "posSales",
] as const;
export type RetailFinancialTrace = typeof RETAIL_FINANCIAL_TRACES[number];
export type RetailTraceRow = {
  id: string; siteId: string | null; siteName: string | null; currencyCode: string;
  eventDate: string | null; reference: string | null; sourceLabel: string | null;
  amount: string | null; status: string; sourceType: string; sourceId: string;
};
export type RetailTraceBucket = {
  siteId: string | null; siteName: string | null; currencyCode: string;
  amount: string | null; count: number; missingAmounts: number;
};
export type RetailTraceResult = {
  metric: RetailFinancialTrace; timeBasis: "PERIOD_FLOW" | "CURRENT_BALANCE" | "ISSUANCE_PERIOD_CURRENT_ALLOCATION";
  buckets: RetailTraceBucket[]; lines: RetailTraceRow[]; page: number; pageSize: number; totalLines: number;
  /** Full scoped aggregate (not just the visible page); unknown is never converted to zero. */
  scope: "RETAIL_ONLY" | "RETAIL_POSTED_LEDGER" | "FINANCIAL_ACCOUNTS";
};

/**
 * Read-only exact-source lineage; never a second ledger or an authoritative
 * payment/allocation balance. Tenant, permissions and site scope are enforced
 * by the caller AND independently by every join below.
 */
export async function readRetailFinancialTrace(input: {
  organizationId: string; metric: RetailFinancialTrace; from: Date; to: Date;
  siteId?: string; currency?: string; search?: string; page: number; pageSize: number;
  now?: Date;
}): Promise<RetailTraceResult> {
  const { organizationId, metric, from, to, siteId, currency, search, page, pageSize } = input;
  const now = input.now || new Date();
  const ledger = metric === "postedRevenue" || metric === "postedGrossMargin" || metric === "postedOperatingResult";
  const isBalance = metric === "outstanding" || metric === "overdue" || metric === "treasuryAvailable";
  const timeBasis = isBalance ? "CURRENT_BALANCE" : "PERIOD_FLOW";
  let source: Prisma.Sql;
  if (ledger) {
    const cogs = Prisma.sql`(a."accountSubtype" = 'COST_OF_SALES' OR EXISTS (
      SELECT 1 FROM "EnterpriseAccountMapping" mapping
      WHERE mapping."organizationId" = ${organizationId}
        AND mapping."ledgerAccountId" = a.id AND mapping."mappingKey" = 'COST_OF_SALES'
    ))`;
    const accountScope = metric === "postedRevenue" ? Prisma.sql`a."accountType" = 'REVENUE'`
      : metric === "postedGrossMargin"
        ? Prisma.sql`(a."accountType" = 'REVENUE' OR (a."accountType" IN ('EXPENSE','OTHER_EXPENSE') AND ${cogs}))`
        : Prisma.sql`a."accountType" IN ('REVENUE','OTHER_INCOME','EXPENSE','OTHER_EXPENSE')`;
    source = Prisma.sql`
      SELECT l.id, l."siteId", site.name AS "siteName", e."functionalCurrencyCode" AS "currencyCode",
        e."accountingDate" AS "eventDate", e.number AS reference,
        (a.code || ' · ' || COALESCE(a."nameFr",'')) AS "sourceLabel",
        (l.credit - l.debit) AS amount, e.status::text AS status,
        'EnterpriseJournalEntry'::text AS "sourceType", e.id AS "sourceId"
      FROM "EnterpriseJournalLine" l
      JOIN "EnterpriseJournalEntry" e ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
      JOIN "EnterpriseLedgerAccount" a ON a.id = l."ledgerAccountId" AND a."organizationId" = l."organizationId"
      LEFT JOIN "EnterpriseSite" site ON site.id = l."siteId" AND site."organizationId" = l."organizationId"
      WHERE l."organizationId" = ${organizationId} AND e.status IN ('POSTED','REVERSED')
        AND e."accountingDate" BETWEEN ${from} AND ${to} AND ${accountScope}
    `;
  } else if (metric === "invoices" || metric === "outstanding" || metric === "overdue") {
    const value = metric === "invoices" ? Prisma.sql`invoice."grandTotal" - invoice."amountCredited"`
      : Prisma.sql`invoice."outstandingAmount"`;
    source = Prisma.sql`
      SELECT invoice.id, checkout."siteId", site.name AS "siteName", invoice."currencyCode" AS "currencyCode",
        invoice."issuedAt" AS "eventDate", invoice.number AS reference,
        invoice.status::text AS "sourceLabel", ${value} AS amount, invoice.status::text AS status,
        'EnterpriseSalesInvoice'::text AS "sourceType", invoice.id AS "sourceId"
      FROM "EnterpriseRetailInvoiceCheckout" checkout
      JOIN "EnterpriseSalesInvoice" invoice ON invoice.id = checkout."salesInvoiceId"
        AND invoice."organizationId" = checkout."organizationId"
      LEFT JOIN "EnterpriseSite" site ON site.id = checkout."siteId" AND site."organizationId" = checkout."organizationId"
      WHERE checkout."organizationId" = ${organizationId}
        AND invoice.status IN ('ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CREDIT_NOTE')
        ${isBalance ? Prisma.sql`AND invoice."outstandingAmount" > 0` :
          Prisma.sql`AND invoice."issuedAt" BETWEEN ${from} AND ${to}`}
        ${metric === "overdue" ? Prisma.sql`AND invoice."dueDate" < ${now}` : Prisma.empty}
    `;
  } else if (metric === "financeCollections") {
    source = Prisma.sql`
      SELECT allocation.id, checkout."siteId", site.name AS "siteName", payment."currencyCode" AS "currencyCode",
        payment."paymentDate" AS "eventDate", (payment.number || ' · ' || invoice.number) AS reference,
        payment."methodType"::text AS "sourceLabel", allocation.amount AS amount, payment.status::text AS status,
        'EnterprisePayment'::text AS "sourceType", payment.id AS "sourceId"
      FROM "EnterpriseRetailInvoiceCheckout" checkout
      JOIN "EnterpriseSalesInvoice" invoice ON invoice.id = checkout."salesInvoiceId" AND invoice."organizationId" = checkout."organizationId"
      JOIN "EnterpriseReceivable" receivable ON receivable."salesInvoiceId" = checkout."salesInvoiceId"
        AND receivable."organizationId" = checkout."organizationId"
      JOIN "EnterprisePaymentAllocation" allocation ON allocation."receivableId" = receivable.id
        AND allocation."organizationId" = checkout."organizationId"
      JOIN "EnterprisePayment" payment ON payment.id = allocation."paymentId"
        AND payment."organizationId" = allocation."organizationId"
      LEFT JOIN "EnterpriseSite" site ON site.id = checkout."siteId" AND site."organizationId" = checkout."organizationId"
      WHERE checkout."organizationId" = ${organizationId}
        AND payment."paymentDate" BETWEEN ${from} AND ${to}
        AND payment.status IN ('CONFIRMED','RECONCILED') AND payment.direction = 'INBOUND'
        AND payment."paymentType" = 'CUSTOMER_PAYMENT'
        AND allocation.status = 'CONFIRMED' AND allocation."reversedAt" IS NULL
    `;
  } else if (metric === "expenses") {
    source = Prisma.sql`
      SELECT expense.id, expense."siteId", site.name AS "siteName", expense.currency AS "currencyCode",
        expense."expenseDate" AS "eventDate", expense.reference AS reference,
        'APPROVED'::text AS "sourceLabel", expense.amount AS amount, expense.status::text AS status,
        'EnterpriseExpense'::text AS "sourceType", expense.id AS "sourceId"
      FROM "EnterpriseExpense" expense
      LEFT JOIN "EnterpriseSite" site ON site.id = expense."siteId" AND site."organizationId" = expense."organizationId"
      WHERE expense."organizationId" = ${organizationId} AND expense.status = 'APPROVED'
        AND expense."archivedAt" IS NULL AND expense."expenseDate" BETWEEN ${from} AND ${to}
    `;
  } else if (metric === "posSales") {
    source = Prisma.sql`
      SELECT sale.id, sale."siteId", site.name AS "siteName", sale."currencyCode" AS "currencyCode",
        sale."soldAt" AS "eventDate", sale.number AS reference, 'POS'::text AS "sourceLabel",
        sale."grandTotal" AS amount, sale.status::text AS status,
        'EnterpriseRetailSale'::text AS "sourceType", sale.id AS "sourceId"
      FROM "EnterpriseRetailSale" sale
      LEFT JOIN "EnterpriseSite" site ON site.id = sale."siteId" AND site."organizationId" = sale."organizationId"
      WHERE sale."organizationId" = ${organizationId}
        AND sale.status = 'COMPLETED' AND sale."soldAt" BETWEEN ${from} AND ${to}
    `;
  } else if (metric === "mobileMoneyCommission") {
    source = Prisma.sql`
      SELECT mm.id, cash."siteId", site.name AS "siteName", mm."currencyCode" AS "currencyCode",
        mm."occurredAt" AS "eventDate", mm.number AS reference,
        mm."transactionType"::text AS "sourceLabel", mm."providerCommissionAmount" AS amount, mm.status::text AS status,
        'EnterpriseMobileMoneyTransaction'::text AS "sourceType", mm.id AS "sourceId"
      FROM "EnterpriseMobileMoneyTransaction" mm
      LEFT JOIN "EnterpriseFinancialAccount" cash ON cash.id = mm."cashAccountId" AND cash."organizationId" = mm."organizationId"
      LEFT JOIN "EnterpriseSite" site ON site.id = cash."siteId" AND site."organizationId" = mm."organizationId"
      WHERE mm."organizationId" = ${organizationId}
        AND mm.status = 'CONFIRMED' AND mm."occurredAt" BETWEEN ${from} AND ${to}
    `;
  } else if (metric === "telcoMargin") {
    source = Prisma.sql`
      SELECT topup.id, account."siteId", site.name AS "siteName", topup."currencyCode" AS "currencyCode",
        topup."occurredAt" AS "eventDate", topup.number AS reference,
        'TOPUP'::text AS "sourceLabel", topup."marginAmount" AS amount, topup.status::text AS status,
        'EnterpriseTelcoTopup'::text AS "sourceType", topup.id AS "sourceId"
      FROM "EnterpriseTelcoTopup" topup
      LEFT JOIN "EnterpriseFinancialAccount" account ON account.id = topup."tenderFinancialAccountId" AND account."organizationId" = topup."organizationId"
      LEFT JOIN "EnterpriseSite" site ON site.id = account."siteId" AND site."organizationId" = topup."organizationId"
      WHERE topup."organizationId" = ${organizationId}
        AND topup.status = 'SUCCESS' AND topup."occurredAt" BETWEEN ${from} AND ${to}
    `;
  } else {
    source = Prisma.sql`
      SELECT account.id, account."siteId", site.name AS "siteName", account."currencyCode" AS "currencyCode",
        NULL::timestamptz AS "eventDate", (account.code || ' · ' || account.name) AS reference,
        'FINANCIAL_ACCOUNT'::text AS "sourceLabel", account."availableBalance" AS amount, account.status::text AS status,
        'EnterpriseFinancialAccount'::text AS "sourceType", account.id AS "sourceId"
      FROM "EnterpriseFinancialAccount" account
      LEFT JOIN "EnterpriseSite" site ON site.id = account."siteId" AND site."organizationId" = account."organizationId"
      WHERE account."organizationId" = ${organizationId}
        AND account.status = 'ACTIVE' AND account."archivedAt" IS NULL
    `;
  }
  const wildcard = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : "";
  const filtered = Prisma.sql`
    WITH source_rows AS (${source}), filtered AS (
      SELECT * FROM source_rows WHERE TRUE
        ${siteId ? Prisma.sql`AND "siteId" = ${siteId}` : Prisma.empty}
        ${currency ? Prisma.sql`AND "currencyCode" = ${currency}` : Prisma.empty}
        ${search ? Prisma.sql`AND (COALESCE(reference, '') ILIKE ${wildcard} ESCAPE '\\'
          OR COALESCE("sourceLabel", '') ILIKE ${wildcard} ESCAPE '\\'
          OR COALESCE("siteName", '') ILIKE ${wildcard} ESCAPE '\\')` : Prisma.empty}
    )
  `;
  type RawBucket = { siteId: string | null; siteName: string | null; currencyCode: string; amount: Prisma.Decimal; count: bigint; missing: bigint };
  type RawLine = Omit<RetailTraceRow, "eventDate" | "amount"> & { eventDate: Date | null; amount: Prisma.Decimal | null };
  const [buckets, totals, lines] = await Promise.all([
    prisma.$queryRaw<RawBucket[]>(Prisma.sql`${filtered}
      SELECT "siteId", "siteName", "currencyCode", COALESCE(SUM(amount),0) AS amount,
        COUNT(*)::bigint AS count, COUNT(*) FILTER (WHERE amount IS NULL)::bigint AS missing
      FROM filtered GROUP BY "siteId", "siteName", "currencyCode"
      ORDER BY "currencyCode", "siteName" NULLS LAST
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`${filtered} SELECT COUNT(*)::bigint AS count FROM filtered`),
    prisma.$queryRaw<RawLine[]>(Prisma.sql`${filtered}
      SELECT * FROM filtered ORDER BY "eventDate" DESC NULLS LAST, id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `),
  ]);
  return {
    metric, timeBasis, scope: ledger ? "RETAIL_POSTED_LEDGER" : metric === "treasuryAvailable" ? "FINANCIAL_ACCOUNTS" : "RETAIL_ONLY",
    buckets: buckets.map((row) => ({
      siteId: row.siteId, siteName: row.siteName, currencyCode: row.currencyCode,
      amount: Number(row.missing) ? null : row.amount.toFixed(6), count: Number(row.count), missingAmounts: Number(row.missing),
    })),
    lines: lines.map((row) => ({
      id: row.id, siteId: row.siteId, siteName: row.siteName, currencyCode: row.currencyCode,
      eventDate: row.eventDate?.toISOString() || null, reference: row.reference, sourceLabel: row.sourceLabel,
      amount: row.amount?.toFixed(6) ?? null, status: row.status, sourceType: row.sourceType, sourceId: row.sourceId,
    })),
    page, pageSize, totalLines: Number(totals[0]?.count || 0),
  };
}
