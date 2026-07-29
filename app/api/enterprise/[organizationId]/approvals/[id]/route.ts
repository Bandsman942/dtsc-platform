import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { enterpriseApprovalVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { getEnterpriseOperationalTimeline } from "@/lib/enterprise/core-v2/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "VALIDATIONS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const approval = await prisma.enterpriseApproval.findFirst({ where: { ...enterpriseApprovalVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), id } });
  if (!approval) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [timeline, links] = await Promise.all([
    getEnterpriseOperationalTimeline({ organizationId, entityType: "EnterpriseApproval", entityId: id }),
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseApproval", sourceEntityId: id }, { targetEntityType: "EnterpriseApproval", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id } });
  return NextResponse.json({ approval, timeline, links, canManage: access.canManage, currentUserId: session.userId });
}
