import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailSaleCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createRetailSale } from "@/lib/enterprise/retail/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, status, search, from, to } = retailListParams(req);
  const where: Prisma.EnterpriseRetailSaleWhereInput = {
    organizationId,
    ...(status ? { status } : {}),
    ...(from || to ? { soldAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { lines: { some: { description: { contains: search, mode: "insensitive" } } } }] } : {}),
  };
  const [items, total, aggregate] = await Promise.all([
    prisma.enterpriseRetailSale.findMany({ where, orderBy: { soldAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { lines: true, tenders: true } }),
    prisma.enterpriseRetailSale.count({ where }),
    prisma.enterpriseRetailSale.aggregate({ where: { ...where, status: "COMPLETED" }, _sum: { grandTotal: true }, _count: { _all: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-sales", page } });
  return NextResponse.json({ items, metrics: { completedCount: aggregate._count._all, revenue: aggregate._sum.grandTotal || 0 }, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 240 });
  if (!auth.ok) return auth.response;
  const parsed = retailSaleCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Ticket invalide." }, { status: 400 });
  try {
    const result = await createRetailSale(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_SALE_COMPLETED", entity: "EnterpriseRetailSale", entityId: result.sale.id, request: req, metadata: { organizationId, number: result.sale.number, amount: result.sale.grandTotal.toFixed(), currency: result.sale.currencyCode, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-sales", action: "create" } });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_SALE_CREATE_FAILED");
  }
}
