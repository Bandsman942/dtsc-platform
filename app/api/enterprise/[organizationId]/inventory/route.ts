import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
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
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const lowStock = url.searchParams.get("lowStock") === "true";
  const where: Prisma.EnterpriseInventoryItemWhereInput = {
    organizationId,
    archivedAt: null,
    status: "ACTIVE",
    ...(search ? { catalogItem: { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] } } : {}),
    ...(warehouseId ? { balances: { some: { warehouseId } } } : {}),
  };
  const [items, total, movementCount, warehouseCount] = await Promise.all([
    prisma.enterpriseInventoryItem.findMany({ where, orderBy: { catalogItem: { name: "asc" } }, skip: (page - 1) * pageSize, take: pageSize, include: { catalogItem: { include: { unitOfMeasure: true, category: true } }, balances: { where: warehouseId ? { warehouseId } : undefined, include: { warehouse: { select: { id: true, code: true, name: true } }, storageLocation: { select: { id: true, code: true, name: true } }, stockLot: { select: { id: true, lotNumber: true, expiryDate: true } } }, orderBy: { updatedAt: "desc" } } } }),
    prisma.enterpriseInventoryItem.count({ where }),
    prisma.enterpriseStockMovement.count({ where: { organizationId } }),
    prisma.enterpriseWarehouse.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
  ]);
  const normalizedItems = items.map((item) => {
    const quantityOnHand = item.balances.reduce((sum, balance) => sum + Number(balance.quantityOnHand), 0);
    const quantityReserved = item.balances.reduce((sum, balance) => sum + Number(balance.quantityReserved), 0);
    return { ...item, quantityOnHand, quantityReserved, quantityAvailable: quantityOnHand - quantityReserved, isLowStock: item.minimumQuantity !== null && quantityOnHand <= Number(item.minimumQuantity) };
  }).filter((item) => !lowStock || item.isLowStock);
  const lowStockCount = normalizedItems.filter((item) => item.isLowStock).length;
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "inventory", page } });
  return NextResponse.json({ items: normalizedItems, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { lowStockCount, movementCount, warehouseCount }, canManage: access.canManage });
}
