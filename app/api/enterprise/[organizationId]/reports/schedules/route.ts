import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { createEnterpriseReportSchedule, isReportEmailDeliveryConfigured, listEnterpriseReportSchedules } from "@/lib/enterprise/reporting/schedule-service";
import { reportScheduleCreateSchema } from "@/lib/enterprise/reporting/schedule-validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "manage" });
  if (!access?.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const schedules = await listEnterpriseReportSchedules(organizationId);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "report-schedules" } });
  return NextResponse.json({ items: schedules, canManage: true, emailDeliveryConfigured: isReportEmailDeliveryConfigured() });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-report-schedule:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "manage" });
  if (!access?.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = reportScheduleCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Planification invalide." }, { status: 400 });
  try {
    const schedule = await createEnterpriseReportSchedule(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_REPORT_SCHEDULE_CREATED", entity: "EnterpriseReportSchedule", entityId: schedule.id, request: req, reasonCode: "REPORT_SCHEDULE_MANAGEMENT", riskLevel: "MEDIUM", metadata: { reportType: schedule.reportType, frequency: schedule.frequency } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "report-schedules", scheduleId: schedule.id } });
    return NextResponse.json({ item: schedule }, { status: 201 });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "report-schedules", error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
