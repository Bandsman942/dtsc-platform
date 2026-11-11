import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CogsLinkStatus = "TRACEABLE" | "UNMATCHED" | "AMBIGUOUS";
export type CogsLine = {
  id: string; journalEntryId: string; journalNumber: string; accountingDate: string;
  siteId: string | null; siteName: string | null; currencyCode: string;
  accountCode: string; accountName: string; accountNameEn: string; description: string | null;
  amount: string; status: CogsLinkStatus; reversal: boolean;
  inventoryItemId: string | null; inventoryItemName: string | null;
  stockMovementId: string | null; quantity: string | null;
  valuationCost: string | null; valuationCurrency: string | null;
  sourceType: string | null; sourceId: string | null; sourceNumber: string | null;
};
export type CogsBucket = { siteId: string | null; siteName: string | null; currencyCode: string; posted: string; traceable: string; untraced: string; ambiguous: string;
  comparablePosted: string; comparableStockValuation: string; comparableVariance: string; comparableLines: number; nonComparableLinked: number; lines: number };
export type CogsDaily = { day: string; currencyCode: string; status: CogsLinkStatus; amount: string };
export type CogsCoverage = { siteId: string | null; eligibleMovements: number; valuedMovements: number };
export type CogsAnalysis = {
  buckets: CogsBucket[]; daily: CogsDaily[]; coverage: CogsCoverage[];
  lines: CogsLine[]; totalLines: number; page: number; pageSize: number;
  // Totals always cover the whole accounting period, not the paginated display.
  definitions: { basis: string; traceability: string; coverage: string };
};

type BaseRow = {
  id: string; journalEntryId: string; journalNumber: string; accountingDate: Date;
  siteId: string | null; siteName: string | null; currencyCode: string;
  accountCode: string; accountName: string; accountNameEn: string; description: string | null;
  amount: Prisma.Decimal; linkStatus: CogsLinkStatus; reversal: boolean;
  inventoryItemId: string | null; inventoryItemName: string | null;
  stockMovementId: string | null; quantity: Prisma.Decimal | null;
  valuationCost: Prisma.Decimal | null; valuationCurrency: string | null;
  sourceType: string | null; sourceId: string | null; sourceNumber: string | null;
};
type SummaryRow = { siteId: string | null; siteName: string | null; currencyCode: string; status: CogsLinkStatus; amount: Prisma.Decimal; count: bigint;
  comparedPosted: Prisma.Decimal; comparedStock: Prisma.Decimal; comparedCount: bigint };
type DailyRow = { day: string; currencyCode: string; status: CogsLinkStatus; amount: Prisma.Decimal };

/** The only monetary source is the posted, functional-currency COGS GL line.
 * Inventory events are evidence of lineage, NEVER a second monetary sum.
 * Preaggregating each journal's inventory links avoids both join fan-out
 * and repeated per-line scans of unindexed historical event references.
 */
