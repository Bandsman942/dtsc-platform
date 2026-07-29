import { Prisma } from "@prisma/client";
import {
  APPROVAL_TARGET_TYPES,
  ENTERPRISE_CORE_V2_ENTITY_TYPES,
  ENTERPRISE_CORE_V2_MODULES,
  MEETING_TRANSITIONS,
  REQUEST_TRANSITIONS,
  SUPPORTED_SOURCE_ENTITY_TYPES,
  TASK_TRANSITIONS,
} from "@/lib/enterprise/core-v2/constants";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { prisma } from "@/lib/prisma";

type TransactionClient = Prisma.TransactionClient;

type SourceReference = {
  sourceModule?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
};

export type CreateEnterpriseTaskInput = SourceReference & {
  taskType?: string;
  title: string;
  description?: string | null;
  priority?: string;
  assignedToUserId?: string | null;
  departmentId?: string | null;
  startAt?: Date | null;
  dueAt?: Date | null;
  parentTaskId?: string | null;
};

export type CreateEnterpriseRequestInput = SourceReference & {
  requestType: string;
  title: string;
  description: string;
  priority?: string;
  assignedToUserId?: string | null;
  departmentId?: string | null;
  dueAt?: Date | null;
  initialStatus?: "DRAFT" | "SUBMITTED";
};

export type CreateEnterpriseMeetingInput = SourceReference & {
  title: string;
  agenda?: string | null;
  startAt: Date;
  endAt: Date;
  locationMode: string;
  physicalLocation?: string | null;
  meetingLink?: string | null;
  departmentId?: string | null;
  participants?: Array<{ userId: string; role?: string; responseStatus?: string }>;
};

function nullable(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

async function requireActiveMember(tx: TransactionClient, organizationId: string, userId: string) {
  const member = await tx.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE", removedAt: null },
    select: { userId: true },
  });
  if (!member) {
    throw new EnterpriseCoreV2Error("Le collaborateur sélectionné n’est pas un membre actif de cette entreprise.", 400, "INVALID_ENTERPRISE_MEMBER");
  }
}

async function requireActiveMembers(tx: TransactionClient, organizationId: string, userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  const members = await tx.organizationMember.findMany({
    where: { organizationId, userId: { in: uniqueIds }, status: "ACTIVE", removedAt: null },
    select: { userId: true },
  });
  if (members.length !== uniqueIds.length) {
    throw new EnterpriseCoreV2Error("Tous les participants et responsables doivent être membres actifs de cette entreprise.", 400, "INVALID_ENTERPRISE_MEMBERS");
  }
}

async function requireDepartment(tx: TransactionClient, organizationId: string, departmentId: string | null | undefined) {
  const normalizedDepartmentId = nullable(departmentId);
  if (!normalizedDepartmentId) return;
  const department = await tx.enterpriseDepartment.findFirst({
    where: { id: normalizedDepartmentId, organizationId, isActive: true },
    select: { id: true },
  });
  if (!department) {
    throw new EnterpriseCoreV2Error("Le département sélectionné n’appartient pas à cette entreprise ou n’est plus actif.", 400, "INVALID_ENTERPRISE_DEPARTMENT");
  }
}

