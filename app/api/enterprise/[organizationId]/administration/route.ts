import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseAdministrationMutationSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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

  const [organization, members, openRequestsCount, modules, sections, departments, positions, activityBlocks, workflows, recentRequests] = await Promise.all([
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
    workflows,
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
  if (data.entityType === "department" && data.responsibleUserId) {
    const responsible = await prisma.organizationMember.findFirst({ where: { organizationId, userId: data.responsibleUserId, status: "ACTIVE", removedAt: null }, select: { userId: true } });
    if (!responsible) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid responsible", message: "Le responsable du département doit être membre actif de cette entreprise." }, { status: 400 });
    }
  }

  if (data.entityType === "position" && data.departmentId) {
    const department = await prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } });
    if (!department) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid department", message: "Le département sélectionné n'appartient pas à cette entreprise." }, { status: 400 });
    }
  }

  if (data.entityType === "workflow") {
    if (data.departmentId) {
      const department = await prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } });
      if (!department) {
        await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
        return NextResponse.json({ error: "Invalid department", message: "Le département du workflow n'appartient pas à cette entreprise." }, { status: 400 });
      }
    }
    const selectedUsers = [...data.responsibleUserIds, ...data.recipientUserIds];
    if (selectedUsers.length) {
      const activeMembers = await prisma.organizationMember.count({ where: { organizationId, userId: { in: selectedUsers }, status: "ACTIVE", removedAt: null } });
      if (activeMembers !== new Set(selectedUsers).size) {
        await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
        return NextResponse.json({ error: "Invalid recipients", message: "Les responsables et destinataires doivent être membres actifs de cette entreprise." }, { status: 400 });
      }
    }
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
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });

    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DEPARTMENT_UPSERTED", entity: "EnterpriseDepartment", entityId: department.id, request: req, metadata: { organizationId } });
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

    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_POSITION_UPSERTED", entity: "EnterprisePosition", entityId: position.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, position });
  }

  if (data.entityType === "workflow") {
    const steps = (data.steps || "")
      .split(/\r?\n/)
      .map((step) => step.trim())
      .filter(Boolean);
    const workflow = await prisma.enterpriseWorkflow.upsert({
      where: { organizationId_workflowCode: { organizationId, workflowCode: data.workflowCode } },
      update: {
        labelFr: data.labelFr,
        labelEn: data.labelEn,
        descriptionFr: data.descriptionFr || null,
        descriptionEn: data.descriptionEn || null,
        isEnabled: data.isEnabled,
        stepsJson: {
          category: data.category || null,
          departmentId: data.departmentId || null,
          responsibleUserIds: data.responsibleUserIds,
          recipientUserIds: data.recipientUserIds,
          recommendedDelay: data.recommendedDelay || null,
          documents: data.documents || null,
          status: data.status,
          comment: data.comment || null,
          steps,
        },
      },
      create: {
        organizationId,
        workflowCode: data.workflowCode,
        labelFr: data.labelFr,
        labelEn: data.labelEn,
        descriptionFr: data.descriptionFr || null,
        descriptionEn: data.descriptionEn || null,
        isEnabled: data.isEnabled,
        stepsJson: {
          category: data.category || null,
          departmentId: data.departmentId || null,
          responsibleUserIds: data.responsibleUserIds,
          recipientUserIds: data.recipientUserIds,
          recommendedDelay: data.recommendedDelay || null,
          documents: data.documents || null,
          status: data.status,
          comment: data.comment || null,
          steps,
        },
      },
    });
    if (data.recipientUserIds.length) {
      await prisma.notification.createMany({
        data: data.recipientUserIds.map((userId) => ({
          userId,
          organizationId,
          title: "Workflow entreprise partagé",
          body: data.labelFr,
          type: "ENTERPRISE_WORKFLOW",
          targetUrl: "/enterprise-activities",
        })),
        skipDuplicates: true,
      });
    }
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_UPSERTED", entity: "EnterpriseWorkflow", entityId: workflow.id, request: req, metadata: { organizationId, recipients: data.recipientUserIds.length } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, workflow });
  }

  const previous = await prisma.organization.findUnique({ where: { id: organizationId }, select: { sectorCode: true, settingsJson: true, brandingJson: true } });
  const previousSettings = jsonObject(previous?.settingsJson);
  const settingsJson = {
    ...previousSettings,
    defaultLanguage: data.defaultLanguage,
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
  const brandingJson = {
    ...jsonObject(previous?.brandingJson),
    primaryColor: data.primaryColor || null,
  };
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

  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_SETTINGS_UPDATED", entity: "Organization", entityId: organization.id, request: req, metadata: { organizationId, sector: organization.sectorCode } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, organization });
}
