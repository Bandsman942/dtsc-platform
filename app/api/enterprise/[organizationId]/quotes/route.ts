import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { quoteCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { createEnterpriseQuote } from "@/lib/enterprise/crm-sales/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

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
  const where: Prisma.EnterpriseQuoteWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { reference: { contains: search, mode: "insensitive" } }] } : {}),
    ...(status ? { status } : {}),
    ...(businessPartyId ? { businessPartyId } : {}),
  };
  const [items, total, draft, sent, accepted, converted] = await Promise.all([
    prisma.enterpriseQuote.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { items: { orderBy: { sortOrder: "asc" }, take: 50 } } }),
    prisma.enterpriseQuote.count({ where }),
    prisma.enterpriseQuote.count({ where: { organizationId, archivedAt: null, status: "DRAFT" } }),
    prisma.enterpriseQuote.count({ where: { organizationId, archivedAt: null, status: "SENT" } }),
    prisma.enterpriseQuote.count({ where: { organizationId, archivedAt: null, status: "ACCEPTED" } }),
    prisma.enterpriseQuote.count({ where: { organizationId, archivedAt: null, status: "CONVERTED" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "quotes", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { draft, sent, accepted, converted }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-quote-create:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SALES_QUOTES_ORDERS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = quoteCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Devis invalide." }, { status: 400 });
  try {
    const quote = await createEnterpriseQuote(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_QUOTE_CREATED", entity: "EnterpriseQuote", entityId: quote.id, request: req, metadata: { organizationId, totalAmount: quote.totalAmount.toString(), currency: quote.currency } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "quotes" } });
    return NextResponse.json({ ok: true, quote }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "QUOTE_CREATE_FAILED");
  }
}
