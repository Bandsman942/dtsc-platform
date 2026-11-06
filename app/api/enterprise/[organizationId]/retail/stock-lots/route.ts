import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read", { includeMutationCapabilities: false });
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const itemIds = [...new Set((url.searchParams.get("inventoryItemIds") || "").split(",").map((id) => id.trim()).filter(Boolean))];
  if (!warehouseId || warehouseId.length > 240 || !itemIds.length || itemIds.length > 200 || itemIds.some((id) => id.length > 240)) {
    return NextResponse.json({ error: "RETAIL_LOT_SELECTION_INVALID", message: "Choisissez un dépôt et les articles suivis en stock." }, { status: 400 });
  }
  const warehouse = await prisma.enterpriseWarehouse.findFirst({ where: { organizationId, id: warehouseId, status: "ACTIVE", archivedAt: null }, select: { id: true, siteId: true } });
  if (!warehouse) return NextResponse.json({ error: "RETAIL_WAREHOUSE_NOT_FOUND" }, { status: 404 });
  try { await requireRetailSiteCapability(organizationId, auth.session.userId, warehouse.siteId, "VIEW_STOCK"); }
  catch (error) { return retailErrorResponse(error, "RETAIL_LOT_ACCESS_DENIED"); }
  const lots = await prisma.enterpriseStockLot.findMany({
    where: { organizationId, warehouseId, inventoryItemId: { in: itemIds }, status: "AVAILABLE", archivedAt: null },
    orderBy: [{ expiryDate: "asc" }, { lotNumber: "asc" }],
    take: 1000,
    select: {
      id: true, inventoryItemId: true, lotNumber: true, expiryDate: true,
      balances: { where: { organizationId, warehouseId }, select: { quantityOnHand: true, quantityReserved: true } },
    },
  });
  const items = lots.map((lot) => ({
    id: lot.id, inventoryItemId: lot.inventoryItemId, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate,
    quantityAvailable: lot.balances.reduce((sum, row) => sum.plus(row.quantityOnHand.minus(row.quantityReserved)), new Prisma.Decimal(0)).toFixed(),
  }));
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-stock-lot-selector", warehouseId, count: items.length } });
  return NextResponse.json({ items, truncated: lots.length === 1000 }, { headers: { "Cache-Control": "private, no-store" } });
}
