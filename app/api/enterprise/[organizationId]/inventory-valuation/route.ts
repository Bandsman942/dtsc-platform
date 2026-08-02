import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { inventoryValuationQuerySchema } from "@/lib/enterprise/accounting/finance-domain-schemas";
import { authorizeFinanceRequest, financeListParams } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type ValuationRow = {
  inventoryItemId: string;
  warehouseId: string | null;
  currencyCode: string;
  quantity: Prisma.Decimal;
  value: Prisma.Decimal;
  weightedAverageUnitCost: Prisma.Decimal;
};

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_INVENTORY", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = inventoryValuationQuerySchema.safeParse({
    warehouseId: url.searchParams.get("warehouseId") || undefined,
    inventoryItemId: url.searchParams.get("inventoryItemId") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { page, pageSize, search } = financeListParams(req);
  const matchingInventoryItems = search
    ? await prisma.enterpriseInventoryItem.findMany({
        where: {
          organizationId,
          archivedAt: null,
          catalogItem: {
            organizationId,
            archivedAt: null,
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        select: { id: true },
      })
    : [];

  if (search && matchingInventoryItems.length === 0) {
    return NextResponse.json({
      items: [],
      pagination: { page: 1, pageSize, total: 0, pageCount: 1 },
      scope: "COMMON_INVENTORY_ONLY",
      valuationMethod: "WEIGHTED_AVERAGE",
    });
  }

  const filters = [
    Prisma.sql`"organizationId" = ${organizationId}`,
    Prisma.sql`"remainingQuantity" > 0`,
  ];
  if (parsed.data.warehouseId) filters.push(Prisma.sql`"warehouseId" = ${parsed.data.warehouseId}`);
  if (parsed.data.inventoryItemId) filters.push(Prisma.sql`"inventoryItemId" = ${parsed.data.inventoryItemId}`);
  if (search) {
    filters.push(Prisma.sql`"inventoryItemId" IN (${Prisma.join(matchingInventoryItems.map((item) => item.id))})`);
  }
  const whereSql = Prisma.join(filters, " AND ");
  const offset = (page - 1) * pageSize;

  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM (
        SELECT 1
        FROM "EnterpriseInventoryCostLayer"
        WHERE ${whereSql}
        GROUP BY "inventoryItemId", "warehouseId", "currencyCode"
      ) grouped
    `),
    prisma.$queryRaw<ValuationRow[]>(Prisma.sql`
      SELECT
        "inventoryItemId",
        "warehouseId",
        "currencyCode",
        SUM("remainingQuantity") AS "quantity",
        SUM("remainingQuantity" * "unitCost") AS "value",
        CASE
          WHEN SUM("remainingQuantity") > 0
          THEN SUM("remainingQuantity" * "unitCost") / SUM("remainingQuantity")
          ELSE 0
        END AS "weightedAverageUnitCost"
      FROM "EnterpriseInventoryCostLayer"
      WHERE ${whereSql}
      GROUP BY "inventoryItemId", "warehouseId", "currencyCode"
      ORDER BY "inventoryItemId" ASC, "warehouseId" ASC, "currencyCode" ASC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `),
  ]);

  const inventoryItemIds = [...new Set(rows.map((row) => row.inventoryItemId))];
  const warehouseIds = [...new Set(rows.map((row) => row.warehouseId).filter((value): value is string => Boolean(value)))];
  const [inventoryItems, warehouses] = await Promise.all([
    inventoryItemIds.length
      ? prisma.enterpriseInventoryItem.findMany({
          where: { organizationId, id: { in: inventoryItemIds } },
          select: {
            id: true,
            catalogItem: { select: { code: true, sku: true, name: true } },
          },
        })
      : Promise.resolve([]),
    warehouseIds.length
      ? prisma.enterpriseWarehouse.findMany({
          where: { organizationId, id: { in: warehouseIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const inventoryItemById = new Map(inventoryItems.map((item) => [item.id, item.catalogItem]));
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const total = Number(countRows[0]?.count || 0n);

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: { organizationId, domain: "inventory-valuation", page, pageSize },
  });
  return NextResponse.json({
    items: rows.map((row) => {
      const catalogItem = inventoryItemById.get(row.inventoryItemId);
      const warehouse = row.warehouseId ? warehouseById.get(row.warehouseId) : null;
      return {
        id: `${row.inventoryItemId}:${row.warehouseId || "global"}:${row.currencyCode}`,
        inventoryItemId: row.inventoryItemId,
        inventoryItemCode: catalogItem?.code || null,
        inventoryItemSku: catalogItem?.sku || null,
        inventoryItemName: catalogItem?.name || "Article de stock",
        warehouseId: row.warehouseId,
        warehouseCode: warehouse?.code || null,
        warehouseName: warehouse?.name || "Tous les entrepôts",
        currencyCode: row.currencyCode,
        quantity: row.quantity.toFixed(3),
        value: row.value.toFixed(6),
        weightedAverageUnitCost: row.weightedAverageUnitCost.toFixed(6),
        status: "VALUED",
      };
    }),
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    scope: "COMMON_INVENTORY_ONLY",
    valuationMethod: "WEIGHTED_AVERAGE",
  });
}
