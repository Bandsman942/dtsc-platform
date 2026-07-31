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
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SALES_QUOTES_ORDERS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const businessPartyId = url.searchParams.get("businessPartyId")?.trim() || "";
  const where: Prisma.EnterpriseSalesOrderWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { reference: { contains: search, mode: "insensitive" } }] } : {}),
    ...(status ? { status } : {}),
    ...(businessPartyId ? { businessPartyId } : {}),
  };
  const [items, total, confirmed, partial, fulfilled, pending] = await Promise.all([
    prisma.enterpriseSalesOrder.findMany({ where, orderBy: [{ expectedFulfillmentAt: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { items: { orderBy: { sortOrder: "asc" } }, fulfillments: { orderBy: { createdAt: "desc" }, take: 10, include: { items: true } } } }),
    prisma.enterpriseSalesOrder.count({ where }),
    prisma.enterpriseSalesOrder.count({ where: { organizationId, archivedAt: null, status: "CONFIRMED" } }),
    prisma.enterpriseSalesOrder.count({ where: { organizationId, archivedAt: null, status: "PARTIALLY_FULFILLED" } }),
    prisma.enterpriseSalesOrder.count({ where: { organizationId, archivedAt: null, status: "FULFILLED" } }),
    prisma.enterpriseSalesOrder.count({ where: { organizationId, archivedAt: null, status: { in: ["DRAFT", "PENDING_APPROVAL"] } } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "sales-orders", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { confirmed, partial, fulfilled, pending }, canManage: access.canManage });
}
