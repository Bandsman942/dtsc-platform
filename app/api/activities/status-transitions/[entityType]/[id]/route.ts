import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getActivityStatusTransitions, ACTIVITY_STATUS_REASON_REQUIRED, normalizeActivityStatus } from "@/lib/activity-status-workflow";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { DTSC_SPECIAL_PERMISSIONS, hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import { notifyUsers } from "@/lib/notifications";
import { getOperationalActor, resolveOperationalObjectAccess } from "@/lib/operational-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import type { ActivityEntityType } from "@/components/activities/activity-types";

export const runtime = "nodejs";

type Params = { params: Promise<{ entityType: string; id: string }> };

const payloadSchema = z.object({
  status: z.string().trim().min(2).max(80),
  reason: z.string().trim().max(1500).optional().or(z.literal("")),
}).strict();

const supportedTypes = new Set<ActivityEntityType>([
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
]);

function isSupportedType(value: string): value is ActivityEntityType {
  return supportedTypes.has(value as ActivityEntityType);
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden", message: "Origine de la requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `activity-status-transition:${user.id}`), 180, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop de transitions. Réessayez plus tard." }, { status: 429 });

  const { entityType: rawEntityType, id } = await params;
  const entityType = rawEntityType.trim().toUpperCase();
  if (!isSupportedType(entityType)) {
    await writeApiLog({ request: req, statusCode: 404, userId: user.id, startedAt, metadata: { entityType } });
    return NextResponse.json({ error: "Unsupported activity type", message: "Cette opération utilise son workflow métier dédié." }, { status: 404 });
  }
  const parsed = payloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Transition invalide." }, { status: 400 });

  const requestedStatus = normalizeActivityStatus(parsed.data.status);
  const reason = parsed.data.reason?.trim() || "";
  if (ACTIVITY_STATUS_REASON_REQUIRED.has(requestedStatus) && !reason) {
    return NextResponse.json({ error: "REASON_REQUIRED", message: "Ajoutez un motif professionnel pour cette transition." }, { status: 400 });
  }

  const actor = await getOperationalActor(user);
  const employee = actor.employeeId
    ? await prisma.hrcfoEmployee.findUnique({ where: { id: actor.employeeId }, select: { id: true, fullName: true } })
    : null;
  const canManageAny = user.role === UserRole.ADMIN || await hasDtscIndividualPermission(user.id, DTSC_SPECIAL_PERMISSIONS.CHANGE_ANY_OPERATION_STATUS);

  const target = await resolveTarget({ entityType, id, userId: user.id, actor, employeeName: employee?.fullName || "", canManageAny });
  if (!target) {
    await writeApiLog({ request: req, statusCode: 404, userId: user.id, startedAt, metadata: { entityType, id } });
    return NextResponse.json({ error: "NOT_FOUND", message: "Opération introuvable." }, { status: 404 });
  }
  if (!target.allowed) {
    await writeApiLog({ request: req, statusCode: 403, userId: user.id, startedAt, metadata: { entityType, id } });
    return NextResponse.json({ error: "FORBIDDEN", message: "Seules les personnes impliquées ou autorisées peuvent faire évoluer cette opération." }, { status: 403 });
  }

  const currentStatus = normalizeActivityStatus(target.status);
  if (currentStatus === requestedStatus) {
    await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { entityType, id, status: requestedStatus, idempotent: true } });
    return NextResponse.json({ ok: true, unchanged: true, status: requestedStatus });
  }
  const allowedTransitions = getActivityStatusTransitions(entityType, currentStatus);
  if (!allowedTransitions.includes(requestedStatus)) {
    return NextResponse.json({ error: "INVALID_TRANSITION", message: `La transition ${currentStatus} → ${requestedStatus} n’est pas autorisée.`, allowedTransitions }, { status: 409 });
  }

  const businessRuleError = await validateBusinessRules(entityType, id, requestedStatus);
  if (businessRuleError) return NextResponse.json({ error: "BUSINESS_RULE", message: businessRuleError }, { status: 409 });

  const changed = await prisma.$transaction(async (tx) => {
    const count = await updateCanonicalStatus(tx, entityType, id, currentStatus, requestedStatus, reason);
    if (count === 0) return false;
    await tx.operationalStatusTransition.create({
      data: {
        objectType: entityType,
        objectId: id,
        fromStatus: currentStatus,
        toStatus: requestedStatus,
        actorUserId: user.id,
        actorEmployeeId: actor.employeeId,
        reason: reason || null,
        metadataJson: { sourceModule: "ACTIVITES_DTSC", synchronizedAdminSection: target.adminSection },
      },
    });
    return true;
  });

  if (!changed) {
    const latest = await readCurrentStatus(entityType, id);
    if (latest === requestedStatus) {
      return NextResponse.json({ ok: true, unchanged: true, status: requestedStatus });
    }
    return NextResponse.json({ error: "CONCURRENT_UPDATE", message: "L’opération a changé entre-temps. Rechargez puis réessayez." }, { status: 409 });
  }

  const recipients = await employeeIdsToUserIds(target.recipientEmployeeIds);
  await notifyUsers({
    userIds: [...new Set([...recipients, ...target.recipientUserIds])].filter((recipientId) => recipientId !== user.id),
    title: "Activité DTSC mise à jour",
    body: `${target.title} est maintenant ${requestedStatus}.`,
    type: `ACTIVITY_${entityType}`,
    targetUrl: `/activities?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(id)}`,
  });
  await writeAuditLog({
    userId: user.id,
    action: `${entityType}_STATUS_CHANGED_FROM_ACTIVITIES`,
    entity: target.modelName,
    entityId: id,
    request: req,
    metadata: { fromStatus: currentStatus, toStatus: requestedStatus, reason: reason || null, synchronizedAdminSection: target.adminSection },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { entityType, id, fromStatus: currentStatus, toStatus: requestedStatus } });
  return NextResponse.json({ ok: true, status: requestedStatus, synchronizedAdminSection: target.adminSection });
}