async function sourceEntityExists(tx: TransactionClient, organizationId: string, entityType: string, entityId: string) {
  if (entityType === "EnterpriseTask") return Boolean(await tx.enterpriseTask.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseRequest") return Boolean(await tx.enterpriseRequest.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseMeeting") return Boolean(await tx.enterpriseMeeting.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseMeetingDecision") return Boolean(await tx.enterpriseMeetingDecision.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "EnterpriseActivityRequest") return Boolean(await tx.enterpriseActivityRequest.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "PharmacyActivityItem") return Boolean(await tx.pharmacyActivityItem.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "PharmacyQualityIncident") return Boolean(await tx.pharmacyQualityIncident.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "HealthPatient") return Boolean(await tx.healthPatient.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "HealthAppointment") return Boolean(await tx.healthAppointment.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  if (entityType === "HealthConsultation") return Boolean(await tx.healthConsultation.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  return false;
}

async function requireSourceReference(tx: TransactionClient, organizationId: string, source: SourceReference) {
  const sourceModule = nullable(source.sourceModule);
  const sourceEntityType = nullable(source.sourceEntityType);
  const sourceEntityId = nullable(source.sourceEntityId);
  const supplied = [sourceModule, sourceEntityType, sourceEntityId].filter(Boolean).length;
  if (supplied === 0) return null;
  if (supplied !== 3 || !sourceModule || !sourceEntityType || !sourceEntityId) {
    throw new EnterpriseCoreV2Error("La référence source doit préciser le module, le type et l’identifiant.", 400, "INCOMPLETE_SOURCE_REFERENCE");
  }
  if (!SUPPORTED_SOURCE_ENTITY_TYPES.has(sourceEntityType)) {
    throw new EnterpriseCoreV2Error("Ce type de source n’est pas autorisé pour le socle ERP.", 400, "UNSUPPORTED_SOURCE_ENTITY");
  }
  if (!(await sourceEntityExists(tx, organizationId, sourceEntityType, sourceEntityId))) {
    throw new EnterpriseCoreV2Error("L’objet source est introuvable dans cette entreprise.", 400, "CROSS_TENANT_SOURCE_DENIED");
  }
  return { sourceModule, sourceEntityType, sourceEntityId };
}

async function createEntityLink(
  tx: TransactionClient,
  data: {
    organizationId: string;
    sourceModule: string;
    sourceEntityType: string;
    sourceEntityId: string;
    targetModule: string;
    targetEntityType: string;
    targetEntityId: string;
    linkType: string;
    createdById: string;
    label?: string | null;
  }
) {
  try {
    await tx.enterpriseEntityLink.create({ data: { ...data, label: nullable(data.label) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

async function addEvent(
  tx: TransactionClient,
  data: {
    organizationId: string;
    entityType: string;
    entityId: string;
    eventType: string;
    summary: string;
    actorUserId: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  await tx.enterpriseOperationalEvent.create({
    data: {
      organizationId: data.organizationId,
      entityType: data.entityType,
      entityId: data.entityId,
      eventType: data.eventType,
      summary: data.summary,
      actorUserId: data.actorUserId,
      fromStatus: nullable(data.fromStatus),
      toStatus: nullable(data.toStatus),
      metadataJson: data.metadata,
    },
  });
}

export async function createEnterpriseTaskInTransaction(
  tx: TransactionClient,
  organizationId: string,
  actorUserId: string,
  input: CreateEnterpriseTaskInput
) {
  await requireActiveMember(tx, organizationId, actorUserId);
  if (input.assignedToUserId) await requireActiveMember(tx, organizationId, input.assignedToUserId);
  await requireDepartment(tx, organizationId, input.departmentId);
  const source = await requireSourceReference(tx, organizationId, input);
  const parentTaskId = nullable(input.parentTaskId);
  if (parentTaskId) {
    const parent = await tx.enterpriseTask.findFirst({ where: { id: parentTaskId, organizationId, archivedAt: null }, select: { id: true } });
    if (!parent) throw new EnterpriseCoreV2Error("La tâche parente est introuvable dans cette entreprise.", 400, "INVALID_PARENT_TASK");
  }
  const task = await tx.enterpriseTask.create({
    data: {
      organizationId,
      taskType: input.taskType || "TASK",
      title: input.title,
      description: nullable(input.description),
      status: "TODO",
      priority: input.priority || "NORMAL",
      createdByUserId: actorUserId,
      assignedToUserId: nullable(input.assignedToUserId),
      departmentId: nullable(input.departmentId),
      startAt: input.startAt || null,
      dueAt: input.dueAt || null,
      sourceModule: source?.sourceModule || null,
      sourceEntityType: source?.sourceEntityType || null,
      sourceEntityId: source?.sourceEntityId || null,
      parentTaskId,
    },
  });
  await addEvent(tx, {
    organizationId,
    entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.TASK,
    entityId: task.id,
    eventType: "ENTERPRISE_TASK_CREATED",
    summary: "Tâche créée.",
    actorUserId,
    toStatus: task.status,
  });
  if (source) {
    await createEntityLink(tx, {
      organizationId,
      sourceModule: source.sourceModule,
      sourceEntityType: source.sourceEntityType,
      sourceEntityId: source.sourceEntityId,
      targetModule: ENTERPRISE_CORE_V2_MODULES.TASK,
      targetEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.TASK,
      targetEntityId: task.id,
      linkType: "GENERATED",
      createdById: actorUserId,
    });
  }
  if (parentTaskId) {
    await createEntityLink(tx, {
      organizationId,
      sourceModule: ENTERPRISE_CORE_V2_MODULES.TASK,
      sourceEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.TASK,
      sourceEntityId: parentTaskId,
      targetModule: ENTERPRISE_CORE_V2_MODULES.TASK,
      targetEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.TASK,
      targetEntityId: task.id,
      linkType: "PARENT_OF",
      createdById: actorUserId,
    });
  }
  return task;
}

export async function createEnterpriseTask(organizationId: string, actorUserId: string, input: CreateEnterpriseTaskInput) {
  return prisma.$transaction((tx) => createEnterpriseTaskInTransaction(tx, organizationId, actorUserId, input));
}

export async function createEnterpriseRequestInTransaction(
  tx: TransactionClient,
  organizationId: string,
  actorUserId: string,
  input: CreateEnterpriseRequestInput
) {
  await requireActiveMember(tx, organizationId, actorUserId);
  if (input.assignedToUserId) await requireActiveMember(tx, organizationId, input.assignedToUserId);
  await requireDepartment(tx, organizationId, input.departmentId);
  const source = await requireSourceReference(tx, organizationId, input);
  const initialStatus = input.initialStatus === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
  const request = await tx.enterpriseRequest.create({
    data: {
      organizationId,
      requestType: input.requestType,
      title: input.title,
      description: input.description,
      priority: input.priority || "NORMAL",
      status: initialStatus,
      requestedByUserId: actorUserId,
      assignedToUserId: nullable(input.assignedToUserId),
      departmentId: nullable(input.departmentId),
      dueAt: input.dueAt || null,
      sourceModule: source?.sourceModule || null,
      sourceEntityType: source?.sourceEntityType || null,
      sourceEntityId: source?.sourceEntityId || null,
    },
  });
  await addEvent(tx, {
    organizationId,
    entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.REQUEST,
    entityId: request.id,
    eventType: initialStatus === "SUBMITTED" ? "ENTERPRISE_REQUEST_SUBMITTED" : "ENTERPRISE_REQUEST_CREATED",
    summary: initialStatus === "SUBMITTED" ? "Demande créée et soumise." : "Demande créée en brouillon.",
    actorUserId,
    toStatus: request.status,
  });
  if (source) {
    await createEntityLink(tx, {
      organizationId,
      sourceModule: source.sourceModule,
      sourceEntityType: source.sourceEntityType,
      sourceEntityId: source.sourceEntityId,
      targetModule: ENTERPRISE_CORE_V2_MODULES.REQUEST,
      targetEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.REQUEST,
      targetEntityId: request.id,
      linkType: "GENERATED",
      createdById: actorUserId,
    });
  }
  return request;
}

export async function createEnterpriseRequest(organizationId: string, actorUserId: string, input: CreateEnterpriseRequestInput) {
  return prisma.$transaction((tx) => createEnterpriseRequestInTransaction(tx, organizationId, actorUserId, input));
}

async function requireApprovalTarget(tx: TransactionClient, organizationId: string, targetEntityType: string, targetEntityId: string) {
  if (!(APPROVAL_TARGET_TYPES as readonly string[]).includes(targetEntityType)) {
    throw new EnterpriseCoreV2Error("Ce type d’objet ne peut pas recevoir une validation Sprint 6.", 400, "INVALID_APPROVAL_TARGET_TYPE");
  }
  if (targetEntityType === "EnterpriseRequest") {
    const request = await tx.enterpriseRequest.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null }, select: { id: true, status: true } });
    if (!request) throw new EnterpriseCoreV2Error("La demande ciblée est introuvable dans cette entreprise.", 400, "INVALID_APPROVAL_TARGET");
    if (request.status !== "SUBMITTED" && request.status !== "IN_REVIEW") {
      throw new EnterpriseCoreV2Error("Une demande doit être soumise ou en revue avant de demander une validation.", 409, "INVALID_REQUEST_APPROVAL_STATE");
    }
    return { moduleCode: ENTERPRISE_CORE_V2_MODULES.REQUEST, status: request.status };
  }
  if (targetEntityType === "EnterpriseTask") {
    const task = await tx.enterpriseTask.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null }, select: { id: true, status: true } });
    if (!task) throw new EnterpriseCoreV2Error("La tâche ciblée est introuvable dans cette entreprise.", 400, "INVALID_APPROVAL_TARGET");
    return { moduleCode: ENTERPRISE_CORE_V2_MODULES.TASK, status: task.status };
  }
  if (targetEntityType === "EnterpriseMeeting") {
    const meeting = await tx.enterpriseMeeting.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null }, select: { id: true, status: true } });
    if (!meeting) throw new EnterpriseCoreV2Error("La réunion ciblée est introuvable dans cette entreprise.", 400, "INVALID_APPROVAL_TARGET");
    return { moduleCode: ENTERPRISE_CORE_V2_MODULES.MEETING, status: meeting.status };
  }
  const incident = await tx.pharmacyQualityIncident.findFirst({ where: { id: targetEntityId, organizationId }, select: { id: true, status: true } });
  if (!incident) throw new EnterpriseCoreV2Error("L’incident pharmacie ciblé est introuvable dans cette entreprise.", 400, "INVALID_APPROVAL_TARGET");
  return { moduleCode: "QUALITY_PHARMACOVIGILANCE", status: incident.status };
}

