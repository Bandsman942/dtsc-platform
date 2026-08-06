import { UserRole } from "@prisma/client";
import { normalizePositionCode } from "@/lib/business-roles";
import { DTSC_SPECIAL_PERMISSIONS, hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import { prisma } from "@/lib/prisma";

export const OPERATIONAL_OBJECT_TYPES = [
  "CALENDAR_EVENT",
  "TASK",
  "OPERATION",
  "DEPARTMENT_REQUEST",
  "BLOCKER",
  "MEETING",
  "COLLAB_REQUEST",
  "CEO_OBJECTIVE",
  "CEO_SUPERVISION",
  "SCO_PURCHASE_REQUEST",
  "SCO_LOGISTICS",
  "MPO_PROJECT",
  "MPO_RECORD",
  "CTO_PROJECT",
  "CTO_RECORD",
] as const;
export type OperationalObjectType = (typeof OPERATIONAL_OBJECT_TYPES)[number];

export type OperationalActor = {
  userId: string;
  role: UserRole;
  employeeId: string | null;
  positionCode: string | null;
  employeeName: string | null;
};

export async function getOperationalActor(user: { id: string; role: UserRole }): Promise<OperationalActor> {
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { userId: user.id, status: { not: "EXITED" } },
    include: { position: true },
  });
  return {
    userId: user.id,
    role: user.role,
    employeeId: employee?.id || null,
    positionCode: employee ? normalizePositionCode(employee.position?.code || employee.positionCode || employee.jobTitle) : null,
    employeeName: employee?.fullName || null,
  };
}

