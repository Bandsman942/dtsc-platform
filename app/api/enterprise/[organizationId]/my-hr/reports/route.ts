import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { getActiveEnterpriseSelfEmployee, hasEnterpriseSelfHrModule } from "@/lib/enterprise/hr-payroll/self-service";
import { timesheetCreateSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { createEnterpriseTimesheet } from "@/lib/enterprise/hr-payroll/timesheets";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-self-work-report:${session.userId}`), 50, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await hasEnterpriseSelfHrModule(session, organizationId, "TIME_ATTENDANCE");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const employee = await getActiveEnterpriseSelfEmployee(session, organizationId);
  if (!employee) return NextResponse.json({ error: "EMPLOYEE_SELF_LINK_REQUIRED" }, { status: 403 });
  const body = await req.json().catch(() => null);
  // Never trust an employeeId from a client request; the owner is resolved from the signed-in member.
  const parsed = timesheetCreateSchema.safeParse(body && typeof body === "object"
    ? { ...body, employeeId: employee.id }
    : null);
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EMPLOYEE_WORK_REPORT_INPUT_INVALID", req);
  try {
    const timesheet = await createEnterpriseTimesheet(organizationId, session.userId, parsed.data, { selfService: true });
    await writeAuditLog({
      userId: session.userId, action: "ENTERPRISE_SELF_WORK_REPORT_SUBMITTED",
      entity: "EnterpriseTimesheet", entityId: timesheet.id, request: req,
      metadata: { organizationId, employeeId: employee.id },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "my-hr-reports" } });
    return NextResponse.json({ ok: true, timesheet: { id: timesheet.id, reference: timesheet.reference, status: timesheet.status } }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "EMPLOYEE_WORK_REPORT_FAILED", req);
  }
}