type Actor = Awaited<ReturnType<typeof getOperationalActor>>;
type Target = {
  allowed: boolean;
  status: string;
  title: string;
  modelName: string;
  adminSection: string;
  recipientEmployeeIds: string[];
  recipientUserIds: string[];
};

async function resolveTarget({ entityType, id, userId, actor, employeeName, canManageAny }: { entityType: ActivityEntityType; id: string; userId: string; actor: Actor; employeeName: string; canManageAny: boolean }): Promise<Target | null> {
  const executive = canManageAny || actor.positionCode === "CEO" || actor.positionCode === "COO";
  if (["OPERATION", "DEPARTMENT_REQUEST", "BLOCKER", "MEETING", "COLLAB_REQUEST"].includes(entityType)) {
    const access = await resolveOperationalObjectAccess({ actor, objectType: entityType as "OPERATION" | "DEPARTMENT_REQUEST" | "BLOCKER" | "MEETING" | "COLLAB_REQUEST", objectId: id, action: "status" });
    if (!access.object) return null;
    const object = access.object as unknown as Record<string, unknown>;
    return {
      allowed: access.allowed,
      status: String(object.status || ""),
      title: String(object.title || object.subject || "Opération DTSC"),
      modelName: coreModelName(entityType),
      adminSection: entityType === "COLLAB_REQUEST" ? "activities" : "coo",
      recipientEmployeeIds: compactIds([object.leadEmployeeId, object.requesterEmployeeId, object.targetResponsibleEmployeeId, object.responsibleEmployeeId, object.reportOwnerEmployeeId, object.targetEmployeeId]),
      recipientUserIds: compactIds([object.createdById, object.requesterUserId, object.targetUserId]),
    };
  }
  if (entityType === "CEO_OBJECTIVE") {
    const item = await prisma.ceoObjective.findUnique({ where: { id } });
    if (!item) return null;
    return { allowed: executive || item.responsibleEmployeeId === actor.employeeId || item.createdById === userId, status: item.status, title: item.title, modelName: "CeoObjective", adminSection: "ceo", recipientEmployeeIds: compactIds([item.responsibleEmployeeId]), recipientUserIds: compactIds([item.createdById]) };
  }
  if (entityType === "CEO_SUPERVISION") {
    const item = await prisma.ceoSupervisionLog.findUnique({ where: { id } });
    if (!item) return null;
    return { allowed: executive || item.employeeId === actor.employeeId || item.followUpResponsibleId === actor.employeeId || item.createdById === userId, status: item.status, title: item.title, modelName: "CeoSupervisionLog", adminSection: "ceo", recipientEmployeeIds: compactIds([item.employeeId, item.followUpResponsibleId]), recipientUserIds: compactIds([item.createdById]) };
  }
  if (entityType === "MPO_PROJECT") {
    const item = await prisma.mpoProject.findUnique({ where: { id } });
    if (!item) return null;
    const involved = compactIds([item.responsibleMpoId, item.ctoEmployeeId, item.cooEmployeeId, item.hrCfoEmployeeId, item.scoEmployeeId, item.ceoEmployeeId]);
    const listed = Boolean(actor.employeeId && (involved.includes(actor.employeeId) || containsIdentity(item.collaborators, actor.employeeId, employeeName)));
    return { allowed: executive || actor.positionCode === "MPO" || listed || item.createdById === userId, status: item.status, title: item.title, modelName: "MpoProject", adminSection: "mpo", recipientEmployeeIds: involved, recipientUserIds: compactIds([item.createdById]) };
  }
  if (entityType === "MPO_RECORD") {
    const item = await prisma.mpoProjectRecord.findUnique({ where: { id } });
    if (!item) return null;
    const involved = compactIds([item.responsibleEmployeeId, item.targetEmployeeId]);
    return { allowed: executive || actor.positionCode === "MPO" || Boolean(actor.employeeId && involved.includes(actor.employeeId)) || item.createdById === userId, status: item.status, title: item.title, modelName: "MpoProjectRecord", adminSection: "mpo", recipientEmployeeIds: involved, recipientUserIds: compactIds([item.createdById]) };
  }
  if (entityType === "CTO_PROJECT") {
    const item = await prisma.ctoTechnicalProject.findUnique({ where: { id } });
    if (!item) return null;
    const listed = Boolean(actor.employeeId && (item.responsibleCtoId === actor.employeeId || containsIdentity(item.technicalCollaborators, actor.employeeId, employeeName)));
    return { allowed: executive || actor.positionCode === "CTO" || listed || item.createdById === userId, status: item.status, title: item.title, modelName: "CtoTechnicalProject", adminSection: "cto", recipientEmployeeIds: compactIds([item.responsibleCtoId]), recipientUserIds: compactIds([item.createdById]) };
  }
  if (entityType === "CTO_RECORD") {
    const item = await prisma.ctoTechnicalRecord.findUnique({ where: { id } });
    if (!item) return null;
    const involved = compactIds([item.responsibleEmployeeId, item.assigneeEmployeeId]);
    return { allowed: executive || actor.positionCode === "CTO" || Boolean(actor.employeeId && involved.includes(actor.employeeId)) || item.createdById === userId, status: item.status, title: item.title, modelName: "CtoTechnicalRecord", adminSection: "cto", recipientEmployeeIds: involved, recipientUserIds: compactIds([item.createdById]) };
  }
  if (entityType === "SCO_PURCHASE_REQUEST") {
    const item = await prisma.scoPurchaseRequest.findUnique({ where: { id } });
    if (!item) return null;
    const requester = employeeName && normalizeIdentity(item.requesterName) === normalizeIdentity(employeeName);
    return { allowed: executive || actor.positionCode === "SCO" || requester || item.createdById === userId, status: item.status, title: item.title, modelName: "ScoPurchaseRequest", adminSection: "sco", recipientEmployeeIds: [], recipientUserIds: compactIds([item.createdById]) };
  }
  if (entityType === "SCO_LOGISTICS") {
    const item = await prisma.scoLogisticsEvent.findUnique({ where: { id } });
    if (!item) return null;
    const involved = employeeName && [item.ownerName, item.requesterName].some((name) => normalizeIdentity(name || "") === normalizeIdentity(employeeName)) || containsIdentity(item.participants, actor.employeeId || "", employeeName);
    return { allowed: executive || actor.positionCode === "SCO" || involved || item.createdById === userId, status: item.status, title: item.title, modelName: "ScoLogisticsEvent", adminSection: "sco", recipientEmployeeIds: [], recipientUserIds: compactIds([item.createdById]) };
  }
  return null;
}

