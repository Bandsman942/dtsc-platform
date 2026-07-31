import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { contractCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { createEnterpriseContract } from "@/lib/enterprise/crm-sales/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CONTRACTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const where: Prisma.EnterpriseContractWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { reference: { contains: search, mode: "insensitive" } }] } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total, draft, pendingApproval, active, expiring] = await Promise.all([
    prisma.enterpriseContract.findMany({ where, orderBy: [{ endDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseContract.count({ where }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "DRAFT" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "PENDING_APPROVAL" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "ACTIVE", endDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "contracts", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { draft, pendingApproval, active, expiring }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-contract-create:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CONTRACTS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = contractCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Contrat invalide." }, { status: 400 });
  try {
    const contract = await createEnterpriseContract(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_CONTRACT_CREATED", entity: "EnterpriseContract", entityId: contract.id, request: req, metadata: { organizationId, status: contract.status } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "contracts" } });
    return NextResponse.json({ ok: true, contract }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "CONTRACT_CREATE_FAILED");
  }
}
