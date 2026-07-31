import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { opportunityCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { createEnterpriseOpportunity } from "@/lib/enterprise/crm-sales/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_PIPELINE", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const ownerUserId = url.searchParams.get("ownerUserId")?.trim() || "";
  const where: Prisma.EnterpriseOpportunityWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { reference: { contains: search, mode: "insensitive" } }] } : {}),
    ...(status ? { status } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
  };
  const [items, total, open, proposal, won, lost] = await Promise.all([
    prisma.enterpriseOpportunity.findMany({ where, orderBy: [{ expectedCloseDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { quotes: { select: { id: true, reference: true, status: true, totalAmount: true, currency: true }, orderBy: { createdAt: "desc" }, take: 3 } } }),
    prisma.enterpriseOpportunity.count({ where }),
    prisma.enterpriseOpportunity.count({ where: { organizationId, archivedAt: null, status: { in: ["OPEN", "QUALIFIED", "PROPOSAL", "NEGOTIATION"] } } }),
    prisma.enterpriseOpportunity.count({ where: { organizationId, archivedAt: null, status: "PROPOSAL" } }),
    prisma.enterpriseOpportunity.count({ where: { organizationId, archivedAt: null, status: "WON" } }),
    prisma.enterpriseOpportunity.count({ where: { organizationId, archivedAt: null, status: "LOST" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "opportunities", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { open, proposal, won, lost }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-opportunity-create:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_PIPELINE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = opportunityCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Opportunité invalide." }, { status: 400 });
  try {
    const opportunity = await createEnterpriseOpportunity(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_OPPORTUNITY_CREATED", entity: "EnterpriseOpportunity", entityId: opportunity.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "opportunities" } });
    return NextResponse.json({ ok: true, opportunity }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "OPPORTUNITY_CREATE_FAILED");
  }
}
