import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { leadCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { createEnterpriseLead } from "@/lib/enterprise/crm-sales/service";
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
  const where: Prisma.EnterpriseLeadWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ legalName: { contains: search, mode: "insensitive" } }, { displayName: { contains: search, mode: "insensitive" } }, { companyName: { contains: search, mode: "insensitive" } }, { reference: { contains: search, mode: "insensitive" } }] } : {}),
    ...(status ? { status } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
  };
  const [items, total, fresh, qualified, converted, lost] = await Promise.all([
    prisma.enterpriseLead.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseLead.count({ where }),
    prisma.enterpriseLead.count({ where: { organizationId, archivedAt: null, status: "NEW" } }),
    prisma.enterpriseLead.count({ where: { organizationId, archivedAt: null, status: "QUALIFIED" } }),
    prisma.enterpriseLead.count({ where: { organizationId, archivedAt: null, status: "CONVERTED" } }),
    prisma.enterpriseLead.count({ where: { organizationId, archivedAt: null, status: "LOST" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "leads", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { fresh, qualified, converted, lost }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-lead-create:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_PIPELINE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = leadCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Lead invalide." }, { status: 400 });
  try {
    const lead = await createEnterpriseLead(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_LEAD_CREATED", entity: "EnterpriseLead", entityId: lead.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "leads" } });
    return NextResponse.json({ ok: true, lead }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "LEAD_CREATE_FAILED");
  }
}
