import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PostedPnlRow = {
  siteId: string | null;
  currencyCode: string;
  accountType: string;
  accountSubtype: string | null;
  isCostOfSales: boolean;
  amount: Prisma.Decimal;
  lineCount: bigint;
};

type SitePnl = {
  siteId: string | null;
  currencyCode: string;
  revenue: string;
  otherIncome: string;
  costOfSales: string;
  operatingExpenses: string;
  grossMargin: string;
  operatingResult: string;
  journalLineCount: number;
};

type PnlAccumulator = {
  siteId: string | null;
  currencyCode: string;
  revenue: Prisma.Decimal;
  otherIncome: Prisma.Decimal;
  costOfSales: Prisma.Decimal;
  operatingExpenses: Prisma.Decimal;
  journalLineCount: number;
};

/** Posted ledger figures for a provisional store report. This does not
 * certify a business's net profit: historic entries can lack site dimensions
 * and posting completeness must be reconciled independently before signoff.
 * Entries are grouped by their historic functional currency to prevent FX
 * conversion or mixed-currency summation in a reporting layer.
 */
export async function retailPostedSiteLedger(
  organizationId: string,
  from: Date,
  to: Date,
  siteIds: string[],
): Promise<{ bySite: SitePnl[]; unallocated: SitePnl[] }> {
  if (!siteIds.length) return { bySite: [], unallocated: [] };
  const rows = await prisma.$queryRaw<PostedPnlRow[]>(Prisma.sql`
    SELECT l."siteId" AS "siteId", e."functionalCurrencyCode" AS "currencyCode",
      a."accountType" AS "accountType", a."accountSubtype" AS "accountSubtype",
      CASE WHEN a."accountType" IN ('EXPENSE', 'OTHER_EXPENSE') AND (
        a."accountSubtype" = 'COST_OF_SALES' OR EXISTS (
          SELECT 1 FROM "EnterpriseAccountMapping" mapping
          WHERE mapping."organizationId" = ${organizationId}
            AND mapping."ledgerAccountId" = a.id
            AND mapping."mappingKey" = 'COST_OF_SALES'
        )
      ) THEN TRUE ELSE FALSE END AS "isCostOfSales",
      COALESCE(SUM(CASE WHEN a."accountType" IN ('REVENUE', 'OTHER_INCOME')
        THEN l.credit - l.debit ELSE l.debit - l.credit END), 0) AS amount,
      COUNT(*)::bigint AS "lineCount"
    FROM "EnterpriseJournalLine" l
    INNER JOIN "EnterpriseJournalEntry" e
      ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
    INNER JOIN "EnterpriseLedgerAccount" a
      ON a.id = l."ledgerAccountId" AND a."organizationId" = l."organizationId"
    WHERE l."organizationId" = ${organizationId}
      AND e.status IN ('POSTED', 'REVERSED')
      AND e."accountingDate" BETWEEN ${from} AND ${to}
      AND a."accountType" IN ('REVENUE', 'OTHER_INCOME', 'EXPENSE', 'OTHER_EXPENSE')
      AND (l."siteId" IS NULL OR l."siteId" IN (${Prisma.join(siteIds)}))
    GROUP BY l."siteId", e."functionalCurrencyCode", a.id, a."accountType", a."accountSubtype"
  `);
  const totals = new Map<string, PnlAccumulator>();
  for (const row of rows) {
    const key = JSON.stringify([row.siteId, row.currencyCode]);
    let current = totals.get(key);
    if (!current) {
      current = {
        siteId: row.siteId, currencyCode: row.currencyCode,
        revenue: new Prisma.Decimal(0), otherIncome: new Prisma.Decimal(0),
        costOfSales: new Prisma.Decimal(0), operatingExpenses: new Prisma.Decimal(0),
        journalLineCount: 0,
      };
      totals.set(key, current);
    }
    if (row.accountType === "REVENUE") current.revenue = current.revenue.plus(row.amount);
    else if (row.accountType === "OTHER_INCOME") current.otherIncome = current.otherIncome.plus(row.amount);
    else if (row.isCostOfSales) current.costOfSales = current.costOfSales.plus(row.amount);
    else current.operatingExpenses = current.operatingExpenses.plus(row.amount);
    current.journalLineCount += Number(row.lineCount);
  }
  const serialize = (entry: PnlAccumulator): SitePnl => ({
    siteId: entry.siteId,
    currencyCode: entry.currencyCode,
    revenue: entry.revenue.toFixed(6),
    otherIncome: entry.otherIncome.toFixed(6),
    costOfSales: entry.costOfSales.toFixed(6),
    operatingExpenses: entry.operatingExpenses.toFixed(6),
    grossMargin: entry.revenue.minus(entry.costOfSales).toFixed(6),
    operatingResult: entry.revenue.plus(entry.otherIncome).minus(entry.costOfSales).minus(entry.operatingExpenses).toFixed(6),
    journalLineCount: entry.journalLineCount,
  });
  const all = [...totals.values()].map(serialize);
  return {
    bySite: all.filter((row) => row.siteId !== null),
    unallocated: all.filter((row) => row.siteId === null),
  };
}
