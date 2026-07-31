import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { timesheetCreateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { createEnterpriseTimesheet } from "@/lib/enterprise/hr-payroll/timesheets";
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
  const where = { organizationId, archivedAt: null, ...(employeeId ? { employeeId } : {}), ...(status ? { status } : {}) };
  const [items, total, pending, approvedMinutes] = await Promise.all([
    prisma.enterpriseTimesheet.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        employee: { select: { id: true, employeeNumber: true, displayName: true } },
        entries: { orderBy: [{ workDate: "asc" }, { createdAt: "asc" }] },
      },
    }),
    prisma.enterpriseTimesheet.count({ where }),
    prisma.enterpriseTimesheet.count({ where: { organizationId, archivedAt: null, status: "SUBMITTED" } }),
    prisma.enterpriseTimesheet.aggregate({ where: { organizationId, archivedAt: null, status: "APPROVED" }, _sum: { totalApprovedMinutes: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "timesheets", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { pending, approvedMinutes: approvedMinutes._sum.totalApprovedMinutes || 0 }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-timesheet-create:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_ATTENDANCE", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = timesheetCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Timesheet invalide." }, { status: 400 });
  try {
    const timesheet = await createEnterpriseTimesheet(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_TIMESHEET_SUBMITTED", entity: "EnterpriseTimesheet", entityId: timesheet.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "timesheets" } });
    return NextResponse.json({ ok: true, timesheet }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "TIMESHEET_CREATE_FAILED");
  }
}
