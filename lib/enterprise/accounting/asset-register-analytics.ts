import { Prisma } from "@prisma/client";
import type { MonetaryScopes, MonetaryTotal } from "@/lib/enterprise/common/analytics";

type AssetScope = "filteredTotals" | "generalTotals" | "pageTotals";
type AssetAmounts = {
  scope: AssetScope | "row";
  id: string | null;
  currencyCode: string;
  status: string;
  originalCost: Prisma.Decimal;
  accumulatedDepreciation: Prisma.Decimal | null;
  netBookValue: Prisma.Decimal | null;
};

export async function readAssetRegisterAmountsTx(tx: Prisma.TransactionClient, input: {
  organizationId: string;
  from: Date | null;
  to: Date | null;
  status?: string | null;
  recordId?: string;
  matchingAssetIds?: string[];
  pageIds: string[];
}) {
  const { organizationId, from, to, status, recordId, matchingAssetIds, pageIds } = input;
  const filtered = Prisma.sql`TRUE
    ${from ? Prisma.sql`AND a."inServiceDate" >= ${from}` : Prisma.empty}
    ${to ? Prisma.sql`AND a."inServiceDate" <= ${to}` : Prisma.empty}
    ${status ? Prisma.sql`AND a.status = ${status}` : Prisma.empty}
    ${recordId ? Prisma.sql`AND a.id = ${recordId}` : Prisma.empty}
    ${matchingAssetIds
      ? matchingAssetIds.length ? Prisma.sql`AND a."assetId" IN (${Prisma.join(matchingAssetIds)})` : Prisma.sql`AND FALSE`
      : Prisma.empty}`;
  const onPage = pageIds.length ? Prisma.sql`a.id IN (${Prisma.join(pageIds)})` : Prisma.sql`FALSE`;

  const amounts = await tx.$queryRaw<AssetAmounts[]>`
    WITH depreciation AS (
      SELECT s."assetAccountingProfileId",
        SUM(e.amount) FILTER (WHERE j.status = 'POSTED' AND e.amount = s."depreciationAmount") AS amount,
        COUNT(*) FILTER (WHERE j.id IS NULL OR j.status NOT IN ('POSTED', 'REVERSED')
          OR e.amount <> s."depreciationAmount") AS unresolved
      FROM "EnterpriseAssetDepreciationSchedule" s
      LEFT JOIN "EnterpriseAssetDepreciationEntry" e ON e."organizationId" = s."organizationId"
        AND e."depreciationScheduleId" = s.id AND e."journalEntryId" = s."journalEntryId"
      LEFT JOIN "EnterpriseJournalEntry" j ON j."organizationId" = s."organizationId" AND j.id = e."journalEntryId"
        AND j."postingEvent" = 'ASSET_DEPRECIATION_POSTED'
        AND j."sourceEntityType" = 'EnterpriseAssetDepreciationSchedule' AND j."sourceEntityId" = s.id
      WHERE s."organizationId" = ${organizationId} AND s.status = 'POSTED'
      GROUP BY s."assetAccountingProfileId"
    ), assets AS MATERIALIZED (
      SELECT p.id, p."assetId", p.status, p."currencyCode", p."originalCost", p."inServiceDate",
        CASE WHEN COALESCE(d.unresolved, 0) = 0 THEN COALESCE(d.amount, 0) END AS "accumulatedDepreciation",
        CASE
          WHEN p.status = 'DISPOSED' AND EXISTS (
            SELECT 1 FROM "EnterpriseAssetDisposal" x
            JOIN "EnterpriseJournalEntry" j ON j."organizationId" = x."organizationId" AND j.id = x."journalEntryId"
              AND j.status = 'POSTED' AND j."postingEvent" = 'ASSET_DISPOSAL_POSTED'
              AND j."sourceEntityType" = 'EnterpriseAssetDisposal' AND j."sourceEntityId" = x.id
            WHERE x."organizationId" = p."organizationId" AND x."assetAccountingProfileId" = p.id AND x.status = 'POSTED'
          ) THEN 0
          WHEN p.status = 'ACTIVE' AND COALESCE(d.unresolved, 0) = 0 AND COALESCE(d.amount, 0) <= p."originalCost" AND EXISTS (
            SELECT 1 FROM "EnterpriseJournalEntry" j
            WHERE j."organizationId" = p."organizationId" AND j.status = 'POSTED' AND j."postingEvent" = 'ASSET_CAPITALIZED'
              AND j."sourceEntityType" = 'EnterpriseAssetAccountingProfile' AND j."sourceEntityId" = p.id
          )
            THEN p."originalCost" - COALESCE(d.amount, 0)
        END AS "netBookValue"
      FROM "EnterpriseAssetAccountingProfile" p
      LEFT JOIN depreciation d ON d."assetAccountingProfileId" = p.id
      WHERE p."organizationId" = ${organizationId}
    )
    SELECT selection.scope, NULL::text AS id, a."currencyCode", a.status, SUM(a."originalCost") AS "originalCost",
      CASE WHEN COUNT(a."accumulatedDepreciation") = COUNT(*) THEN SUM(a."accumulatedDepreciation") END AS "accumulatedDepreciation",
      CASE WHEN COUNT(a."netBookValue") = COUNT(*) THEN SUM(a."netBookValue") END AS "netBookValue"
    FROM assets a
    CROSS JOIN LATERAL (VALUES ('generalTotals', TRUE), ('filteredTotals', ${filtered}), ('pageTotals', ${onPage})) selection(scope, selected)
    WHERE selection.selected
    GROUP BY selection.scope, a."currencyCode", a.status
    UNION ALL
    SELECT 'row', a.id, a."currencyCode", a.status, a."originalCost", a."accumulatedDepreciation", a."netBookValue"
    FROM assets a WHERE ${onPage}
    ORDER BY scope, "currencyCode", status, id`;

  const totals: MonetaryScopes = { filteredTotals: [], generalTotals: [], pageTotals: [] };
  const rows = new Map<string, { accumulatedDepreciation: string | null; netBookValue: string | null }>();
  const unavailableScopes = new Set<AssetScope>();
  for (const row of amounts) {
    if (row.scope === "row") {
      if (row.id) rows.set(row.id, {
        accumulatedDepreciation: row.accumulatedDepreciation?.toFixed() ?? null,
        netBookValue: row.netBookValue?.toFixed() ?? null,
      });
      continue;
    }
    const values = [
      ["assetOriginalCost", row.originalCost],
      ["assetDepreciation", row.accumulatedDepreciation],
      ["assetNetBookValue", row.netBookValue],
    ] as const;
    for (const [metric, amount] of values) {
      if (amount === null) unavailableScopes.add(row.scope);
      else totals[row.scope].push({ currencyCode: row.currencyCode, status: row.status, metric, amount: amount.toFixed() } satisfies MonetaryTotal);
    }
  }
  return { ...totals, rows, unavailableScopes: [...unavailableScopes] };
}
