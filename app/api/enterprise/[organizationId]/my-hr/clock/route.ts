import { Prisma } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { getActiveEnterpriseSelfEmployee } from "@/lib/enterprise/hr-payroll/self-service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const clockSchema = z.object({
  action: z.enum(["START", "STOP"]),
  workSummary: z.string().trim().max(2000).optional().nullable(),
});
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-self-clock:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "TIME_ATTENDANCE", action: "submit", includeMutationCapabilities: false });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const employee = await getActiveEnterpriseSelfEmployee(session, organizationId);
  if (!employee) return NextResponse.json({ error: "EMPLOYEE_SELF_LINK_REQUIRED" }, { status: 403 });
  const parsed = clockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "EMPLOYEE_CLOCK_INPUT_INVALID", req);

  try {
    const clock = await prisma.$transaction(async (tx) => {
      const open = await tx.enterpriseWorkClockSession.findFirst({
        where: { organizationId, employeeId: employee.id, stoppedAt: null },
        orderBy: { startedAt: "desc" },
      });
      if (parsed.data.action === "START") {
        if (open) throw new EnterpriseDomainError("EMPLOYEE_CLOCK_ALREADY_RUNNING", 409);
        return tx.enterpriseWorkClockSession.create({
          data: { organizationId, employeeId: employee.id, startedByUserId: session.userId, startedAt: new Date() },
          select: { id: true, startedAt: true, stoppedAt: true, revision: true },
        });
      }
      if (!open) throw new EnterpriseDomainError("EMPLOYEE_CLOCK_NOT_RUNNING", 409);
      const updated = await tx.enterpriseWorkClockSession.updateMany({
        where: { id: open.id, organizationId, employeeId: employee.id, revision: open.revision, stoppedAt: null },
        data: { stoppedAt: new Date(), stoppedByUserId: session.userId, workSummary: parsed.data.workSummary || null, revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      return tx.enterpriseWorkClockSession.findUniqueOrThrow({
        where: { id: open.id }, select: { id: true, startedAt: true, stoppedAt: true, revision: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeAuditLog({
      userId: session.userId,
      action: parsed.data.action === "START" ? "ENTERPRISE_SELF_CLOCK_STARTED" : "ENTERPRISE_SELF_CLOCK_STOPPED",
      entity: "EnterpriseWorkClockSession", entityId: clock.id, request: req,
      metadata: { organizationId, employeeId: employee.id },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "my-hr-clock", action: parsed.data.action } });
    return NextResponse.json({ ok: true, clock }, { headers: privateHeaders });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "EMPLOYEE_CLOCK_FAILED", req);
  }
}
