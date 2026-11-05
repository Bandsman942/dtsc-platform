import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getActiveEnterpriseSelfEmployee, hasEnterpriseSelfHrModule } from "@/lib/enterprise/hr-payroll/self-service";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [access, employee] = await Promise.all([
    hasEnterpriseSelfHrModule(session, organizationId, "TIME_ATTENDANCE"),
    getActiveEnterpriseSelfEmployee(session, organizationId),
  ]);
  if (!access || !employee) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const members = await prisma.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", removedAt: null, userId: { not: session.userId } },
    orderBy: { user: { name: "asc" } },
    take: 250,
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  const approved = await Promise.all(members.map(async (member) => ({
    member,
    decision: await resolveEnterpriseModuleAccess({ organizationId, userId: member.userId, moduleCode: "TIME_ATTENDANCE", action: "approve" }),
  })));
  const approvers = approved.filter(({ decision }) => decision.allowed).map(({ member }) => ({
    userId: member.userId, name: member.user.name, email: member.user.email,
  }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "my-hr-approvers" } });
  return NextResponse.json({ approvers }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
