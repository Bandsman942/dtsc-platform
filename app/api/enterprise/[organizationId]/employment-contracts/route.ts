import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseEmploymentContract } from "@/lib/enterprise/hr-payroll/contracts";
import { employmentContractCreateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const employeeId = url.searchParams.get("employeeId")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const where: Prisma.EnterpriseEmploymentContractWhereInput = {
    organizationId,
    archivedAt: null,
    ...(employeeId ? { employeeId } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total, active, pendingApproval] = await Promise.all([
    prisma.enterpriseEmploymentContract.findMany({
      where,
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { employee: { select: { id: true, employeeNumber: true, displayName: true, employmentStatus: true } } },
    }),
    prisma.enterpriseEmploymentContract.count({ where }),
    prisma.enterpriseEmploymentContract.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseEmploymentContract.count({ where: { organizationId, archivedAt: null, status: "PENDING_APPROVAL" } }),
  ]);
  const visibleItems = items.map((item) => ({
    ...item,
    canEdit: item.createdByUserId === session.userId && ["DRAFT", "PENDING_APPROVAL"].includes(item.status),
  }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "employment-contracts", page } });
  return NextResponse.json({ items: visibleItems, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { active, pendingApproval }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-employment-contract-create:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = employmentContractCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Contrat invalide." }, { status: 400 });
  try {
    const contract = await createEnterpriseEmploymentContract(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_EMPLOYMENT_CONTRACT_SUBMITTED", entity: "EnterpriseEmploymentContract", entityId: contract.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "employment-contracts" } });
    return NextResponse.json({ ok: true, contract }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (duplicate) return NextResponse.json({ error: "EMPLOYMENT_CONTRACT_DUPLICATE", message: "Une version identique existe déjà." }, { status: 409 });
    return enterpriseDomainErrorResponse(error, "EMPLOYMENT_CONTRACT_CREATE_FAILED");
  }
}
