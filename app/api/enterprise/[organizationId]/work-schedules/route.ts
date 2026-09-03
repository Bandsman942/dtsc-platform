import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseWorkSchedule } from "@/lib/enterprise/hr-payroll/time-attendance";
import { workScheduleCreateSchema } from "@/lib/enterprise/hr-payroll/time-schemas";
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
  const where: Prisma.EnterpriseWorkScheduleWhereInput = { organizationId, archivedAt: null, ...(employeeId ? { employeeId } : {}) };
  const [items, total, active] = await Promise.all([
    prisma.enterpriseWorkSchedule.findMany({ where, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { employee: { select: { id: true, employeeNumber: true, displayName: true } } } }),
    prisma.enterpriseWorkSchedule.count({ where }),
    prisma.enterpriseWorkSchedule.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "work-schedules", page } });
  return NextResponse.json({ items, metrics: { active }, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-work-schedule-create:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_ATTENDANCE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = workScheduleCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Horaire invalide." }, { status: 400 });
  try {
    const schedule = await createEnterpriseWorkSchedule(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORK_SCHEDULE_CREATED", entity: "EnterpriseWorkSchedule", entityId: schedule.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "work-schedules" } });
    return NextResponse.json({ ok: true, schedule }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "WORK_SCHEDULE_CREATE_FAILED", req);
  }
}
