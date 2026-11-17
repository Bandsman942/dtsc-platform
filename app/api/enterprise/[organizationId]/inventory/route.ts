import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { requireRetailWarehouseCapability, retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let scope: Awaited<ReturnType<typeof retailInventoryVisibleSites>>;
  try { scope = await retailInventoryVisibleSites(organizationId, session.userId); }
  catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  const url = new URL(req.url);
  if (url.searchParams.get("view") === "lot-options") {
    // A first batch does not require a pre-existing warehouse balance. Return
    // only shared catalogue identity and traceability flags, never other-site quantities.
    if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
    if (!warehouseId) return NextResponse.json({ error: "INVENTORY_WAREHOUSE_REQUIRED", message: "Choisissez un dépôt actif." }, { status: 400 });
    const warehouse = await prisma.enterpriseWarehouse.findFirst({ where: { id: warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!warehouse) return NextResponse.json({ error: "INVENTORY_WAREHOUSE_NOT_FOUND" }, { status: 404 });
    try { await requireRetailWarehouseCapability(organizationId, session.userId, warehouseId, "MANAGE_STOCK"); }
    catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
    const requestedPage = Number(url.searchParams.get("page") || 1);
    const page = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(10000, requestedPage)) : 1;
    const pageSize = 25;
    const search = (url.searchParams.get("search") || "").trim().slice(0, 120);
    const where: Prisma.EnterpriseInventoryItemWhereInput = { organizationId, status: "ACTIVE", archivedAt: null, lotTracking: true, catalogItem: { organizationId, status: "ACTIVE", archivedAt: null, trackInventory: true, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] } : {}) } };
    const [items, total] = await Promise.all([
      prisma.enterpriseInventoryItem.findMany({ where, orderBy: [{ catalogItem: { name: "asc" } }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, expiryTracking: true, catalogItem: { select: { name: true, code: true } } } }),
      prisma.enterpriseInventoryItem.count({ where }),
    ]);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "inventory-lot-options", page } });
    return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const lowStock = url.searchParams.get("lowStock") === "true";
  const balancesScope: Prisma.EnterpriseInventoryBalanceWhereInput = {
    ...(warehouseId ? { warehouseId } : {}),
    ...(scope.isolationEnabled ? { warehouse: { siteId: { in: scope.siteIds } } } : {}),
  };
  const where: Prisma.EnterpriseInventoryItemWhereInput = {
    organizationId,
    archivedAt: null,
    status: "ACTIVE",
    ...(search ? { catalogItem: { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] } } : {}),
    ...(warehouseId || scope.isolationEnabled ? { balances: { some: balancesScope } } : {}),
  };
  const [items, total, movementCount, warehouseCount] = await Promise.all([
    prisma.enterpriseInventoryItem.findMany({ where, orderBy: { catalogItem: { name: "asc" } }, skip: (page - 1) * pageSize, take: pageSize, include: { catalogItem: { include: { unitOfMeasure: true, category: true } }, balances: { where: warehouseId || scope.isolationEnabled ? balancesScope : undefined, include: { warehouse: { select: { id: true, code: true, name: true } }, storageLocation: { select: { id: true, code: true, name: true } }, stockLot: { select: { id: true, lotNumber: true, expiryDate: true } } }, orderBy: { updatedAt: "desc" } } } }),
    prisma.enterpriseInventoryItem.count({ where }),
    prisma.enterpriseStockMovement.count({ where: { organizationId, ...(scope.isolationEnabled ? { warehouse: { siteId: { in: scope.siteIds } } } : {}) } }),
    prisma.enterpriseWarehouse.count({ where: { organizationId, status: "ACTIVE", archivedAt: null, ...(scope.isolationEnabled ? { siteId: { in: scope.siteIds } } : {}) } }),
  ]);
  const normalizedItems = items.map((item) => {
    const quantityOnHand = item.balances.reduce((sum, balance) => sum + Number(balance.quantityOnHand), 0);
    const quantityReserved = item.balances.reduce((sum, balance) => sum + Number(balance.quantityReserved), 0);
    return { ...item, quantityOnHand, quantityReserved, quantityAvailable: quantityOnHand - quantityReserved, isLowStock: item.minimumQuantity !== null && quantityOnHand <= Number(item.minimumQuantity) };
  }).filter((item) => !lowStock || item.isLowStock);
  const lowStockCount = normalizedItems.filter((item) => item.isLowStock).length;
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "inventory", page } });
  return NextResponse.json({ items: normalizedItems, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { lowStockCount, movementCount, warehouseCount }, canManage: access.canManage && !scope.isolationEnabled });
}