export async function resolveOperationalObjectAccess({
  actor,
  objectType,
  objectId,
  action = "read",
}: {
  actor: OperationalActor;
  objectType: OperationalObjectType;
  objectId: string;
  action?: "read" | "comment" | "checklist" | "status" | "delete";
}) {
  const isExecutiveReader = actor.role === UserRole.ADMIN || actor.positionCode === "CEO" || actor.positionCode === "COO";
  const isMutation = action === "checklist" || action === "status" || action === "delete";
  const canManageAnyStatus = isMutation && (isExecutiveReader || await hasDtscIndividualPermission(actor.userId, DTSC_SPECIAL_PERMISSIONS.CHANGE_ANY_OPERATION_STATUS));

  if (objectType === "CALENDAR_EVENT") {
    const event = await prisma.internalCalendarEvent.findFirst({
      where: { id: objectId, deletedAt: null },
      include: { participants: true },
    });
    if (!event) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const employeeId = actor.employeeId;
    const isCreator = event.createdBy === actor.userId;
    const isOwner = Boolean(employeeId && event.ownerCollaboratorId === employeeId);
    const isAcceptedParticipant = Boolean(employeeId && event.participants.some((participant) => participant.collaboratorId === employeeId && participant.participantStatus === "Actif" && participant.responseStatus === "Accepté"));
    const canRead = isCreator || isOwner || isAcceptedParticipant || isExecutiveReader;
    const canMutate = isCreator && isOwner;
    return {
      allowed: action === "read" || action === "comment" ? canRead : canMutate,
      reason: canRead ? null : "FORBIDDEN",
      object: event,
      capabilities: { isCreator, isOwner, isAcceptedParticipant, canRead, canMutate },
    } as const;
  }

  if (!actor.employeeId && actor.role !== UserRole.ADMIN) return { allowed: false as const, reason: "NO_EMPLOYEE" as const, object: null };
  const employeeId = actor.employeeId || "";

  if (objectType === "TASK") {
    const task = await prisma.cooTask.findUnique({ where: { id: objectId } });
    if (!task) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const responsible = task.responsibleEmployeeId === employeeId || task.assigneeEmployeeId === employeeId;
    const creator = task.createdById === actor.userId;
    const canRead = responsible || creator || isExecutiveReader;
    const canExecute = responsible || canManageAnyStatus;
    return { allowed: action === "read" || action === "comment" ? canRead : canExecute, reason: canRead ? null : "FORBIDDEN", object: task, capabilities: { responsible, creator, canRead, canExecute } } as const;
  }

  if (objectType === "OPERATION") {
    const operation = await prisma.cooOperation.findUnique({ where: { id: objectId } });
    if (!operation) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const responsible = operation.leadEmployeeId === employeeId;
    const collaborators = operation.collaborators || "";
    const normalizedEmployeeId = employeeId.toLocaleLowerCase();
    const participant = collaborators.includes(employeeId) || collaborators.toLocaleLowerCase().includes(normalizedEmployeeId);
    const creator = operation.createdById === actor.userId;
    const canRead = responsible || participant || creator || isExecutiveReader;
    const canExecute = responsible || canManageAnyStatus;
    return { allowed: action === "read" || action === "comment" ? canRead : canExecute, reason: canRead ? null : "FORBIDDEN", object: operation, capabilities: { responsible, participant, creator, canRead, canExecute } } as const;
  }

  if (objectType === "DEPARTMENT_REQUEST") {
    const request = await prisma.cooDepartmentRequest.findUnique({ where: { id: objectId } });
    if (!request) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const responsible = request.targetResponsibleEmployeeId === employeeId;
    const requester = request.requesterEmployeeId === employeeId;
    const canRead = responsible || requester || isExecutiveReader;
    const canExecute = responsible || canManageAnyStatus;
    return { allowed: action === "read" || action === "comment" ? canRead : canExecute, reason: canRead ? null : "FORBIDDEN", object: request, capabilities: { responsible, requester, canRead, canExecute } } as const;
  }

  if (objectType === "BLOCKER") {
    const blocker = await prisma.cooBlocker.findUnique({ where: { id: objectId } });
    if (!blocker) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const responsible = blocker.responsibleEmployeeId === employeeId;
    const creator = blocker.createdById === actor.userId;
    const canRead = responsible || creator || isExecutiveReader;
    const canExecute = responsible || canManageAnyStatus;
    return { allowed: action === "read" || action === "comment" ? canRead : canExecute, reason: canRead ? null : "FORBIDDEN", object: blocker, capabilities: { responsible, creator, canRead, canExecute } } as const;
  }

  if (objectType === "MEETING") {
    const meeting = await prisma.cooMeeting.findUnique({ where: { id: objectId } });
    if (!meeting) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const responsible = meeting.reportOwnerEmployeeId === employeeId;
    const participants = meeting.participants || "";
    const participant = participants.includes(employeeId);
    const creator = meeting.createdById === actor.userId;
    const canRead = responsible || participant || creator || isExecutiveReader;
    const canExecute = responsible || creator || canManageAnyStatus;
    return { allowed: action === "read" || action === "comment" ? canRead : canExecute, reason: canRead ? null : "FORBIDDEN", object: meeting, capabilities: { responsible, participant, creator, canRead, canExecute } } as const;
  }

  if (objectType === "COLLAB_REQUEST") {
    const request = await prisma.collaboratorRequest.findUnique({ where: { id: objectId } });
    if (!request) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const responsible = request.targetEmployeeId === employeeId;
    const requester = request.requesterEmployeeId === employeeId;
    const canRead = responsible || requester || isExecutiveReader;
    const canExecute = responsible || canManageAnyStatus;
    return { allowed: action === "read" || action === "comment" ? canRead : canExecute, reason: canRead ? null : "FORBIDDEN", object: request, capabilities: { responsible, requester, canRead, canExecute } } as const;
  }

  if (objectType === "CEO_OBJECTIVE") {
    const record = await prisma.ceoObjective.findUnique({ where: { id: objectId } });
    if (!record) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const involved = record.responsibleEmployeeId === employeeId || record.createdById === actor.userId;
    const canRead = involved || isExecutiveReader;
    return accessResult(record, canRead, involved || canManageAnyStatus || actor.positionCode === "CEO", action);
  }
  if (objectType === "CEO_SUPERVISION") {
    const record = await prisma.ceoSupervisionLog.findUnique({ where: { id: objectId } });
    if (!record) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const involved = [record.employeeId, record.followUpResponsibleId].includes(employeeId) || record.createdById === actor.userId;
    const canRead = involved || isExecutiveReader;
    return accessResult(record, canRead, involved || canManageAnyStatus || actor.positionCode === "CEO", action);
  }
  if (objectType === "MPO_PROJECT") {
    const record = await prisma.mpoProject.findUnique({ where: { id: objectId } });
    if (!record) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const employeeIds = [record.responsibleMpoId, record.ctoEmployeeId, record.cooEmployeeId, record.hrCfoEmployeeId, record.scoEmployeeId, record.ceoEmployeeId];
    const involved = employeeIds.includes(employeeId) || includesIdentity(record.collaborators, employeeId, actor.employeeName) || record.createdById === actor.userId;
    const canRead = involved || isExecutiveReader || actor.positionCode === "MPO";
    return accessResult(record, canRead, involved || canManageAnyStatus || actor.positionCode === "MPO", action);
  }
  if (objectType === "MPO_RECORD") {
    const record = await prisma.mpoProjectRecord.findUnique({ where: { id: objectId } });
    if (!record) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const involved = [record.responsibleEmployeeId, record.targetEmployeeId].includes(employeeId) || record.createdById === actor.userId;
    const canRead = involved || isExecutiveReader || actor.positionCode === "MPO";
    return accessResult(record, canRead, involved || canManageAnyStatus || actor.positionCode === "MPO", action);
  }
  if (objectType === "CTO_PROJECT") {
    const record = await prisma.ctoTechnicalProject.findUnique({ where: { id: objectId } });
    if (!record) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const involved = record.responsibleCtoId === employeeId || includesIdentity(record.technicalCollaborators, employeeId, actor.employeeName) || record.createdById === actor.userId;
    const canRead = involved || isExecutiveReader || actor.positionCode === "CTO";
    return accessResult(record, canRead, involved || canManageAnyStatus || actor.positionCode === "CTO", action);
  }
  if (objectType === "CTO_RECORD") {
    const record = await prisma.ctoTechnicalRecord.findUnique({ where: { id: objectId } });
    if (!record) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const involved = [record.responsibleEmployeeId, record.assigneeEmployeeId].includes(employeeId) || record.createdById === actor.userId;
    const canRead = involved || isExecutiveReader || actor.positionCode === "CTO";
    return accessResult(record, canRead, involved || canManageAnyStatus || actor.positionCode === "CTO", action);
  }
  if (objectType === "SCO_PURCHASE_REQUEST") {
    const record = await prisma.scoPurchaseRequest.findUnique({ where: { id: objectId } });
    if (!record) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
    const requester = Boolean(actor.employeeName && normalizeIdentity(record.requesterName) === normalizeIdentity(actor.employeeName));
    const involved = requester || record.createdById === actor.userId;
    const canRead = involved || isExecutiveReader || actor.positionCode === "SCO";
    return accessResult(record, canRead, involved || canManageAnyStatus || actor.positionCode === "SCO", action);
  }
  const record = await prisma.scoLogisticsEvent.findUnique({ where: { id: objectId } });
  if (!record) return { allowed: false as const, reason: "NOT_FOUND" as const, object: null };
  const involved = [record.ownerName, record.requesterName].some((name) => Boolean(name && actor.employeeName && normalizeIdentity(name) === normalizeIdentity(actor.employeeName))) || includesIdentity(record.participants, employeeId, actor.employeeName) || record.createdById === actor.userId;
  const canRead = involved || isExecutiveReader || actor.positionCode === "SCO";
  return accessResult(record, canRead, involved || canManageAnyStatus || actor.positionCode === "SCO", action);
}

export async function operationalChecklistProgress(objectType: OperationalObjectType, objectId: string) {
  const items = await prisma.operationalChecklistItem.findMany({
    where: { objectType, objectId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const completed = items.filter((item) => item.completed).length;
  const progress = items.length ? Math.round((completed / items.length) * 100) : 0;
  return { items, completed, total: items.length, progress };
}


function accessResult<T>(object: T, canRead: boolean, canExecute: boolean, action: "read" | "comment" | "checklist" | "status" | "delete") {
  return { allowed: action === "read" || action === "comment" ? canRead : canExecute, reason: canRead ? null : "FORBIDDEN", object, capabilities: { canRead, canExecute } } as const;
}

function includesIdentity(value: string | null, employeeId: string, employeeName: string | null) {
  const normalized = normalizeIdentity(value || "");
  return Boolean((employeeId && normalized.includes(normalizeIdentity(employeeId))) || (employeeName && normalized.includes(normalizeIdentity(employeeName))));
}

function normalizeIdentity(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
