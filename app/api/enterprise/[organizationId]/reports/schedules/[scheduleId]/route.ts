import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { updateEnterpriseReportSchedule } from "@/lib/enterprise/reporting/schedule-service";
import { reportScheduleUpdateSchema } from "@/lib/enterprise/reporting/schedule-validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; scheduleId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-report-schedule-update:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, scheduleId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "manage" });
  if (!access?.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = reportScheduleUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Action invalide." }, { status: 400 });
  try {
    const schedule = await updateEnterpriseReportSchedule(organizationId, scheduleId, parsed.data);
    await writeAuditLog({ userId: session.userId, organizationId, action: `ENTERPRISE_REPORT_SCHEDULE_${parsed.data.action}`, entity: "EnterpriseReportSchedule", entityId: scheduleId, request: req, reasonCode: "REPORT_SCHEDULE_MANAGEMENT", riskLevel: "MEDIUM", metadata: { action: parsed.data.action } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "report-schedules", scheduleId, action: parsed.data.action } });
    return NextResponse.json({ item: schedule });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "report-schedules", scheduleId, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
