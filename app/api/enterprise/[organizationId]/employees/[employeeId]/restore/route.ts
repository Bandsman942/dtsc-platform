import { z } from "zod";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { restoreEnterpriseEmployee } from "@/lib/enterprise/hr-payroll/employees";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; employeeId: string }> };
const schema = z.object({ revision: z.number().int().positive() });

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-employee-restore:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, employeeId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "HUMAN_RESOURCES", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EMPLOYEE_RESTORE_INPUT_INVALID", req);
  try {
    const result = await restoreEnterpriseEmployee(organizationId, employeeId, session.userId, parsed.data.revision);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_EMPLOYEE_RESTORED", entity: "EnterpriseEmployee", entityId: employeeId, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "employees", action: "restore" } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return enterpriseDomainErrorResponse(error, "EMPLOYEE_RESTORE_FAILED", req); }
}
