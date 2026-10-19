import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseActivity, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { createEnterpriseRequestInTransaction } from "@/lib/enterprise/core-v2/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseActivityRequestSchema } from "@/lib/validators";
import { getBusinessActivityFields, resolveEnterpriseActivityAction, GAMING_ACTIVITY_REFERENCE_MODULE_CODES, GAMING_INCOMPATIBLE_ACTIVITY_BLOCKS } from "@/lib/enterprise/enterprise-activity-form-contract";
import { isValidEnterpriseActivityCivilDate } from "@/lib/enterprise/enterprise-activity-civil-date";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { organizationId } = await params;
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canSeeAll =
    membership.role === "OWNER" ||
    membership.role === "ADMIN_ENTREPRISE" ||
    membership.role === "ADMIN_ENTERPRISE" ||
    membership.role === "MANAGER";
  const requestWhere = canSeeAll
    ? { organizationId }
    : {
        organizationId,
        OR: [{ createdById: session.userId }, { assignedToUserId: session.userId }],
      };

  const [organization, blocks, requests] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, sectorCode: true, sector: true, businessSector: { select: { labelFr: true, labelEn: true, icon: true, color: true } } },
    }),
    prisma.enterpriseActivityBlock.findMany({
      where: { organizationId, isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
    }),
    prisma.enterpriseActivityRequest.findMany({
      where: requestWhere,
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { createdBy: { select: { name: true, email: true } }, block: { select: { labelFr: true, labelEn: true, icon: true } } },
    }),
  ]);

  if (!organization) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ organization, blocks, requests, membershipRole: membership.role });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_activity_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `enterprise-activity:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de demandes entreprise sur une courte période." }, { status: 429 });
  }

  const { organizationId } = await params;
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = enterpriseActivityRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: "La demande d'activité est invalide." }, { status: 400 });
  }

  const data = parsed.data;
  if (!(await canAccessEnterpriseActivity(session.userId, organizationId, data.blockCode, "submit"))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous n'êtes pas autorisé à soumettre cette action." }, { status: 403 });
  }
  const block = await prisma.enterpriseActivityBlock.findUnique({
    where: { organizationId_blockCode: { organizationId, blockCode: data.blockCode } },
  });
  if (!block) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Every request remains an EnterpriseRequest, not a second editable Gaming object.
  // Business references are resolved server-side and must belong to this organization.
  const organization = await prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" }, select: { sectorCode: true } });
  const subtype = await prisma.enterpriseBusinessSubtypeSelection.findUnique({ where: { organizationId }, select: { businessSubtypeCode: true } });
  const gamingLounge = organization?.sectorCode === "HOSPITALITY_EVENTS" && subtype?.businessSubtypeCode === "GAMING_LOUNGE";
  if (!organization || (gamingLounge && GAMING_INCOMPATIBLE_ACTIVITY_BLOCKS.has(block.blockCode))) {
    return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_UNAVAILABLE", message: "Cette action n'est pas disponible dans le secteur actif." }, { status: 403 });
  }
  const action = resolveEnterpriseActivityAction(organization.sectorCode, gamingLounge ? "GAMING_LOUNGE" : null, block.blockCode);
  if (action.mode !== "REQUEST") {
    // Never transform a document submission, grade entry, stock mutation or
    // approval into a generic request that falsely signals completion.
    return NextResponse.json({
      error: "ENTERPRISE_ACTIVITY_ACTION_NOT_READY",
      message: action.reasonFr || "Cette opération doit être réalisée dans son module métier dédié. Aucune action n'a été enregistrée.",
    }, { status: 422 });
  }
  const isDedicatedSector = organization.sectorCode === "HEALTH_CARE" || organization.sectorCode === "PHARMACY";
  if (!isDedicatedSector) {
    const fields = getBusinessActivityFields(organization.sectorCode, gamingLounge ? "GAMING_LOUNGE" : null, block.blockCode);
    const names = new Set(fields.map((field) => field.name));
    for (const field of fields) {
      const value = data.metadata[field.name]?.trim() || "";
      if (field.required && !value) {
        return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_FIELD_REQUIRED", message: `Complétez le champ « ${field.label} ».` }, { status: 400 });
      }
      if (!value) continue;
      if (field.options && !field.options.includes(value)) {
        return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_OPTION_INVALID", message: `La valeur du champ « ${field.label} » n'est pas autorisée.` }, { status: 400 });
      }
      if (field.type === "number" && (!Number.isFinite(Number(value)) || Number(value) < 0 || (field.name === "quantity" && Number(value) <= 0))) {
        return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_AMOUNT_INVALID", message: `Le champ « ${field.label} » doit contenir un nombre valide.` }, { status: 400 });
      }
      if (field.name === "discountPercent" && Number(value) > 100) {
        return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_DISCOUNT_INVALID", message: "La remise proposée ne peut pas dépasser 100 %." }, { status: 400 });
      }
      if (field.name === "requestedAmount" && Number(value) <= 0) {
        return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_AMOUNT_INVALID", message: "Indiquez un montant strictement positif." }, { status: 400 });
      }
      if (field.name === "currencyCode" && !/^[A-Z]{3}$/.test(value)) {
        return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_CURRENCY_INVALID", message: "Indiquez un code devise ISO à trois lettres, comme CDF ou USD." }, { status: 400 });
      }
      if (field.type === "date" && !isValidEnterpriseActivityCivilDate(value)) {
        return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_DATE_INVALID", message: `Indiquez une date valide pour « ${field.label} ».` }, { status: 400 });
      }
      if (field.source) {
        // A submit permission on Activities does not grant read access to
        // restricted Gaming cash, sessions, bookings, stations or customer data.
        const moduleCode = GAMING_ACTIVITY_REFERENCE_MODULE_CODES[field.source];
        const capabilities = await resolveEnterpriseModuleCapabilities({ userId: session.userId, organizationId, moduleCode });
        if (!capabilities.canRead) {
          return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_REFERENCE_FORBIDDEN", message: "Vous n'êtes pas autorisé à consulter cet élément métier. Demandez les droits nécessaires au responsable." }, { status: 403 });
        }
        let valid = false;
        if (gamingLounge) {
          if (field.source === "gamingStations") valid = Boolean(await prisma.enterpriseGamingStationProfile.findFirst({ where: { id: value, organizationId, archivedAt: null }, select: { id: true } }));
          if (field.source === "gamingBookings") valid = Boolean(await prisma.enterpriseGamingBooking.findFirst({ where: { id: value, organizationId, archivedAt: null }, select: { id: true } }));
          if (field.source === "gamingSessions") valid = Boolean(await prisma.enterpriseGamingSession.findFirst({ where: { id: value, organizationId, archivedAt: null }, select: { id: true } }));
          if (field.source === "gamingCloses") valid = Boolean(await prisma.enterpriseGamingDailyClose.findFirst({ where: { id: value, organizationId }, select: { id: true } }));
          if (field.source === "businessParties") valid = Boolean(await prisma.enterpriseBusinessParty.findFirst({ where: { id: value, organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } }, select: { id: true } }));
        }
        if (!valid) return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_REFERENCE_INVALID", message: `La référence choisie pour « ${field.label} » est introuvable ou n'appartient pas à cette entreprise.` }, { status: 400 });
      }
    }
    if (Object.keys(data.metadata).some((key) => !names.has(key))) {
      return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_FIELDS_INVALID", message: "Un champ n'est pas reconnu pour cette action. Rechargez le formulaire et réessayez." }, { status: 400 });
    }
  }
  if (data.departmentId) {
    const department = await prisma.enterpriseDepartment.findFirst({
      where: { id: data.departmentId, organizationId, isActive: true },
      select: { id: true, responsibleUserId: true },
    });
    if (!department?.responsibleUserId) {
      return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_APPROVER_DEPARTMENT_MISSING", message: "Ce département n'a pas de responsable actif désigné pour traiter la validation." }, { status: 400 });
    }
    const manager = await prisma.organizationMember.findFirst({
      where: { organizationId, userId: department.responsibleUserId, status: "ACTIVE", removedAt: null },
      select: { userId: true },
    });
    const mandate = manager ? await resolveEnterpriseModuleCapabilities({ organizationId, userId: manager.userId, moduleCode: "INTERNAL_REQUESTS" }) : null;
    if (!mandate?.canApprove) {
      return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_APPROVER_NOT_AUTHORIZED", message: "Le responsable du département ne possède pas les droits de validation des demandes internes." }, { status: 400 });
    }
    if (manager?.userId === session.userId) {
      return NextResponse.json({ error: "ENTERPRISE_ACTIVITY_SELF_APPROVAL", message: "Choisissez un département dont le responsable est différent du demandeur." }, { status: 400 });
    }
  }
  if (data.assignedToUserId) {
    const assignee = await prisma.organizationMember.findFirst({
      where: { organizationId, userId: data.assignedToUserId, status: "ACTIVE", removedAt: null },
      select: { userId: true },
    });
    if (!assignee) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid assignee", message: "Le destinataire doit être collaborateur actif de cette entreprise." }, { status: 400 });
    }
  }

  const requestRecord = await prisma.$transaction(async (tx) => {
    const activityRequest = await tx.enterpriseActivityRequest.create({
      data: {
        organizationId,
        blockId: block.id,
        blockCode: block.blockCode,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: "SUBMITTED",
        targetModuleCode: block.targetModuleCode,
        assignedToUserId: data.assignedToUserId || null,
        createdById: session.userId,
        metadataJson: { membershipRole: membership.role, ...data.metadata },
      },
    });
    await createEnterpriseRequestInTransaction(tx, organizationId, session.userId, {
      requestType: block.blockCode,
      title: data.title,
      description: data.description,
      priority: data.priority,
      assignedToUserId: data.assignedToUserId || undefined,
      departmentId: data.departmentId || undefined,
      sourceModule: "ENTERPRISE_ACTIVITIES",
      sourceEntityType: "EnterpriseActivityRequest",
      sourceEntityId: activityRequest.id,
      initialStatus: "SUBMITTED",
    });
    return activityRequest;
  });

  const adminMembers = data.assignedToUserId
    ? [{ userId: data.assignedToUserId }]
    : await prisma.organizationMember.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          removedAt: null,
          role: { in: ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"] },
          userId: { not: session.userId },
        },
        select: { userId: true },
        take: 20,
      });
  if (adminMembers.length) {
    await prisma.notification
      .createMany({
        data: adminMembers.map((member) => ({
          userId: member.userId,
          organizationId,
          title: "Nouvelle demande entreprise",
          body: data.title,
          type: "ENTERPRISE_ACTIVITY",
          targetUrl: "/enterprise-activities",
        })),
        skipDuplicates: true,
      })
      .catch(() => null);
  }

  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_ACTIVITY_REQUEST_CREATED",
    entity: "EnterpriseActivityRequest",
    entityId: requestRecord.id,
    request: req,
    metadata: { organizationId, blockCode: block.blockCode, enterpriseRequestSource: true },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, request: requestRecord }, { status: 201 });
}
