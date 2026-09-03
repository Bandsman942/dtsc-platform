import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { endEnterpriseWorkSchedule } from "@/lib/enterprise/hr-payroll/time-attendance";
import { workScheduleEndSchema } from "@/lib/enterprise/hr-payroll/time-schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; scheduleId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-work-schedule-end:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, scheduleId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_ATTENDANCE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = workScheduleEndSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Clôture d’horaire invalide." }, { status: 400 });
  try {
    const schedule = await endEnterpriseWorkSchedule(organizationId, scheduleId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORK_SCHEDULE_ENDED", entity: "EnterpriseWorkSchedule", entityId: schedule.id, request: req, metadata: { organizationId, effectiveUntil: schedule.effectiveUntil?.toISOString() || null } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "work-schedules", action: "END" } });
    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "WORK_SCHEDULE_END_FAILED", req);
  }
}
