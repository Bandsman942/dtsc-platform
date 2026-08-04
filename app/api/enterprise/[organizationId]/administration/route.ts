import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseAdministrationMutationSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function canManageEnterpriseAdministration(userId: string, organizationId: string) {
  const access = await resolveEnterpriseModuleAccess({
    userId,
    organizationId,
    moduleCode: "ADMIN_DASHBOARD",
    action: "manage",
  });
  return access.allowed;
}

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

  const [organization, members, openRequestsCount, modules, sections, departments, positions, activityBlocks, legacyWorkflows, recentRequests] = await Promise.all([
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
    prisma.organizationMember.findMany({
      where: { organizationId, removedAt: null },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      include: { user: { select: { id: true, name: true, email: true } } },
      take: 200,
    }),
    prisma.enterpriseActivityRequest.count({ where: { organizationId, status: { in: ["SUBMITTED", "IN_PROGRESS", "PENDING"] } } }),
    prisma.enterpriseModule.findMany({ where: { organizationId }, orderBy: [{ moduleCategory: "asc" }, { sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterpriseAdminSection.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterprisePosition.findMany({ where: { organizationId }, orderBy: [{ hierarchyLevel: "asc" }, { labelFr: "asc" }], include: { department: { select: { labelFr: true, labelEn: true } } } }),
    prisma.enterpriseActivityBlock.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterpriseWorkflow.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 100 }),
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

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, legacyWorkflowPolicy: "LEGACY_READ_ONLY" } });
  return NextResponse.json({
    organization,
    dashboard: {
      membersCount: members.length,
      activeModulesCount: modules.filter((enterpriseModule) => enterpriseModule.isEnabled).length,
      modulesCount: modules.length,
      openRequestsCount,
      recentRequestsCount: recentRequests.length,
    },
    members,
    modules,
    sections,
    departments,
    positions,
    activityBlocks,
    workflows: legacyWorkflows,
    legacyWorkflowsReadOnly: true,
    recentRequests,
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_admin_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-admin:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'actions d'administration sur une courte période." }, { status: 429 });
  }
  const { organizationId } = await params;
  if (!(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = enterpriseAdministrationMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les informations d'administration entreprise sont invalides." }, { status: 400 });
  }

  const data = parsed.data;
  if (data.entityType === "workflow") {
    await writeAuditLog({
      userId: session.userId,
      action: "LEGACY_WORKFLOW_WRITE_ATTEMPT_BLOCKED",
      entity: "EnterpriseWorkflow",
      request: req,
      metadata: { organizationId, workflowCode: data.workflowCode, legacyPolicy: "LEGACY_READ_ONLY" },
    });
    await writeApiLog({
      request: req,
      statusCode: 410,
      userId: session.userId,
      startedAt,
      metadata: { organizationId, deprecatedRouteHit: true, legacyWriteAttempt: true, entityType: "workflow" },
    });
    return NextResponse.json(
      {
        error: "Legacy workflow route retired",
        code: "LEGACY_WORKFLOW_WRITE_DENIED",
        message: "Le catalogue workflow historique est en lecture seule. Utilisez Workflow Engine v2.",
      },
      { status: 410 },
    );
  }

  if (data.entityType === "department" && data.responsibleUserId) {
    const responsible = await prisma.organizationMember.findFirst({ where: { organizationId, userId: data.responsibleUserId, status: "ACTIVE", removedAt: null }, select: { userId: true } });
    if (!responsible) return NextResponse.json({ error: "Invalid responsible", message: "Le responsable du département doit être membre actif de cette entreprise." }, { status: 400 });
  }
  if (data.entityType === "department" && data.parentDepartmentId) {
    const parent = await prisma.enterpriseDepartment.findFirst({ where: { id: data.parentDepartmentId, organizationId }, select: { id: true, parentDepartmentId: true, departmentCode: true } });
    if (!parent) return NextResponse.json({ error: "DEPARTMENT_PARENT_INVALID", message: "Le département parent doit appartenir à cette entreprise." }, { status: 400 });
    const existing = await prisma.enterpriseDepartment.findUnique({ where: { organizationId_departmentCode: { organizationId, departmentCode: data.departmentCode } }, select: { id: true } });
    if (existing?.id === parent.id) return NextResponse.json({ error: "DEPARTMENT_CYCLE", message: "Un département ne peut pas être son propre parent." }, { status: 409 });
    if (existing) {
      let cursor: string | null = parent.parentDepartmentId;
      const visited = new Set<string>([parent.id]);
      while (cursor) {
        if (cursor === existing.id) return NextResponse.json({ error: "DEPARTMENT_CYCLE", message: "Ce déplacement créerait un cycle dans la hiérarchie." }, { status: 409 });
        if (visited.has(cursor)) return NextResponse.json({ error: "DEPARTMENT_CYCLE", message: "La hiérarchie existante contient un cycle." }, { status: 409 });
        visited.add(cursor);
        const ancestor = await prisma.enterpriseDepartment.findFirst({ where: { id: cursor, organizationId }, select: { parentDepartmentId: true } });
        cursor = ancestor?.parentDepartmentId || null;
      }
    }
  }
  if (data.entityType === "position" && data.departmentId) {
    const department = await prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } });
    if (!department) return NextResponse.json({ error: "Invalid department", message: "Le département sélectionné n'appartient pas à cette entreprise." }, { status: 400 });
  }

  if (data.entityType === "department") {
    const department = await prisma.enterpriseDepartment.upsert({
      where: { organizationId_departmentCode: { organizationId, departmentCode: data.departmentCode } },
      update: {
        labelFr: data.labelFr,
        labelEn: data.labelEn,
        descriptionFr: data.descriptionFr || null,
        descriptionEn: data.descriptionEn || null,
        responsibleUserId: data.responsibleUserId || null,
        parentDepartmentId: data.parentDepartmentId || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
      create: {
        organizationId,
        departmentCode: data.departmentCode,
        labelFr: data.labelFr,
        labelEn: data.labelEn,
        descriptionFr: data.descriptionFr || null,
        descriptionEn: data.descriptionEn || null,
        responsibleUserId: data.responsibleUserId || null,
        parentDepartmentId: data.parentDepartmentId || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_DEPARTMENT_UPSERTED", entity: "EnterpriseDepartment", entityId: department.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, department });
  }

  if (data.entityType === "position") {
    const position = await prisma.enterprisePosition.upsert({
      where: { organizationId_positionCode: { organizationId, positionCode: data.positionCode } },
      update: {
        labelFr: data.labelFr,
        labelEn: data.labelEn,
        descriptionFr: data.descriptionFr || null,
        descriptionEn: data.descriptionEn || null,
        departmentId: data.departmentId || null,
        hierarchyLevel: data.hierarchyLevel,
        isActive: data.isActive,
        isKeyPosition: data.isKeyPosition,
        permissionsJson: data.permissions.length ? data.permissions : [],
      },
      create: {
        organizationId,
        positionCode: data.positionCode,
        labelFr: data.labelFr,
        labelEn: data.labelEn,
        descriptionFr: data.descriptionFr || null,
        descriptionEn: data.descriptionEn || null,
        departmentId: data.departmentId || null,
        hierarchyLevel: data.hierarchyLevel,
        isActive: data.isActive,
        isKeyPosition: data.isKeyPosition,
        permissionsJson: data.permissions.length ? data.permissions : [],
      },
    });
    await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_POSITION_UPSERTED", entity: "EnterprisePosition", entityId: position.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, position });
  }

  const previous = await prisma.organization.findUnique({ where: { id: organizationId }, select: { sectorCode: true, settingsJson: true, brandingJson: true } });
  const previousSettings = jsonObject(previous?.settingsJson);
  const settingsJson = {
    ...previousSettings,
    defaultLanguage: data.defaultLanguage,
    primaryCurrency: data.primaryCurrency,
    fiscalYearStartMonth: data.fiscalYearStartMonth,
    dateFormat: data.dateFormat,
    numberFormat: data.numberFormat,
    retentionDays: data.retentionDays,
    ...(previous?.sectorCode === "HEALTH_CARE" ? { health: {
      establishmentType: data.establishmentType,
      patientPrefix: data.patientPrefix,
      invoicePrefix: data.invoicePrefix,
      activeServices: data.activeServices || null,
      enhancedMedicalPrivacy: data.enhancedMedicalPrivacy,
      medicalRecordRoles: data.medicalRecordRoles || null,
      closeConsultationRoles: data.closeConsultationRoles || null,
      reopenConsultationRoles: data.reopenConsultationRoles || null,
      labValidationRoles: data.labValidationRoles || null,
      consultationLockHours: data.consultationLockHours,
      pharmacyAlertOptions: data.pharmacyAlertOptions || null,
      laboratoryAlertOptions: data.laboratoryAlertOptions || null,
      criticalIncidentOptions: data.criticalIncidentOptions || null,
    } } : {}),
    ...(previous?.sectorCode === "PHARMACY" ? { pharmacy: {
      pharmacyType: data.pharmacyType || null,
      currency: data.pharmacyCurrency || "USD",
      salePrefix: data.pharmacySalePrefix || "VTE-",
      orderPrefix: data.pharmacyOrderPrefix || "CMD-",
      receiptPrefix: data.pharmacyReceiptPrefix || "REC-",
      expiryAlertDays: data.pharmacyExpiryAlertDays,
      fefoEnabled: data.pharmacyFefoEnabled,
      negativeStockBlocked: data.pharmacyNegativeStockBlocked,
    } } : {}),
  };
  const brandingJson = { ...jsonObject(previous?.brandingJson), primaryColor: data.primaryColor || null };
  const organization = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      name: data.displayName,
      logoUrl: data.logoUrl || null,
      country: data.country || null,
      city: data.city || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      timezone: data.timezone,
      settingsJson,
      brandingJson,
    },
  });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_SETTINGS_UPDATED", entity: "Organization", entityId: organization.id, request: req, metadata: { organizationId, sector: organization.sectorCode } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, organization });
}
