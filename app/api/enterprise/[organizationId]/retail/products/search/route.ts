import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(parsed)));
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const warehouseId = (url.searchParams.get("warehouseId") || "").trim() || null;
  const page = positiveInteger(url.searchParams.get("page"), 1, 1_000_000);
  const pageSize = positiveInteger(url.searchParams.get("pageSize"), 30, 100);

  if (warehouseId) {
    const warehouse = await prisma.enterpriseWarehouse.findFirst({
      where: { id: warehouseId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    });
    if (!warehouse) {
      return NextResponse.json(
        { error: "RETAIL_REFERENCE_INVALID", message: "Le dépôt sélectionné n’appartient pas à cette entreprise." },
        { status: 409 },
      );
    }
  }

  const searchFilter: Prisma.EnterpriseCatalogItemWhereInput = query
    ? {
        OR: [
          { code: { contains: query, mode: "insensitive" } },
          { sku: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { normalizedName: { contains: query.toLowerCase(), mode: "insensitive" } },
        ],
      }
    : {};

  const where: Prisma.EnterpriseCatalogItemWhereInput = {
    organizationId,
    status: "ACTIVE",
    archivedAt: null,
    ...searchFilter,
  };

  const [items, total] = await Promise.all([
    prisma.enterpriseCatalogItem.findMany({
      where,
      orderBy: [{ name: "asc" }, { code: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        sku: true,
        name: true,
        itemType: true,
        indicativeSalePrice: true,
        indicativeCost: true,
        currency: true,
        trackInventory: true,
        inventoryItems: {
          where: { status: "ACTIVE", archivedAt: null },
          take: 1,
          select: {
            id: true,
            allowNegativeStock: true,
            balances: {
              where: warehouseId ? { warehouseId } : undefined,
              select: {
                warehouseId: true,
                storageLocationId: true,
                stockLotId: true,
                quantityOnHand: true,
                quantityReserved: true,
              },
            },
          },
        },
      },
    }),
    prisma.enterpriseCatalogItem.count({ where }),
  ]);

  const results = items.map((item) => {
    const inventoryItem = item.inventoryItems[0] || null;
    const availableQuantity = inventoryItem?.balances.reduce(
      (totalAvailable, balance) => totalAvailable.plus(balance.quantityOnHand).minus(balance.quantityReserved),
      new Prisma.Decimal(0),
    ) ?? null;

    return {
      id: item.id,
      code: item.code,
      sku: item.sku,
      name: item.name,
      itemType: item.itemType,
      indicativeSalePrice: item.indicativeSalePrice,
      indicativeCost: item.indicativeCost,
      currency: item.currency,
      trackInventory: item.trackInventory,
      inventoryItemId: inventoryItem?.id || null,
      allowNegativeStock: inventoryItem?.allowNegativeStock || false,
      availableQuantity: availableQuantity?.toFixed() ?? null,
    };
  });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: {
      organizationId,
      domain: "retail-pos-product-search",
      page,
      pageSize,
      hasQuery: Boolean(query),
      warehouseId,
    },
  });

  return NextResponse.json({
    items: results,
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
