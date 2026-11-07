import { NextResponse } from "next/server";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { businessDateKey, lotIsExpired, readRetailInventoryPolicy, retailLotExpiryDateKey } from "@/lib/enterprise/retail/inventory-policy";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

// Read-only expiry ledger, independent of the block/warn choice. The list is
// paginated at the database layer so a shop with many batches remains quick.
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read", { includeMutationCapabilities: false });
  if (!auth.ok) return auth.response;
  try {
    const [configuration, organization] = await Promise.all([
      prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
      prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
    ]);
    if (!configuration || !organization) throw new EnterpriseRetailError("RETAIL_CONFIGURATION_REQUIRED", 409);
    const policy = readRetailInventoryPolicy(configuration.settingsJson);
    const businessDate = businessDateKey(new Date(), organization.timezone || "UTC");
    const horizon = new Date(`${businessDate}T00:00:00.000Z`);
    horizon.setUTCDate(horizon.getUTCDate() + policy.warningDays);
    const url = new URL(req.url);
    const warehouseId = url.searchParams.get("warehouseId")?.trim() || undefined;
    if (warehouseId && warehouseId.length > 240) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 400);
    const warehouse = warehouseId
      ? await prisma.enterpriseWarehouse.findFirst({
          where: { organizationId, id: warehouseId, status: "ACTIVE", archivedAt: null },
          select: { siteId: true },
        })
      : null;
    if (warehouseId && !warehouse) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 404);
    // Owner can inspect every shop. An isolated operator must select a shop
    // explicitly; a company-wide alert list would disclose other shops.
    await requireRetailSiteCapability(organizationId, auth.session.userId, warehouse?.siteId, "VIEW_STOCK");
    const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page") || "1") || 1));
    const pageSize = Math.max(5, Math.min(100, Number(url.searchParams.get("pageSize") || "30") || 30));
    const where = {
      organizationId,
      ...(warehouseId ? { warehouseId } : {}),
      quantityOnHand: { gt: 0 },
      stockLot: { is: { archivedAt: null, expiryDate: { lte: horizon }, status: "AVAILABLE" } },
    };
    const [balances, total] = await Promise.all([
      prisma.enterpriseInventoryBalance.findMany({
        where,
        orderBy: [{ stockLot: { expiryDate: "asc" } }, { warehouseId: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, warehouseId: true, quantityOnHand: true, quantityReserved: true,
          warehouse: { select: { code: true, name: true, siteId: true } },
          inventoryItem: { select: { catalogItem: { select: { code: true, name: true } } } },
          stockLot: { select: { id: true, lotNumber: true, expiryDate: true } },
        },
      }),
      prisma.enterpriseInventoryBalance.count({ where }),
    ]);
    const items = balances.map((balance) => ({
      id: balance.id,
      warehouseId: balance.warehouseId,
      warehouse: balance.warehouse.name,
      siteId: balance.warehouse.siteId,
      catalogCode: balance.inventoryItem.catalogItem.code,
      catalogName: balance.inventoryItem.catalogItem.name,
      lotId: balance.stockLot!.id,
      lotNumber: balance.stockLot!.lotNumber,
      expiryDate: balance.stockLot!.expiryDate,
      status: lotIsExpired(balance.stockLot!.expiryDate, businessDate) ? "EXPIRED" : balance.stockLot!.expiryDate && retailLotExpiryDateKey(balance.stockLot!.expiryDate) === businessDate ? "DUE_TODAY" : "EXPIRING_SOON",
      quantityOnHand: balance.quantityOnHand.toFixed(),
      quantityAvailable: balance.quantityOnHand.minus(balance.quantityReserved).toFixed(),
    }));
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-expiry-alerts", warehouseId, page } });
    return NextResponse.json({ items, page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)), policy, businessDate }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_EXPIRY_ALERTS_FAILED");
  }
}

