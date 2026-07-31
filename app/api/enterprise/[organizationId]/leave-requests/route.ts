import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseLeaveRequest } from "@/lib/enterprise/hr-payroll/leave";
import { leaveRequestCreateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_ATTENDANCE", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const employeeId = url.searchParams.get("employeeId")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const items = await prisma.enterpriseLeaveRequest.findMany({
    where: { organizationId, archivedAt: null, ...(employeeId ? { employeeId } : {}), ...(status ? { status } : {}) },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { employee: { select: { id: true, employeeNumber: true, displayName: true } } },
  });
  const total = await prisma.enterpriseLeaveRequest.count({ where: { organizationId, archivedAt: null, ...(employeeId ? { employeeId } : {}), ...(status ? { status } : {}) } });
  const [pending, approved] = await Promise.all([
    prisma.enterpriseLeaveRequest.count({ where: { organizationId, archivedAt: null, status: "SUBMITTED" } }),
    prisma.enterpriseLeaveRequest.count({ where: { organizationId, archivedAt: null, status: "APPROVED" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "leave-requests", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { pending, approved }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-leave-request-create:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_ATTENDANCE", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = leaveRequestCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Demande de congé invalide." }, { status: 400 });
  try {
    const leaveRequest = await createEnterpriseLeaveRequest(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_LEAVE_REQUEST_SUBMITTED", entity: "EnterpriseLeaveRequest", entityId: leaveRequest.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "leave-requests" } });
    return NextResponse.json({ ok: true, leaveRequest }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "LEAVE_REQUEST_CREATE_FAILED");
  }
}
