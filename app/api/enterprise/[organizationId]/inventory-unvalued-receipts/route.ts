import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeListParams } from "@/lib/enterprise/accounting/http";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
type UnvaluedRow = {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  inventoryItemCode: string | null;
  warehouseName: string;
  warehouseId: string;
  movementType: string;
  quantity: Prisma.Decimal;
  occurredAt: Date;
};

/**
 * Read-only, paginated work queue of historical inbound stock without cost
 * layers. An existing movement is valued in place through the canonical
 * FINANCE_INVENTORY.post API, never re-received and never assigned a fake cost.
 */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_INVENTORY", "view");
  if (!auth.ok) return auth.response;
  try {
    const scope = await retailInventoryVisibleSites(organizationId, auth.session.userId);
    // Same rule as the canonical inventory valuation view: no cross-shop
    // cost exposure to site-isolated Retail operators.
    if (scope.isolationEnabled) {
      return NextResponse.json({ error: "RETAIL_SITE_ACCESS_DENIED" }, { status: 403 });
    }
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED");
  }

  const { page, pageSize, search } = financeListParams(req);
  const filters = [
    Prisma.sql`m."organizationId" = ${organizationId}`,
    Prisma.sql`m.direction = 'IN'`,
    Prisma.sql`m.quantity > 0`,
    // Returns and reversals have a distinct valuation workflow and must not
    // silently be reclassified as new purchase/stock opening costs.
    Prisma.sql`m."movementType" IN ('ADJUSTMENT_IN', 'OPENING_BALANCE', 'PURCHASE_RECEIPT', 'RECEIPT_IN')`,
    Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "EnterpriseInventoryCostLayer" layer
      WHERE layer."organizationId" = m."organizationId"
        AND layer."sourceMovementId" = m.id
    )`,
  ];
  if (search) {
    const term = `%${search}%`;
    filters.push(Prisma.sql`(
      catalog.name ILIKE ${term}
      OR catalog.code ILIKE ${term}
      OR warehouse.name ILIKE ${term}
    )`);
  }
  const where = Prisma.join(filters, " AND ");
  const offset = (page - 1) * pageSize;
  const [counts, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "EnterpriseStockMovement" m
      JOIN "EnterpriseInventoryItem" item ON item.id = m."inventoryItemId" AND item."organizationId" = m."organizationId"
      JOIN "EnterpriseCatalogItem" catalog ON catalog.id = item."catalogItemId" AND catalog."organizationId" = m."organizationId"
      JOIN "EnterpriseWarehouse" warehouse ON warehouse.id = m."warehouseId" AND warehouse."organizationId" = m."organizationId"
      WHERE ${where}
    `),
    prisma.$queryRaw<UnvaluedRow[]>(Prisma.sql`
      SELECT m.id, m."inventoryItemId",
        catalog.name AS "inventoryItemName", catalog.code AS "inventoryItemCode",
        warehouse.name AS "warehouseName", m."warehouseId",
        m."movementType", m.quantity, m."occurredAt"
      FROM "EnterpriseStockMovement" m
      JOIN "EnterpriseInventoryItem" item ON item.id = m."inventoryItemId" AND item."organizationId" = m."organizationId"
      JOIN "EnterpriseCatalogItem" catalog ON catalog.id = item."catalogItemId" AND catalog."organizationId" = m."organizationId"
      JOIN "EnterpriseWarehouse" warehouse ON warehouse.id = m."warehouseId" AND warehouse."organizationId" = m."organizationId"
      WHERE ${where}
      ORDER BY m."occurredAt" DESC, m.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `),
  ]);
  const total = Number(counts[0]?.count || 0);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "inventory-unvalued-receipts", page, pageSize, search: Boolean(search) } });
  return NextResponse.json({
    items: rows.map((row) => ({
      ...row, quantity: row.quantity.toFixed(3),
    })),
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
  }, { headers: { "cache-control": "private, no-store" } });
}
