import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { enterpriseDepartmentSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { organizationId } = await params;
  if (!(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_ADMIN_ACCESS_DENIED",
      entity: "Organization",
      entityId: organizationId,
      request: req,
      metadata: { activeContext: session.activeContext },
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [organization, membersCount, openRequestsCount, modules, sections, departments, positions, activityBlocks, workflows, recentRequests] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        name: true,
        sectorCode: true,
        sector: true,
        businessSector: { select: { labelFr: true, labelEn: true, icon: true, color: true } },
      },
    }),
    prisma.organizationMember.count({ where: { organizationId, status: "ACTIVE", removedAt: null } }),
    prisma.enterpriseActivityRequest.count({ where: { organizationId, status: { in: ["SUBMITTED", "IN_PROGRESS", "PENDING"] } } }),
    prisma.enterpriseModule.findMany({ where: { organizationId }, orderBy: [{ moduleCategory: "asc" }, { sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterpriseAdminSection.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterprisePosition.findMany({ where: { organizationId }, orderBy: [{ hierarchyLevel: "asc" }, { labelFr: "asc" }], include: { department: { select: { labelFr: true, labelEn: true } } } }),
    prisma.enterpriseActivityBlock.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterpriseWorkflow.findMany({ where: { organizationId }, orderBy: { labelFr: "asc" } }),
    prisma.enterpriseActivityRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { createdBy: { select: { name: true, email: true } } },
    }),
  ]);

  if (!organization) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({
    organization,
    dashboard: {
      membersCount,
      activeModulesCount: modules.filter((enterpriseModule) => enterpriseModule.isEnabled).length,
      modulesCount: modules.length,
      openRequestsCount,
      recentRequestsCount: recentRequests.length,
    },
    modules,
    sections,
    departments,
    positions,
    activityBlocks,
    workflows,
    recentRequests,
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { organizationId } = await params;
  if (!(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = enterpriseDepartmentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les informations du département sont invalides." }, { status: 400 });
  }

  const data = parsed.data;
  const department = await prisma.enterpriseDepartment.upsert({
    where: { organizationId_departmentCode: { organizationId, departmentCode: data.departmentCode } },
    update: {
      labelFr: data.labelFr,
      labelEn: data.labelEn,
      descriptionFr: data.descriptionFr || null,
      descriptionEn: data.descriptionEn || null,
      isActive: data.isActive,
    },
    create: {
      organizationId,
      departmentCode: data.departmentCode,
      labelFr: data.labelFr,
      labelEn: data.labelEn,
      descriptionFr: data.descriptionFr || null,
      descriptionEn: data.descriptionEn || null,
      isActive: data.isActive,
    },
  });

  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DEPARTMENT_UPSERTED", entity: "EnterpriseDepartment", entityId: department.id, request: req, metadata: { organizationId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, department });
}
