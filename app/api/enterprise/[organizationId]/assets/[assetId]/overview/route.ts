import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; assetId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, assetId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const asset = await prisma.enterpriseAsset.findFirst({
    where: { id: assetId, organizationId, archivedAt: null },
    include: {
      category: true,
      site: true,
      storageLocation: true,
      assignments: { orderBy: { assignedAt: "desc" }, include: { employee: { select: { id: true, employeeNumber: true, displayName: true } } } },
      maintenanceRecords: { where: { archivedAt: null }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }] },
      incidents: { where: { archivedAt: null }, orderBy: [{ severity: "desc" }, { reportedAt: "desc" }] },
    },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "asset-overview", assetId } });
  return NextResponse.json({ asset, canManage: access.canManage });
}
