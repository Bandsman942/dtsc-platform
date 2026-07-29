import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { enterpriseReportVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { organizationId, id } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const visibility = enterpriseReportVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }); const report = await prisma.enterpriseReport.findFirst({ where: { AND: [visibility, { id }] } }); if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 }); const [links, events] = await Promise.all([prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseReport", sourceEntityId: id }, { targetEntityType: "EnterpriseReport", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 100 }), prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterpriseReport", entityId: id }, orderBy: { createdAt: "desc" }, take: 100 })]); await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", reportId: id } }); return NextResponse.json({ report, links, events, canManage: access.canManage });
}
