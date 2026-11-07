import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const inventoryItemId = url.searchParams.get("inventoryItemId")?.trim() || "";
  if (!warehouseId || !inventoryItemId || warehouseId.length > 240 || inventoryItemId.length > 240) {
    return NextResponse.json({ error: "STOCK_TRANSFER_LOT_FILTER_INVALID" }, { status: 400 });
  }
  const warehouse = await prisma.enterpriseWarehouse.findFirst({
    where: { id: warehouseId, organizationId, status: "ACTIVE", archivedAt: null },
    select: { siteId: true },
  });
  if (!warehouse) return NextResponse.json({ error: "WAREHOUSE_NOT_FOUND" }, { status: 404 });
  try {
    await requireRetailSiteCapability(organizationId, session.userId, warehouse.siteId, "VIEW_STOCK");
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED");
  }
  const lots = await prisma.enterpriseStockLot.findMany({
    where: { organizationId, warehouseId, inventoryItemId, status: "AVAILABLE", archivedAt: null },
    select: { id: true, lotNumber: true, expiryDate: true, balances: { where: { organizationId, warehouseId }, select: { quantityOnHand: true, quantityReserved: true, storageLocationId: true } } },
    orderBy: [{ expiryDate: "asc" }, { lotNumber: "asc" }],
    take: 250,
  });
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "stock-transfer-lot-selector", warehouseId, count: lots.length } });
  return NextResponse.json({ items: lots.map((lot) => ({
    id: lot.id, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate,
    quantityAvailable: lot.balances.reduce((sum, balance) => sum.plus(balance.quantityOnHand.minus(balance.quantityReserved)), new Prisma.Decimal(0)).toFixed(),
    locations: lot.balances.map((balance) => ({ storageLocationId: balance.storageLocationId, available: balance.quantityOnHand.minus(balance.quantityReserved).toFixed() })),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}

