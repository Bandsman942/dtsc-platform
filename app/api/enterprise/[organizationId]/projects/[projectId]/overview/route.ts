import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; projectId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, projectId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PROJECTS_SERVICES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const project = await prisma.enterpriseProject.findFirst({
    where: { id: projectId, organizationId, archivedAt: null },
    include: {
      contract: { select: { id: true, reference: true, title: true, status: true } },
      members: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, include: { employee: { select: { id: true, employeeNumber: true, displayName: true, workEmail: true } } } },
      milestones: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
      deliverables: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
      risks: { orderBy: [{ severity: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }] },
      issues: { orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }] },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "project-overview", projectId } });
  return NextResponse.json({ project, canManage: access.canManage });
}