async function validateBusinessRules(entityType: ActivityEntityType, id: string, nextStatus: string) {
  if (entityType === "OPERATION" && nextStatus === "COMPLETED") {
    const openTasks = await prisma.cooTask.count({ where: { operationId: id, status: { notIn: ["COMPLETED", "VALIDATED", "CANCELED", "CANCELLED"] } } });
    if (openTasks > 0) return "Toutes les tâches liées doivent être terminées, validées ou annulées avant de clôturer l’opération.";
  }
  if (entityType === "MEETING" && nextStatus === "MINUTES_PUBLISHED") {
    const meeting = await prisma.cooMeeting.findUnique({ where: { id }, select: { minutes: true } });
    if (!meeting?.minutes?.trim()) return "Publiez d’abord le compte rendu de la réunion.";
  }
  return null;
}

async function updateCanonicalStatus(tx: Prisma.TransactionClient, entityType: ActivityEntityType, id: string, currentStatus: string, requestedStatus: string, reason: string) {
  const where = { id, status: currentStatus };
  if (entityType === "OPERATION") return (await tx.cooOperation.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "DEPARTMENT_REQUEST") return (await tx.cooDepartmentRequest.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "BLOCKER") return (await tx.cooBlocker.updateMany({ where, data: { status: requestedStatus, resolutionComment: reason || undefined, resolvedAt: requestedStatus === "RESOLVED" ? new Date() : requestedStatus === "IN_PROGRESS" ? null : undefined } })).count;
  if (entityType === "MEETING") return (await tx.cooMeeting.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "COLLAB_REQUEST") return (await tx.collaboratorRequest.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "CEO_OBJECTIVE") return (await tx.ceoObjective.updateMany({ where, data: { status: requestedStatus, progress: requestedStatus === "ACHIEVED" ? 100 : undefined } })).count;
  if (entityType === "CEO_SUPERVISION") return (await tx.ceoSupervisionLog.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "SCO_PURCHASE_REQUEST") return (await tx.scoPurchaseRequest.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "SCO_LOGISTICS") return (await tx.scoLogisticsEvent.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "MPO_PROJECT") return (await tx.mpoProject.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "MPO_RECORD") return (await tx.mpoProjectRecord.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "CTO_PROJECT") return (await tx.ctoTechnicalProject.updateMany({ where, data: { status: requestedStatus } })).count;
  if (entityType === "CTO_RECORD") return (await tx.ctoTechnicalRecord.updateMany({ where, data: { status: requestedStatus } })).count;
  return 0;
}