export async function createEnterpriseApproval({
  organizationId,
  actorUserId,
  targetEntityType,
  targetEntityId,
  approverUserId,
}: {
  organizationId: string;
  actorUserId: string;
  targetEntityType: string;
  targetEntityId: string;
  approverUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await requireActiveMembers(tx, organizationId, [actorUserId, approverUserId]);
    if (actorUserId === approverUserId) {
      throw new EnterpriseCoreV2Error("Le demandeur d’une validation ne peut pas être son propre approbateur.", 400, "SELF_APPROVAL_DENIED");
    }
    const target = await requireApprovalTarget(tx, organizationId, targetEntityType, targetEntityId);
    const existing = await tx.enterpriseApproval.findFirst({
      where: { organizationId, targetEntityType, targetEntityId, approverUserId, status: "PENDING", archivedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new EnterpriseCoreV2Error("Une validation en attente existe déjà pour cet approbateur et cet objet.", 409, "PENDING_APPROVAL_EXISTS");
    }
    const approval = await tx.enterpriseApproval.create({
      data: { organizationId, targetEntityType, targetEntityId, requestedByUserId: actorUserId, approverUserId, status: "PENDING" },
    });
    if (targetEntityType === "EnterpriseRequest" && target.status === "SUBMITTED") {
      const promoted = await tx.enterpriseRequest.updateMany({
        where: { id: targetEntityId, organizationId, status: "SUBMITTED", archivedAt: null },
        data: { status: "IN_REVIEW", revision: { increment: 1 } },
      });
      if (promoted.count !== 1) throw new EnterpriseCoreV2Error("La demande a changé pendant la création de validation.", 409, "CONCURRENT_REQUEST_UPDATE");
      await addEvent(tx, {
        organizationId,
        entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.REQUEST,
        entityId: targetEntityId,
        eventType: "ENTERPRISE_REQUEST_REVIEW_STARTED",
        summary: "La demande est passée en revue pour validation.",
        actorUserId,
        fromStatus: "SUBMITTED",
        toStatus: "IN_REVIEW",
      });
    }
    await addEvent(tx, {
      organizationId,
      entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.APPROVAL,
      entityId: approval.id,
      eventType: "ENTERPRISE_APPROVAL_REQUESTED",
      summary: "Validation demandée.",
      actorUserId,
      toStatus: approval.status,
      metadata: { targetEntityType, targetEntityId },
    });
    await createEntityLink(tx, {
      organizationId,
      sourceModule: target.moduleCode,
      sourceEntityType: targetEntityType,
      sourceEntityId: targetEntityId,
      targetModule: ENTERPRISE_CORE_V2_MODULES.APPROVAL,
      targetEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.APPROVAL,
      targetEntityId: approval.id,
      linkType: "REQUIRES_APPROVAL",
      createdById: actorUserId,
    });
    return approval;
  });
}

export async function createEnterpriseMeetingInTransaction(
  tx: TransactionClient,
  organizationId: string,
  actorUserId: string,
  input: CreateEnterpriseMeetingInput
) {
  await requireActiveMember(tx, organizationId, actorUserId);
  await requireDepartment(tx, organizationId, input.departmentId);
  const participants = input.participants || [];
  if (new Set(participants.map((participant) => participant.userId)).size !== participants.length) {
    throw new EnterpriseCoreV2Error("Un participant ne peut être ajouté qu’une seule fois à la réunion.", 400, "DUPLICATE_MEETING_PARTICIPANT");
  }
  await requireActiveMembers(tx, organizationId, participants.map((participant) => participant.userId));
  const source = await requireSourceReference(tx, organizationId, input);
  const meeting = await tx.enterpriseMeeting.create({
    data: {
      organizationId,
      title: input.title,
      agenda: nullable(input.agenda),
      organizerUserId: actorUserId,
      startAt: input.startAt,
      endAt: input.endAt,
      status: "SCHEDULED",
      locationMode: input.locationMode,
      physicalLocation: nullable(input.physicalLocation),
      meetingLink: nullable(input.meetingLink),
      departmentId: nullable(input.departmentId),
      sourceModule: source?.sourceModule || null,
      sourceEntityType: source?.sourceEntityType || null,
      sourceEntityId: source?.sourceEntityId || null,
      participants: participants.length
        ? {
            create: participants.map((participant) => ({
              organizationId,
              userId: participant.userId,
              role: participant.role || "PARTICIPANT",
              responseStatus: participant.responseStatus || "INVITED",
            })),
          }
        : undefined,
    },
    include: { participants: true, decisions: true },
  });
  await addEvent(tx, {
    organizationId,
    entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.MEETING,
    entityId: meeting.id,
    eventType: "ENTERPRISE_MEETING_CREATED",
    summary: "Réunion planifiée.",
    actorUserId,
    toStatus: meeting.status,
  });
  if (source) {
    await createEntityLink(tx, {
      organizationId,
      sourceModule: source.sourceModule,
      sourceEntityType: source.sourceEntityType,
      sourceEntityId: source.sourceEntityId,
      targetModule: ENTERPRISE_CORE_V2_MODULES.MEETING,
      targetEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.MEETING,
      targetEntityId: meeting.id,
      linkType: "GENERATED",
      createdById: actorUserId,
    });
  }
  return meeting;
}

export async function createEnterpriseMeeting(organizationId: string, actorUserId: string, input: CreateEnterpriseMeetingInput) {
  return prisma.$transaction((tx) => createEnterpriseMeetingInTransaction(tx, organizationId, actorUserId, input));
}

export async function transitionEnterpriseTask({
  organizationId,
  taskId,
  actorUserId,
  action,
  revision,
  comment,
}: {
  organizationId: string;
  taskId: string;
  actorUserId: string;
  action: keyof typeof TASK_TRANSITIONS;
  revision: number;
  comment?: string | null;
}) {
  const transition = TASK_TRANSITIONS[action];
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseTask.findFirst({ where: { id: taskId, organizationId, archivedAt: null }, select: { id: true, status: true, revision: true } });
    if (!existing) throw new EnterpriseCoreV2Error("Tâche introuvable.", 404, "TASK_NOT_FOUND");
    if (!transition.from.includes(existing.status as never)) throw new EnterpriseCoreV2Error("Cette transition n’est pas autorisée pour l’état actuel de la tâche.", 409, "INVALID_TASK_TRANSITION");
    const updated = await tx.enterpriseTask.updateMany({
      where: { id: taskId, organizationId, status: existing.status, revision, archivedAt: null },
      data: {
        ...(transition.to ? { status: transition.to } : {}),
        ...(action === "START" ? { startAt: new Date() } : {}),
        ...(action === "COMPLETE" ? { completedAt: new Date() } : {}),
        ...(action === "ARCHIVE" ? { archivedAt: new Date() } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La tâche a été modifiée par un autre utilisateur. Actualisez avant de réessayer.", 409, "REVISION_CONFLICT");
    const saved = await tx.enterpriseTask.findUnique({ where: { id: taskId } });
    await addEvent(tx, {
      organizationId,
      entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.TASK,
      entityId: taskId,
      eventType: `ENTERPRISE_TASK_${action === "COMPLETE" ? "COMPLETED" : action === "START" ? "STARTED" : action === "BLOCK" ? "BLOCKED" : action === "RESUME" ? "RESUMED" : action}`,
      summary: nullable(comment) || `Action ${action} appliquée à la tâche.`,
      actorUserId,
      fromStatus: existing.status,
      toStatus: transition.to || existing.status,
    });
    return saved;
  });
}

export async function transitionEnterpriseRequest({
  organizationId,
  requestId,
  actorUserId,
  action,
  revision,
  comment,
}: {
  organizationId: string;
  requestId: string;
  actorUserId: string;
  action: keyof typeof REQUEST_TRANSITIONS;
  revision: number;
  comment?: string | null;
}) {
  const transition = REQUEST_TRANSITIONS[action];
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRequest.findFirst({ where: { id: requestId, organizationId, archivedAt: null }, select: { id: true, status: true } });
    if (!existing) throw new EnterpriseCoreV2Error("Demande introuvable.", 404, "REQUEST_NOT_FOUND");
    if (!transition.from.includes(existing.status as never)) throw new EnterpriseCoreV2Error("Cette transition n’est pas autorisée pour l’état actuel de la demande.", 409, "INVALID_REQUEST_TRANSITION");
    if (action === "FULFILL") {
      const approvalSummary = await tx.enterpriseApproval.groupBy({
        by: ["status"],
        where: { organizationId, targetEntityType: "EnterpriseRequest", targetEntityId: requestId, archivedAt: null },
        _count: { _all: true },
      });
      const approvalCounts = new Map(approvalSummary.map((entry) => [entry.status, entry._count._all]));
      if ((approvalCounts.get("PENDING") || 0) > 0) throw new EnterpriseCoreV2Error("La demande possède encore une validation en attente.", 409, "PENDING_APPROVAL_BLOCKS_FULFILLMENT");
      const decidedCount = (approvalCounts.get("APPROVED") || 0) + (approvalCounts.get("REJECTED") || 0);
      if (decidedCount > 0 && (approvalCounts.get("APPROVED") || 0) === 0) throw new EnterpriseCoreV2Error("Une demande rejetée ne peut pas être marquée comme traitée.", 409, "REJECTED_REQUEST_CANNOT_BE_FULFILLED");
    }
    const updated = await tx.enterpriseRequest.updateMany({
      where: { id: requestId, organizationId, status: existing.status, revision, archivedAt: null },
      data: {
        ...(transition.to ? { status: transition.to } : {}),
        ...(action === "FULFILL" ? { closedAt: new Date() } : {}),
        ...(action === "CANCEL" ? { closedAt: new Date() } : {}),
        ...(action === "ARCHIVE" ? { archivedAt: new Date() } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La demande a été modifiée par un autre utilisateur. Actualisez avant de réessayer.", 409, "REVISION_CONFLICT");
    const saved = await tx.enterpriseRequest.findUnique({ where: { id: requestId } });
    const eventType = action === "SUBMIT" ? "ENTERPRISE_REQUEST_SUBMITTED" : action === "TAKE" ? "ENTERPRISE_REQUEST_REVIEW_STARTED" : action === "FULFILL" ? "ENTERPRISE_REQUEST_FULFILLED" : action === "CANCEL" ? "ENTERPRISE_REQUEST_CANCELLED" : "ENTERPRISE_REQUEST_ARCHIVED";
    await addEvent(tx, {
      organizationId,
      entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.REQUEST,
      entityId: requestId,
      eventType,
      summary: nullable(comment) || `Action ${action} appliquée à la demande.`,
      actorUserId,
      fromStatus: existing.status,
      toStatus: transition.to || existing.status,
    });
    return saved;
  });
}

export async function decideEnterpriseApproval({
  organizationId,
  approvalId,
  actorUserId,
  action,
  revision,
  decisionComment,
  canManage,
}: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  action: "APPROVE" | "REJECT" | "CANCEL";
  revision: number;
  decisionComment?: string | null;
  canManage: boolean;
}) {
  if (action === "REJECT" && !nullable(decisionComment)) throw new EnterpriseCoreV2Error("Un motif est obligatoire pour rejeter une validation.", 400, "REJECTION_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const approval = await tx.enterpriseApproval.findFirst({ where: { id: approvalId, organizationId, archivedAt: null } });
    if (!approval) throw new EnterpriseCoreV2Error("Validation introuvable.", 404, "APPROVAL_NOT_FOUND");
    if (approval.status !== "PENDING") throw new EnterpriseCoreV2Error("Cette validation a déjà été décidée.", 409, "APPROVAL_ALREADY_DECIDED");
    if (action === "APPROVE" || action === "REJECT") {
      if (approval.approverUserId !== actorUserId) throw new EnterpriseCoreV2Error("Seul l’approbateur désigné peut prendre cette décision.", 403, "WRONG_APPROVER");
      if (approval.requestedByUserId === actorUserId) throw new EnterpriseCoreV2Error("L’auto-approbation est interdite.", 403, "SELF_APPROVAL_DENIED");
    } else if (approval.requestedByUserId !== actorUserId && !canManage) {
      throw new EnterpriseCoreV2Error("Seul le demandeur de validation ou un responsable peut l’annuler.", 403, "APPROVAL_CANCEL_DENIED");
    }
    const nextStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
    const updated = await tx.enterpriseApproval.updateMany({
      where: { id: approvalId, organizationId, status: "PENDING", revision, archivedAt: null },
      data: { status: nextStatus, decidedAt: action === "CANCEL" ? null : new Date(), decisionComment: nullable(decisionComment), revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La validation a été décidée ou modifiée simultanément. Actualisez la file.", 409, "APPROVAL_DECISION_CONFLICT");
    if (approval.targetEntityType === "EnterpriseRequest" && action !== "CANCEL") {
      const targetStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
      const requestUpdated = await tx.enterpriseRequest.updateMany({
        where: { id: approval.targetEntityId, organizationId, status: { in: ["SUBMITTED", "IN_REVIEW"] }, archivedAt: null },
        data: { status: targetStatus, revision: { increment: 1 }, ...(targetStatus === "REJECTED" ? { closedAt: new Date() } : {}) },
      });
      if (requestUpdated.count !== 1) throw new EnterpriseCoreV2Error("La demande cible a changé pendant la décision. La décision est annulée.", 409, "APPROVAL_TARGET_CONFLICT");
      await addEvent(tx, {
        organizationId,
        entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.REQUEST,
        entityId: approval.targetEntityId,
        eventType: action === "APPROVE" ? "ENTERPRISE_REQUEST_APPROVED" : "ENTERPRISE_REQUEST_REJECTED",
        summary: action === "APPROVE" ? "La validation liée a été approuvée." : nullable(decisionComment) || "La validation liée a été rejetée.",
        actorUserId,
        toStatus: targetStatus,
      });
    }
    await addEvent(tx, {
      organizationId,
      entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.APPROVAL,
      entityId: approvalId,
      eventType: action === "APPROVE" ? "ENTERPRISE_APPROVAL_APPROVED" : action === "REJECT" ? "ENTERPRISE_APPROVAL_REJECTED" : "ENTERPRISE_APPROVAL_CANCELLED",
      summary: nullable(decisionComment) || (action === "APPROVE" ? "Validation approuvée." : action === "REJECT" ? "Validation rejetée." : "Validation annulée."),
      actorUserId,
      fromStatus: approval.status,
      toStatus: nextStatus,
    });
    return tx.enterpriseApproval.findUnique({ where: { id: approvalId } });
  });
}

export async function transitionEnterpriseMeeting({
  organizationId,
  meetingId,
  actorUserId,
  action,
  revision,
  comment,
}: {
  organizationId: string;
  meetingId: string;
  actorUserId: string;
  action: keyof typeof MEETING_TRANSITIONS;
  revision: number;
  comment?: string | null;
}) {
  const transition = MEETING_TRANSITIONS[action];
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseMeeting.findFirst({ where: { id: meetingId, organizationId, archivedAt: null }, select: { id: true, status: true } });
    if (!existing) throw new EnterpriseCoreV2Error("Réunion introuvable.", 404, "MEETING_NOT_FOUND");
    if (!transition.from.includes(existing.status as never)) throw new EnterpriseCoreV2Error("Cette transition n’est pas autorisée pour l’état actuel de la réunion.", 409, "INVALID_MEETING_TRANSITION");
    const updated = await tx.enterpriseMeeting.updateMany({
      where: { id: meetingId, organizationId, status: existing.status, revision, archivedAt: null },
      data: {
        ...(transition.to ? { status: transition.to } : {}),
        ...(action === "COMPLETE" ? { completedAt: new Date() } : {}),
        ...(action === "CANCEL" ? { cancelledAt: new Date() } : {}),
        ...(action === "ARCHIVE" ? { archivedAt: new Date() } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La réunion a été modifiée par un autre utilisateur. Actualisez avant de réessayer.", 409, "REVISION_CONFLICT");
    const saved = await tx.enterpriseMeeting.findUnique({ where: { id: meetingId }, include: { participants: true, decisions: true } });
    await addEvent(tx, {
      organizationId,
      entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.MEETING,
      entityId: meetingId,
      eventType: action === "COMPLETE" ? "ENTERPRISE_MEETING_COMPLETED" : action === "CANCEL" ? "ENTERPRISE_MEETING_CANCELLED" : action === "START" ? "ENTERPRISE_MEETING_STARTED" : "ENTERPRISE_MEETING_ARCHIVED",
      summary: nullable(comment) || `Action ${action} appliquée à la réunion.`,
      actorUserId,
      fromStatus: existing.status,
      toStatus: transition.to || existing.status,
    });
    return saved;
  });
}

export async function updateEnterpriseTask({
  organizationId,
  taskId,
  actorUserId,
  revision,
  data,
}: {
  organizationId: string;
  taskId: string;
  actorUserId: string;
  revision: number;
  data: { title?: string; description?: string | null; priority?: string; assignedToUserId?: string | null; departmentId?: string | null; startAt?: Date | null; dueAt?: Date | null };
}) {
  return prisma.$transaction(async (tx) => {
    if (data.assignedToUserId) await requireActiveMember(tx, organizationId, data.assignedToUserId);
    if (data.departmentId) await requireDepartment(tx, organizationId, data.departmentId);
    const updated = await tx.enterpriseTask.updateMany({
      where: { id: taskId, organizationId, revision, archivedAt: null, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: nullable(data.description) } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.assignedToUserId !== undefined ? { assignedToUserId: nullable(data.assignedToUserId) } : {}),
        ...(data.departmentId !== undefined ? { departmentId: nullable(data.departmentId) } : {}),
        ...(data.startAt !== undefined ? { startAt: data.startAt } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La tâche a changé ou ne peut plus être modifiée. Actualisez la page.", 409, "REVISION_CONFLICT");
    await addEvent(tx, { organizationId, entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.TASK, entityId: taskId, eventType: "ENTERPRISE_TASK_UPDATED", summary: "Tâche mise à jour.", actorUserId });
    return tx.enterpriseTask.findUnique({ where: { id: taskId } });
  });
}

export async function updateEnterpriseRequest({
  organizationId,
  requestId,
  actorUserId,
  revision,
  data,
}: {
  organizationId: string;
  requestId: string;
  actorUserId: string;
  revision: number;
  data: { requestType?: string; title?: string; description?: string; priority?: string; assignedToUserId?: string | null; departmentId?: string | null; dueAt?: Date | null };
}) {
  return prisma.$transaction(async (tx) => {
    if (data.assignedToUserId) await requireActiveMember(tx, organizationId, data.assignedToUserId);
    if (data.departmentId) await requireDepartment(tx, organizationId, data.departmentId);
    const updated = await tx.enterpriseRequest.updateMany({
      where: { id: requestId, organizationId, revision, archivedAt: null, status: { in: ["DRAFT", "SUBMITTED", "IN_REVIEW"] } },
      data: {
        ...(data.requestType !== undefined ? { requestType: data.requestType } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.assignedToUserId !== undefined ? { assignedToUserId: nullable(data.assignedToUserId) } : {}),
        ...(data.departmentId !== undefined ? { departmentId: nullable(data.departmentId) } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La demande a changé ou ne peut plus être modifiée. Actualisez la page.", 409, "REVISION_CONFLICT");
    await addEvent(tx, { organizationId, entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.REQUEST, entityId: requestId, eventType: "ENTERPRISE_REQUEST_UPDATED", summary: "Demande mise à jour.", actorUserId });
    return tx.enterpriseRequest.findUnique({ where: { id: requestId } });
  });
}

export async function updateEnterpriseMeeting({
  organizationId,
  meetingId,
  actorUserId,
  revision,
  data,
}: {
  organizationId: string;
  meetingId: string;
  actorUserId: string;
  revision: number;
  data: {
    title?: string;
    agenda?: string | null;
    startAt?: Date | null;
    endAt?: Date | null;
    locationMode?: string;
    physicalLocation?: string | null;
    meetingLink?: string | null;
    minutes?: string | null;
    departmentId?: string | null;
    participants?: Array<{ userId: string; role?: string; responseStatus?: string }>;
  };
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseMeeting.findFirst({ where: { id: meetingId, organizationId, revision, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("La réunion a changé ou est introuvable. Actualisez la page.", 409, "REVISION_CONFLICT");
    if (existing.status === "CANCELLED") throw new EnterpriseCoreV2Error("Une réunion annulée ne peut plus être modifiée.", 409, "MEETING_NOT_EDITABLE");
    if (data.departmentId) await requireDepartment(tx, organizationId, data.departmentId);
    if (data.participants) {
      if (new Set(data.participants.map((participant) => participant.userId)).size !== data.participants.length) throw new EnterpriseCoreV2Error("Un participant ne peut être ajouté qu’une seule fois.", 400, "DUPLICATE_MEETING_PARTICIPANT");
      await requireActiveMembers(tx, organizationId, data.participants.map((participant) => participant.userId));
    }
    const nextStartAt = data.startAt === undefined || data.startAt === null ? existing.startAt : data.startAt;
    const nextEndAt = data.endAt === undefined || data.endAt === null ? existing.endAt : data.endAt;
    if (nextEndAt <= nextStartAt) throw new EnterpriseCoreV2Error("La fin de réunion doit être postérieure au début.", 400, "INVALID_MEETING_RANGE");
    const nextLocationMode = data.locationMode || existing.locationMode;
    const nextPhysicalLocation = data.physicalLocation === undefined ? existing.physicalLocation : nullable(data.physicalLocation);
    const nextMeetingLink = data.meetingLink === undefined ? existing.meetingLink : nullable(data.meetingLink);
    if ((nextLocationMode === "PHYSICAL" || nextLocationMode === "HYBRID") && !nextPhysicalLocation) throw new EnterpriseCoreV2Error("Le lieu physique est obligatoire pour ce mode de réunion.", 400, "MEETING_LOCATION_REQUIRED");
    if ((nextLocationMode === "ONLINE" || nextLocationMode === "HYBRID") && !nextMeetingLink) throw new EnterpriseCoreV2Error("Le lien de réunion est obligatoire pour ce mode.", 400, "MEETING_LINK_REQUIRED");
    const updated = await tx.enterpriseMeeting.updateMany({
      where: { id: meetingId, organizationId, revision, archivedAt: null },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.agenda !== undefined ? { agenda: nullable(data.agenda) } : {}),
        ...(data.startAt !== undefined && data.startAt !== null ? { startAt: data.startAt } : {}),
        ...(data.endAt !== undefined && data.endAt !== null ? { endAt: data.endAt } : {}),
        ...(data.locationMode !== undefined ? { locationMode: data.locationMode } : {}),
        ...(data.physicalLocation !== undefined ? { physicalLocation: nullable(data.physicalLocation) } : {}),
        ...(data.meetingLink !== undefined ? { meetingLink: nullable(data.meetingLink) } : {}),
        ...(data.minutes !== undefined ? { minutes: nullable(data.minutes) } : {}),
        ...(data.departmentId !== undefined ? { departmentId: nullable(data.departmentId) } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La réunion a été modifiée simultanément. Actualisez la page.", 409, "REVISION_CONFLICT");
    if (data.participants) {
      await tx.enterpriseMeetingParticipant.deleteMany({ where: { meetingId, organizationId } });
      if (data.participants.length) {
        await tx.enterpriseMeetingParticipant.createMany({
          data: data.participants.map((participant) => ({
            organizationId,
            meetingId,
            userId: participant.userId,
            role: participant.role || "PARTICIPANT",
            responseStatus: participant.responseStatus || "INVITED",
          })),
        });
      }
    }
    await addEvent(tx, { organizationId, entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.MEETING, entityId: meetingId, eventType: "ENTERPRISE_MEETING_UPDATED", summary: "Réunion mise à jour.", actorUserId });
    return tx.enterpriseMeeting.findUnique({ where: { id: meetingId }, include: { participants: true, decisions: true } });
  });
}

export async function createEnterpriseMeetingDecision({
  organizationId,
  meetingId,
  actorUserId,
  title,
  description,
}: {
  organizationId: string;
  meetingId: string;
  actorUserId: string;
  title: string;
  description?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const meeting = await tx.enterpriseMeeting.findFirst({ where: { id: meetingId, organizationId, archivedAt: null }, select: { id: true, status: true } });
    if (!meeting) throw new EnterpriseCoreV2Error("Réunion introuvable.", 404, "MEETING_NOT_FOUND");
    if (meeting.status === "CANCELLED") throw new EnterpriseCoreV2Error("Une réunion annulée ne peut pas produire de décision.", 409, "CANCELLED_MEETING_DECISION_DENIED");
    const decision = await tx.enterpriseMeetingDecision.create({ data: { organizationId, meetingId, title, description: nullable(description), createdByUserId: actorUserId } });
    await createEntityLink(tx, {
      organizationId,
      sourceModule: ENTERPRISE_CORE_V2_MODULES.MEETING,
      sourceEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.MEETING,
      sourceEntityId: meetingId,
      targetModule: ENTERPRISE_CORE_V2_MODULES.MEETING,
      targetEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.MEETING_DECISION,
      targetEntityId: decision.id,
      linkType: "HAS_DECISION",
      createdById: actorUserId,
    });
    await addEvent(tx, {
      organizationId,
      entityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.MEETING,
      entityId: meetingId,
      eventType: "ENTERPRISE_MEETING_DECISION_CREATED",
      summary: `Décision enregistrée : ${title}`,
      actorUserId,
      metadata: { decisionId: decision.id },
    });
    return decision;
  });
}

export async function createTaskFromMeetingDecision({
  organizationId,
  meetingId,
  decisionId,
  actorUserId,
  input,
}: {
  organizationId: string;
  meetingId: string;
  decisionId: string;
  actorUserId: string;
  input: Omit<CreateEnterpriseTaskInput, "sourceModule" | "sourceEntityType" | "sourceEntityId">;
}) {
  return prisma.$transaction(async (tx) => {
    const decision = await tx.enterpriseMeetingDecision.findFirst({ where: { id: decisionId, meetingId, organizationId }, select: { id: true, title: true, description: true, taskId: true } });
    if (!decision) throw new EnterpriseCoreV2Error("Décision de réunion introuvable.", 404, "MEETING_DECISION_NOT_FOUND");
    if (decision.taskId) {
      const existingTask = await tx.enterpriseTask.findFirst({ where: { id: decision.taskId, organizationId }, select: { id: true } });
      if (existingTask) throw new EnterpriseCoreV2Error("Cette décision possède déjà une tâche liée.", 409, "DECISION_TASK_ALREADY_EXISTS");
    }
    const task = await createEnterpriseTaskInTransaction(tx, organizationId, actorUserId, {
      ...input,
      title: input.title || decision.title,
      description: input.description ?? decision.description,
      sourceModule: ENTERPRISE_CORE_V2_MODULES.MEETING,
      sourceEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.MEETING_DECISION,
      sourceEntityId: decision.id,
    });
    const linked = await tx.enterpriseMeetingDecision.updateMany({ where: { id: decisionId, organizationId, taskId: null }, data: { taskId: task.id } });
    if (linked.count !== 1) throw new EnterpriseCoreV2Error("Une autre tâche a été créée simultanément pour cette décision.", 409, "DECISION_TASK_CONFLICT");
    await createEntityLink(tx, {
      organizationId,
      sourceModule: ENTERPRISE_CORE_V2_MODULES.MEETING,
      sourceEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.MEETING_DECISION,
      sourceEntityId: decision.id,
      targetModule: ENTERPRISE_CORE_V2_MODULES.TASK,
      targetEntityType: ENTERPRISE_CORE_V2_ENTITY_TYPES.TASK,
      targetEntityId: task.id,
      linkType: "GENERATED_TASK",
      createdById: actorUserId,
    });
    return task;
  });
}

export async function addEnterpriseOperationalComment({
  organizationId,
  entityType,
  entityId,
  actorUserId,
  content,
}: {
  organizationId: string;
  entityType: "EnterpriseTask" | "EnterpriseRequest" | "EnterpriseApproval" | "EnterpriseMeeting";
  entityId: string;
  actorUserId: string;
  content: string;
}) {
  return prisma.$transaction(async (tx) => {
    if (!(await sourceEntityExists(tx, organizationId, entityType, entityId))) throw new EnterpriseCoreV2Error("Objet introuvable dans cette entreprise.", 404, "ENTITY_NOT_FOUND");
    const comment = await tx.enterpriseOperationalComment.create({ data: { organizationId, entityType, entityId, authorUserId: actorUserId, content } });
    await addEvent(tx, { organizationId, entityType, entityId, eventType: "COMMENT_ADDED", summary: "Commentaire ajouté.", actorUserId });
    return comment;
  });
}

export async function getEnterpriseOperationalTimeline({
  organizationId,
  entityType,
  entityId,
  commentTake = 20,
  eventTake = 30,
}: {
  organizationId: string;
  entityType: string;
  entityId: string;
  commentTake?: number;
  eventTake?: number;
}) {
  const [events, comments] = await Promise.all([
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType, entityId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(eventTake, 1), 50) }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType, entityId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(commentTake, 1), 50) }),
  ]);
  return { events, comments };
}
