import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string }> };

const APPROVAL_MODULES = new Set(["HUMAN_RESOURCES", "TIME_ATTENDANCE", "PAYROLL_OPERATIONS"]);

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-approval-eligibility:${session.userId}`), 300, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { organizationId } = await params;
  const url = new URL(req.url);
  const moduleCode = url.searchParams.get("module")?.trim() || "";
  const approverUserId = url.searchParams.get("approverUserId")?.trim() || "";
  if (!APPROVAL_MODULES.has(moduleCode) || !approverUserId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const callerAccess = await getEnterpriseCommonDomainAccess({
    session,
    organizationId,
    moduleCode,
    action: "read",
  });
  if (!callerAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (approverUserId === session.userId) {
    return NextResponse.json({ eligible: false, code: "SELF_APPROVAL_FORBIDDEN" });
  }

  const member = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: approverUserId, status: "ACTIVE", removedAt: null },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ eligible: false, code: "APPROVER_NOT_MEMBER" });
  }

  const approvalAccess = await resolveEnterpriseModuleAccess({
    userId: approverUserId,
    organizationId,
    moduleCode,
    action: "approve",
  });
  const code = approvalAccess.allowed ? null : "APPROVER_PERMISSION_DENIED";

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "approval-eligibility", moduleCode, eligible: approvalAccess.allowed },
  });
  return NextResponse.json({ eligible: approvalAccess.allowed, code });
}