export async function readRetailCogsAnalysis(input: {
  organizationId: string; from: Date; to: Date; timezone: string;
  siteId?: string; currency?: string; status?: CogsLinkStatus; search?: string;
  page?: number; pageSize?: number; includeInventory: boolean;
}): Promise<CogsAnalysis> {
  const { organizationId, from, to, timezone, siteId, currency, status, search, includeInventory } = input;
  const page = input.page || 1;
  const pageSize = input.pageSize || 25;
  const scope = Prisma.sql`
    l."organizationId" = ${organizationId}
    AND e.status IN ('POSTED','REVERSED')
    AND e."accountingDate" BETWEEN ${from} AND ${to}
    AND a."accountType" IN ('EXPENSE','OTHER_EXPENSE')
    AND (a."accountSubtype" = 'COST_OF_SALES' OR EXISTS (
      SELECT 1 FROM "EnterpriseAccountMapping" mapping
      WHERE mapping."organizationId" = ${organizationId}
        AND mapping."ledgerAccountId" = a.id AND mapping."mappingKey" = 'COST_OF_SALES'
    ))
    ${siteId ? Prisma.sql`AND l."siteId" = ${siteId}` : Prisma.empty}
    ${currency ? Prisma.sql`AND e."functionalCurrencyCode" = ${currency}` : Prisma.empty}
  `;
  const base = Prisma.sql`
    WITH inventoryLinks AS (
      SELECT evt."journalEntryId", COUNT(*)::integer AS count,
        MIN(evt."stockMovementId") AS "stockMovementId",
        MIN(evt."inventoryItemId") AS "inventoryItemId", MIN(evt.quantity) AS quantity,
        MIN(evt."totalCost") AS "totalCost", MIN(evt."currencyCode") AS "eventCurrency"
      FROM "EnterpriseInventoryAccountingEvent" evt
      JOIN "EnterpriseJournalEntry" entry ON entry.id = evt."journalEntryId"
        AND entry."organizationId" = evt."organizationId" AND entry.status IN ('POSTED','REVERSED')
        AND entry."accountingDate" BETWEEN ${from} AND ${to}
      WHERE evt."organizationId" = ${organizationId} AND evt."eventType" = 'ISSUE' AND evt.status = 'POSTED'
      GROUP BY evt."journalEntryId"
    ), cogs AS (
      SELECT l.id, l."journalEntryId", e.number AS "journalNumber", e."accountingDate",
        l."siteId", site.name AS "siteName", e."functionalCurrencyCode" AS "currencyCode",
        a.code AS "accountCode", a."nameFr" AS "accountName", a."nameEn" AS "accountNameEn", l.description,
        (l.debit - l.credit) AS amount,
        (e."reversalOfEntryId" IS NOT NULL OR e.status = 'REVERSED') AS reversal,
        CASE WHEN linked.count = 1 AND costLineCount.count = 1 AND movement.id IS NOT NULL
          AND (l."siteId" IS NULL OR warehouse."siteId" = l."siteId")
          AND (l."inventoryItemId" IS NULL OR l."inventoryItemId" = linked."inventoryItemId")
          THEN 'TRACEABLE'
          WHEN linked.count > 1 OR (linked.count = 1 AND (costLineCount.count <> 1 OR movement.id IS NULL
            OR (l."siteId" IS NOT NULL AND warehouse."siteId" <> l."siteId")
            OR (l."inventoryItemId" IS NOT NULL AND l."inventoryItemId" <> linked."inventoryItemId")))
          THEN 'AMBIGUOUS' ELSE 'UNMATCHED' END AS "linkStatus",
        ${includeInventory ? Prisma.sql`linked."inventoryItemId"` : Prisma.sql`NULL::text`} AS "inventoryItemId",
        ${includeInventory ? Prisma.sql`catalog.name` : Prisma.sql`NULL::text`} AS "inventoryItemName",
        ${includeInventory ? Prisma.sql`movement.id` : Prisma.sql`NULL::text`} AS "stockMovementId",
        ${includeInventory ? Prisma.sql`linked.quantity` : Prisma.sql`NULL::numeric`} AS quantity,
        ${includeInventory ? Prisma.sql`linked."totalCost"` : Prisma.sql`NULL::numeric`} AS "valuationCost",
        ${includeInventory ? Prisma.sql`linked."eventCurrency"` : Prisma.sql`NULL::text`} AS "valuationCurrency",
        ${includeInventory ? Prisma.sql`movement."sourceEntityType"` : Prisma.sql`NULL::text`} AS "sourceType",
        ${includeInventory ? Prisma.sql`movement."sourceEntityId"` : Prisma.sql`NULL::text`} AS "sourceId",
        ${includeInventory ? Prisma.sql`COALESCE(invoice.number, sale.number)` : Prisma.sql`NULL::text`} AS "sourceNumber"
      FROM "EnterpriseJournalLine" l
      JOIN "EnterpriseJournalEntry" e ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId"
      JOIN "EnterpriseLedgerAccount" a ON a.id = l."ledgerAccountId" AND a."organizationId" = l."organizationId"
      LEFT JOIN "EnterpriseSite" site ON site.id = l."siteId" AND site."organizationId" = l."organizationId"
      LEFT JOIN inventoryLinks linked ON linked."journalEntryId" = e.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS count FROM "EnterpriseJournalLine" otherLine
        JOIN "EnterpriseLedgerAccount" otherAccount ON otherAccount.id = otherLine."ledgerAccountId"
          AND otherAccount."organizationId" = otherLine."organizationId"
        WHERE otherLine."organizationId" = l."organizationId" AND otherLine."journalEntryId" = l."journalEntryId"
          AND otherAccount."accountType" IN ('EXPENSE','OTHER_EXPENSE')
          AND (otherAccount."accountSubtype" = 'COST_OF_SALES' OR EXISTS (
            SELECT 1 FROM "EnterpriseAccountMapping" otherMapping
            WHERE otherMapping."organizationId" = otherLine."organizationId"
              AND otherMapping."ledgerAccountId" = otherAccount.id AND otherMapping."mappingKey" = 'COST_OF_SALES'
          ))
      ) costLineCount ON TRUE
      LEFT JOIN "EnterpriseStockMovement" movement ON movement.id = linked."stockMovementId"
        AND movement."organizationId" = l."organizationId" AND movement.direction = 'OUT'
      LEFT JOIN "EnterpriseWarehouse" warehouse ON warehouse.id = movement."warehouseId"
        AND warehouse."organizationId" = l."organizationId"
      LEFT JOIN "EnterpriseInventoryItem" stock ON stock.id = linked."inventoryItemId"
        AND stock."organizationId" = l."organizationId"
      LEFT JOIN "EnterpriseCatalogItem" catalog ON catalog.id = stock."catalogItemId"
        AND catalog."organizationId" = l."organizationId"
      LEFT JOIN "EnterpriseSalesInvoice" invoice ON movement."sourceEntityType" = 'EnterpriseSalesInvoice'
        AND invoice.id = movement."sourceEntityId" AND invoice."organizationId" = l."organizationId"
      LEFT JOIN "EnterpriseRetailSale" sale ON movement."sourceEntityType" = 'EnterpriseRetailSale'
        AND sale.id = movement."sourceEntityId" AND sale."organizationId" = l."organizationId"
      WHERE ${scope}
    )
  `;
  const [summaryRows, dailyRows, coverageRows] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>(Prisma.sql`${base}
      SELECT "siteId", "siteName", "currencyCode", "linkStatus" AS status,
        SUM(amount) AS amount, COUNT(*)::bigint AS count,
        COALESCE(SUM(CASE WHEN ${includeInventory} AND "linkStatus" = 'TRACEABLE' AND NOT reversal
          AND "valuationCurrency" = "currencyCode" THEN amount ELSE 0 END), 0) AS "comparedPosted",
        COALESCE(SUM(CASE WHEN ${includeInventory} AND "linkStatus" = 'TRACEABLE' AND NOT reversal
          AND "valuationCurrency" = "currencyCode" THEN "valuationCost" ELSE 0 END), 0) AS "comparedStock",
        COUNT(*) FILTER (WHERE ${includeInventory} AND "linkStatus" = 'TRACEABLE' AND NOT reversal
          AND "valuationCurrency" = "currencyCode")::bigint AS "comparedCount"
      FROM cogs GROUP BY "siteId", "siteName", "currencyCode", "linkStatus"
    `),
    prisma.$queryRaw<DailyRow[]>(Prisma.sql`${base}
      SELECT TO_CHAR("accountingDate" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
        "currencyCode", "linkStatus" AS status, SUM(amount) AS amount
      FROM cogs GROUP BY day, "currencyCode", "linkStatus" ORDER BY day
    `),
    includeInventory ? prisma.$queryRaw<Array<{ siteId: string | null; eligible: bigint; valued: bigint }>>(Prisma.sql`
      SELECT warehouse."siteId" AS "siteId", COUNT(*)::bigint AS eligible,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "EnterpriseInventoryAccountingEvent" evt
          JOIN "EnterpriseJournalEntry" entry ON entry.id = evt."journalEntryId"
            AND entry."organizationId" = evt."organizationId" AND entry.status IN ('POSTED','REVERSED')
          WHERE evt."organizationId" = movement."organizationId" AND evt."stockMovementId" = movement.id
            AND evt."eventType" = 'ISSUE' AND evt.status = 'POSTED'
        ))::bigint AS valued
      FROM "EnterpriseStockMovement" movement
      JOIN "EnterpriseWarehouse" warehouse ON warehouse.id = movement."warehouseId"
        AND warehouse."organizationId" = movement."organizationId"
      WHERE movement."organizationId" = ${organizationId} AND movement."movementType" = 'SALE_FULFILLMENT'
        AND movement.direction = 'OUT' AND movement."sourceEntityType" IN ('EnterpriseRetailSale','EnterpriseSalesInvoice')
        AND movement."occurredAt" BETWEEN ${from} AND ${to}
        ${siteId ? Prisma.sql`AND warehouse."siteId" = ${siteId}` : Prisma.empty}
      GROUP BY warehouse."siteId"
    `) : Promise.resolve([]),
  ]);
  const buckets = new Map<string, CogsBucket>();
  for (const row of summaryRows) {
    const key = JSON.stringify([row.siteId, row.currencyCode]);
    const bucket = buckets.get(key) || { siteId: row.siteId, siteName: row.siteName, currencyCode: row.currencyCode,
      posted: '0.000000', traceable: '0.000000', untraced: '0.000000', ambiguous: '0.000000',
      comparablePosted: '0.000000', comparableStockValuation: '0.000000', comparableVariance: '0.000000',
      comparableLines: 0, nonComparableLinked: 0, lines: 0 };
    const amount = row.amount;
    bucket.posted = new Prisma.Decimal(bucket.posted).plus(amount).toFixed(6);
    if (row.status === 'TRACEABLE') bucket.traceable = new Prisma.Decimal(bucket.traceable).plus(amount).toFixed(6);
    else if (row.status === 'AMBIGUOUS') bucket.ambiguous = new Prisma.Decimal(bucket.ambiguous).plus(amount).toFixed(6);
    else bucket.untraced = new Prisma.Decimal(bucket.untraced).plus(amount).toFixed(6);
    bucket.comparablePosted = new Prisma.Decimal(bucket.comparablePosted).plus(row.comparedPosted).toFixed(6);
    bucket.comparableStockValuation = new Prisma.Decimal(bucket.comparableStockValuation).plus(row.comparedStock).toFixed(6);
    bucket.comparableVariance = new Prisma.Decimal(bucket.comparablePosted).minus(bucket.comparableStockValuation).toFixed(6);
    bucket.comparableLines += Number(row.comparedCount);
    if (row.status === 'TRACEABLE') bucket.nonComparableLinked += Number(row.count - row.comparedCount);
    bucket.lines += Number(row.count);
    buckets.set(key, bucket);
  }
  const searchTerm = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : '';
  const detailFilter = Prisma.sql`
    ${status ? Prisma.sql`AND "linkStatus" = ${status}` : Prisma.empty}
    ${search ? Prisma.sql`AND ("journalNumber" ILIKE ${searchTerm} OR "accountCode" ILIKE ${searchTerm}
      OR COALESCE("inventoryItemName",'') ILIKE ${searchTerm}
      OR COALESCE("sourceNumber",'') ILIKE ${searchTerm})` : Prisma.empty}
  `;
  const [countRows, detailRows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`${base} SELECT COUNT(*)::bigint AS count FROM cogs WHERE TRUE ${detailFilter}`),
    prisma.$queryRaw<BaseRow[]>(Prisma.sql`${base} SELECT * FROM cogs WHERE TRUE ${detailFilter}
      ORDER BY "accountingDate" DESC, id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
  ]);
  return {
    buckets: [...buckets.values()].sort((a, b) => (a.currencyCode + a.siteName).localeCompare(b.currencyCode + b.siteName)),
    daily: dailyRows.map((row) => ({ day: row.day, currencyCode: row.currencyCode, status: row.status, amount: row.amount.toFixed(6) })),
    coverage: coverageRows.map((row) => ({ siteId: row.siteId, eligibleMovements: Number(row.eligible), valuedMovements: Number(row.valued) })),
    totalLines: Number(countRows[0]?.count || 0), page, pageSize,
    lines: detailRows.map((row) => ({
      id: row.id, journalEntryId: row.journalEntryId, journalNumber: row.journalNumber,
      accountingDate: row.accountingDate.toISOString(), siteId: row.siteId, siteName: row.siteName,
      currencyCode: row.currencyCode, accountCode: row.accountCode, accountName: row.accountName, accountNameEn: row.accountNameEn,
      description: row.description, amount: row.amount.toFixed(6), status: row.linkStatus, reversal: row.reversal,
      inventoryItemId: row.inventoryItemId, inventoryItemName: row.inventoryItemName,
      stockMovementId: row.stockMovementId, quantity: row.quantity?.toFixed(6) || null,
      valuationCost: row.valuationCost?.toFixed(6) || null, valuationCurrency: row.valuationCurrency,
      sourceType: row.sourceType, sourceId: row.sourceId, sourceNumber: row.sourceNumber,
    })),
    definitions: {
      basis: 'POSTED/REVERSED COGS journal lines; functional currency, debit minus credit. Never add operational tickets or indicative catalog costs.',
      traceability: 'Exactly one POSTED ISSUE inventory event linked to the journal entry and valid outgoing movement; other lines are unmatched or ambiguous. Reversals remain signed.',
      coverage: 'Posted-valued retail fulfillment OUT movements / all retail fulfillment OUT movements occurring within the selected dates, regardless of GL accounting date. N/A when denominator is zero.',
    },
  };
}
