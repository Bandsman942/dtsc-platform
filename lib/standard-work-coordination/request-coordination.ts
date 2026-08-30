import { z } from "zod";
import { canMutateOwnedObject, enterpriseRequestVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { REQUEST_COORDINATION_ACTIONS, REQUEST_TRANSITIONS } from "@/lib/enterprise/core-v2/constants";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

const revisionSchema = z.coerce.number().int().min(1);

export const requestCoordinationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("REQUEST_INFORMATION"), revision: revisionSchema, comment: z.string().trim().min(3).max(3000) }),
  z.object({ action: z.literal("RESPOND"), revision: revisionSchema, comment: z.string().trim().min(1).max(3000) }),
  z.object({ action: z.literal("RESOLVE"), revision: revisionSchema, comment: z.string().trim().min(3).max(3000) }),
  z.object({ action: z.literal("CLOSE"), revision: revisionSchema, comment: z.string().trim().min(3).max(3000) }),
  z.object({ action: z.literal("REOPEN"), revision: revisionSchema, comment: z.string().trim().min(3).max(3000) }),
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

export function canCoordinateRequest(action: (typeof REQUEST_COORDINATION_ACTIONS)[number], status: string) {
  const transition = REQUEST_TRANSITIONS[action];
  return transition.from.includes(status as never);
}

export async function applyRequestCoordinationAction(args: { organizationId: string; requestId: string; actorUserId: string; canManage: boolean; canOperate: boolean; isRequester: boolean; payload: z.infer<typeof requestCoordinationActionSchema> }) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.enterpriseRequest.findFirst({ where: { id: args.requestId, organizationId: args.organizationId, archivedAt: null } });
    if (!request) throw new RequestCoordinationError("NOT_FOUND", 404, "Demande introuvable.");
    const action = args.payload.action;
    const transition = REQUEST_TRANSITIONS[action];
    if (!transition.from.includes(request.status as never)) throw new RequestCoordinationError("INVALID_STATE", 409, "Cette action n’est plus disponible depuis l’état actuel de la demande.");
    if (action === "RESPOND" || action === "REOPEN") {
      if (!args.isRequester && !args.canManage) throw new RequestCoordinationError("FORBIDDEN", 403, "Cette action est réservée au demandeur ou à un responsable autorisé.");
    } else if (!args.canOperate && !args.canManage) {
      throw new RequestCoordinationError("FORBIDDEN", 403, "Cette action est réservée au responsable de la demande.");
    }

    const comment = normalize(args.payload.comment);
    if (comment) {
      await tx.enterpriseOperationalComment.create({ data: { organizationId: args.organizationId, entityType: "EnterpriseRequest", entityId: request.id, authorUserId: args.actorUserId, content: comment } });
    }

    const updated = await tx.enterpriseRequest.updateMany({
      where: {
        id: request.id,
        organizationId: args.organizationId,
        status: request.status,
        revision: args.payload.revision,
        archivedAt: null,
      },
      data: {
        status: transition.to,
        ...(action === "RESOLVE" || action === "CLOSE" ? { closedAt: new Date() } : {}),
        ...(action === "REOPEN" ? { closedAt: null } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new RequestCoordinationError("REVISION_CONFLICT", 409, "La demande a changé. Actualisez-la avant de réessayer.");

    await tx.enterpriseOperationalEvent.create({
      data: {
        organizationId: args.organizationId,
        entityType: "EnterpriseRequest",
        entityId: request.id,
        eventType: `ENTERPRISE_REQUEST_${action}`,
        summary: comment || actionSummary(action),
        actorUserId: args.actorUserId,
        fromStatus: request.status,
        toStatus: transition.to,
      },
    });
    return tx.enterpriseRequest.findUnique({ where: { id: request.id } });
  });
}

function actionSummary(action: z.infer<typeof requestCoordinationActionSchema>["action"]) {
  if (action === "REQUEST_INFORMATION") return "Informations complémentaires demandées.";
  if (action === "RESPOND") return "Réponse du demandeur reçue.";
  if (action === "RESOLVE") return "Demande traitée.";
  if (action === "CLOSE") return "Traitement confirmé et clôturé.";
  return "Demande rouverte pour nouvelle revue.";
}

function normalize(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