async function readCurrentStatus(entityType: ActivityEntityType, id: string) {
  if (entityType === "OPERATION") return normalizeActivityStatus((await prisma.cooOperation.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "DEPARTMENT_REQUEST") return normalizeActivityStatus((await prisma.cooDepartmentRequest.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "BLOCKER") return normalizeActivityStatus((await prisma.cooBlocker.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "MEETING") return normalizeActivityStatus((await prisma.cooMeeting.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "COLLAB_REQUEST") return normalizeActivityStatus((await prisma.collaboratorRequest.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "CEO_OBJECTIVE") return normalizeActivityStatus((await prisma.ceoObjective.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "CEO_SUPERVISION") return normalizeActivityStatus((await prisma.ceoSupervisionLog.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "SCO_PURCHASE_REQUEST") return normalizeActivityStatus((await prisma.scoPurchaseRequest.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "SCO_LOGISTICS") return normalizeActivityStatus((await prisma.scoLogisticsEvent.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "MPO_PROJECT") return normalizeActivityStatus((await prisma.mpoProject.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "MPO_RECORD") return normalizeActivityStatus((await prisma.mpoProjectRecord.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "CTO_PROJECT") return normalizeActivityStatus((await prisma.ctoTechnicalProject.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  if (entityType === "CTO_RECORD") return normalizeActivityStatus((await prisma.ctoTechnicalRecord.findUnique({ where: { id }, select: { status: true } }))?.status || "");
  return "";
}

function coreModelName(entityType: ActivityEntityType) {
  if (entityType === "OPERATION") return "CooOperation";
  if (entityType === "DEPARTMENT_REQUEST") return "CooDepartmentRequest";
  if (entityType === "BLOCKER") return "CooBlocker";
  if (entityType === "MEETING") return "CooMeeting";
  return "CollaboratorRequest";
}

function compactIds(values: unknown[]) {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function containsIdentity(value: string | null, employeeId: string, employeeName: string) {
  const normalized = normalizeIdentity(value || "");
  return Boolean((employeeId && normalized.includes(normalizeIdentity(employeeId))) || (employeeName && normalized.includes(normalizeIdentity(employeeName))));
}

function normalizeIdentity(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function employeeIdsToUserIds(employeeIds: string[]) {
  if (!employeeIds.length) return [];
  const employees = await prisma.hrcfoEmployee.findMany({ where: { id: { in: [...new Set(employeeIds)] } }, select: { userId: true } });
  return employees.map((employee) => employee.userId).filter((userId): userId is string => Boolean(userId));
}
