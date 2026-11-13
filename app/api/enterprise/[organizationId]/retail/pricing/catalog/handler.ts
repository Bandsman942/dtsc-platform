import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailListParams } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, search } = retailListParams(req);
  const where = {
    organizationId,
    priceType: "SALE",
    status: "ACTIVE",
    archivedAt: null,
    ...(search ? { catalogItem: { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { code: { contains: search, mode: "insensitive" as const } }, { sku: { contains: search, mode: "insensitive" as const } }] } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseCatalogPrice.findMany({
      where,
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        catalogItemId: true,
        amount: true,
        currency: true,
        taxIncluded: true,
        effectiveFrom: true,
        effectiveUntil: true,
        catalogItem: { select: { code: true, sku: true, name: true, taxable: true, taxCode: true } },
      },
    }),
    prisma.enterpriseCatalogPrice.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pricing", action: "catalog", page, pageSize } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}
