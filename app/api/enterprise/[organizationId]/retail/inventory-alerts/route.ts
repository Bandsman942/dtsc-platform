import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { businessDateKey, lotIsExpired, readRetailInventoryPolicy, retailLotExpiryDateKey } from "@/lib/enterprise/retail/inventory-policy";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { requireRetailSiteCapability, retailSitesForCapability } from "@/lib/enterprise/retail/site-access";
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
    const search = url.searchParams.get("search")?.trim().slice(0, 120) || "";
    const severity = url.searchParams.get("severity")?.trim().toUpperCase() || "";
    if (severity && !["EXPIRED", "DUE_TODAY", "EXPIRING_SOON"].includes(severity)) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 400);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    if ([from, to].some((v) => v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) || (from && to && from > to)) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 400);
    const today = new Date(businessDate + "T00:00:00.000Z");
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const severityDates = severity === "EXPIRED" ? { lt: today } : severity === "DUE_TODAY" ? { gte: today, lt: tomorrow } : severity === "EXPIRING_SOON" ? { gt: today } : {};

    if (warehouseId && warehouseId.length > 240) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 400);
    const warehouse = warehouseId
      ? await prisma.enterpriseWarehouse.findFirst({
          where: { organizationId, id: warehouseId, status: "ACTIVE", archivedAt: null },
          select: { siteId: true },
        })
      : null;
    if (warehouseId && !warehouse) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 404);
    // Owner can inspect every shop. An isolated operator can inspect only
    // authorized shops; explicitly selecting another shop must be rejected.
    const scope = await retailSitesForCapability(organizationId, auth.session.userId, "VIEW_STOCK");
    if (warehouseId) await requireRetailSiteCapability(organizationId, auth.session.userId, warehouse?.siteId, "VIEW_STOCK", prisma, { requireAssignment: true });
    const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page") || "1") || 1));
    const pageSize = Math.max(5, Math.min(100, Number(url.searchParams.get("pageSize") || "30") || 30));
    const where = {
      organizationId,
      ...(warehouseId ? { warehouseId } : scope.isOwner ? {} : { warehouse: { siteId: { in: scope.siteIds } } }),
      quantityOnHand: { gt: 0 },
      ...(search ? { inventoryItem: { catalogItem: { OR: [
        { code: { contains: search, mode: "insensitive" as const } },
        { name: { contains: search, mode: "insensitive" as const } },
      ] } } } : {}),
      stockLot: { is: { archivedAt: null, expiryDate: { ...severityDates, ...(from ? { gte: new Date(from + "T00:00:00.000Z") } : {}), lte: to ? new Date(to + "T00:00:00.000Z") : horizon }, status: "AVAILABLE" } },
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
    const siteClause = warehouseId ? Prisma.sql`AND w."id" = ${warehouseId}`
      : scope.isOwner ? Prisma.empty : scope.siteIds.length ? Prisma.sql`AND w."siteId" IN (${Prisma.join(scope.siteIds)})` : Prisma.sql`AND FALSE`;
    // LEFT JOIN includes products without their first receipt: zero is low
    // stock too. Availability is calculated by warehouse, not company-wide.
    const lowStock = await prisma.$queryRaw<Array<{
      warehouseId: string; warehouse: string; code: string; name: string;
      minimum: Prisma.Decimal; available: Prisma.Decimal; total: bigint;
    }>>(Prisma.sql`
      SELECT w."id" AS "warehouseId", w."name" AS "warehouse",
        c."code" AS "code", c."name" AS "name", i."minimumQuantity" AS "minimum",
        COALESCE(SUM(b."quantityOnHand" - b."quantityReserved"), 0) AS "available",
        COUNT(*) OVER () AS "total"
      FROM "EnterpriseInventoryItem" i
      JOIN "EnterpriseCatalogItem" c ON c."id" = i."catalogItemId" AND c."organizationId" = i."organizationId"
      JOIN "EnterpriseWarehouse" w ON w."organizationId" = i."organizationId" AND w."status" = 'ACTIVE' AND w."archivedAt" IS NULL
      LEFT JOIN "EnterpriseInventoryBalance" b ON b."inventoryItemId" = i."id" AND b."organizationId" = i."organizationId" AND b."warehouseId" = w."id"
      WHERE i."organizationId" = ${organizationId} AND i."status" = 'ACTIVE' AND i."archivedAt" IS NULL
        AND c."archivedAt" IS NULL AND c."trackInventory" = true AND i."minimumQuantity" > 0
        ${siteClause}
      GROUP BY w."id", w."name", c."id", c."code", c."name", i."id", i."minimumQuantity"
      HAVING COALESCE(SUM(b."quantityOnHand" - b."quantityReserved"), 0) <= i."minimumQuantity"
      ORDER BY "available" ASC, c."name" ASC
      LIMIT 80
    `);
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
    return NextResponse.json({ items, page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)), policy, businessDate, lowStock: lowStock.map((row) => ({ warehouseId: row.warehouseId, warehouse: row.warehouse, catalogCode: row.code, catalogName: row.name, minimumQuantity: row.minimum.toFixed(), quantityAvailable: row.available.toFixed() })), lowStockTotal: Number(lowStock[0]?.total || 0) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_EXPIRY_ALERTS_FAILED");
  }
}
