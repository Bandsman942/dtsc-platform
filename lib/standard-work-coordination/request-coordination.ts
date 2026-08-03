import { Prisma } from "@prisma/client";
import { z } from "zod";
import { canMutateOwnedObject, enterpriseRequestVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export const requestCoordinationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("REQUEST_INFORMATION"), comment: z.string().trim().min(3).max(3000) }),
  z.object({ action: z.literal("RESPOND"), comment: z.string().trim().min(1).max(3000) }),
  z.object({ action: z.literal("RESOLVE"), comment: z.string().trim().min(3).max(3000) }),
  z.object({ action: z.literal("CLOSE"), comment: z.string().trim().max(3000).optional() }),
  z.object({ action: z.literal("REOPEN"), comment: z.string().trim().min(3).max(3000) }),
]);

export class RequestCoordinationError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
  }
}

export async function getRequestCoordinationContext(args: { session: SessionPayload; organizationId: string; requestId: string; action: "read" | "write" }) {
  const access = await getEnterpriseCoreV2Access({ session: args.session, organizationId: args.organizationId, moduleCode: "INTERNAL_REQUESTS", action: args.action });
  if (!access) return null;
  const request = await prisma.enterpriseRequest.findFirst({
    where: { id: args.requestId, ...enterpriseRequestVisibilityWhere({ organizationId: args.organizationId, userId: args.session.userId, canSeeAll: access.canSeeAll }) },
  });
  if (!request) return null;
  const canOperate = canMutateOwnedObject({ canManage: access.canManage, userId: args.session.userId, relatedUserIds: [request.assignedToUserId] });
  const isRequester = request.requestedByUserId === args.session.userId;
  return { access, request, canOperate, isRequester };
}

export async function loadRequestCoordination(organizationId: string, requestId: string) {
  const [events, comments] = await Promise.all([
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterpriseRequest", entityId: requestId }, orderBy: { createdAt: "asc" }, take: 500 }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType: "EnterpriseRequest", entityId: requestId, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 500 }),
  ]);
  return { events, comments };
}

export async function applyRequestCoordinationAction(args: { organizationId: string; requestId: string; actorUserId: string; canManage: boolean; canOperate: boolean; isRequester: boolean; payload: z.infer<typeof requestCoordinationActionSchema> }) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.enterpriseRequest.findFirst({ where: { id: args.requestId, organizationId: args.organizationId, archivedAt: null } });
    if (!request) throw new RequestCoordinationError("NOT_FOUND", 404, "Demande introuvable.");
    const action = args.payload.action;
    const allowed = allowedStatuses(action);
    if (!allowed.includes(request.status)) throw new RequestCoordinationError("INVALID_STATE", 409, `Cette action n’est pas disponible depuis le statut ${request.status}.`);
    if (action === "RESPOND" || action === "REOPEN") {
      if (!args.isRequester && !args.canManage) throw new RequestCoordinationError("FORBIDDEN", 403, "Cette action est réservée au demandeur.");
    } else if (!args.canOperate && !args.canManage) {
      throw new RequestCoordinationError("FORBIDDEN", 403, "Cette action est réservée au responsable de la demande.");
    }
    const nextStatus = actionStatus(action);
    const comment = normalize(args.payload.comment);
    if (comment) {
      await tx.enterpriseOperationalComment.create({ data: { organizationId: args.organizationId, entityType: "EnterpriseRequest", entityId: request.id, authorUserId: args.actorUserId, content: comment } });
    }
    const updated = await tx.enterpriseRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        closedAt: nextStatus === "CLOSED" ? new Date() : action === "REOPEN" ? null : request.closedAt,
        revision: { increment: 1 },
      },
    });
    await tx.enterpriseOperationalEvent.create({
      data: {
        organizationId: args.organizationId,
        entityType: "EnterpriseRequest",
        entityId: request.id,
        eventType: `ENTERPRISE_REQUEST_${action}`,
        summary: comment || actionSummary(action),
        actorUserId: args.actorUserId,
        fromStatus: request.status,
        toStatus: nextStatus,
      },
    });
    return updated;
  });
}

function allowedStatuses(action: z.infer<typeof requestCoordinationActionSchema>["action"]) {
  if (action === "REQUEST_INFORMATION") return ["SUBMITTED", "IN_REVIEW", "ASSIGNED", "IN_PROGRESS"];
  if (action === "RESPOND") return ["WAITING_REQUESTER"];
  if (action === "RESOLVE") return ["IN_REVIEW", "ASSIGNED", "IN_PROGRESS", "WAITING_APPROVAL", "APPROVED"];
  if (action === "CLOSE") return ["RESOLVED", "FULFILLED"];
  return ["CLOSED", "RESOLVED", "FULFILLED"];
}

function actionStatus(action: z.infer<typeof requestCoordinationActionSchema>["action"]) {
  if (action === "REQUEST_INFORMATION") return "WAITING_REQUESTER";
  if (action === "RESPOND") return "IN_PROGRESS";
  if (action === "RESOLVE") return "RESOLVED";
  if (action === "CLOSE") return "CLOSED";
  return "REOPENED";
}

function actionSummary(action: z.infer<typeof requestCoordinationActionSchema>["action"]) {
  if (action === "REQUEST_INFORMATION") return "Informations complémentaires demandées.";
  if (action === "RESPOND") return "Réponse du demandeur reçue.";
  if (action === "RESOLVE") return "Demande résolue.";
  if (action === "CLOSE") return "Demande clôturée.";
  return "Demande rouverte.";
}

function normalize(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
