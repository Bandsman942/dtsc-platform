import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { submitEnterprisePayrollRun } from "@/lib/enterprise/hr-payroll/payroll";
import { payrollRunSubmitSchema } from "@/lib/enterprise/hr-payroll/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; payrollRunId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-payroll-run-submit:${session.userId}`), 50, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, payrollRunId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PAYROLL_OPERATIONS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = payrollRunSubmitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Soumission invalide." }, { status: 400 });
  try {
    const payrollRun = await submitEnterprisePayrollRun(organizationId, payrollRunId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PAYROLL_RUN_SUBMITTED", entity: "EnterprisePayrollRun", entityId: payrollRun.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "payroll-runs", action: "submit" } });
    return NextResponse.json({ ok: true, payrollRun });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "PAYROLL_RUN_SUBMIT_FAILED");
  }
}
