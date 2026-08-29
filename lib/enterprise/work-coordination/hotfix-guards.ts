import { REQUEST_TYPES } from "@/lib/enterprise/core-v2/constants";
import { prisma } from "@/lib/prisma";

export class WorkCoordinationHotfixError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function assertEnterpriseTaskCompletionReady(args: {
  organizationId: string;
  taskId: string;
}) {
  const [incompleteChecklist, openBlockers, dependencies] = await Promise.all([
    prisma.enterpriseTaskChecklistItem.count({
      where: { organizationId: args.organizationId, taskId: args.taskId, isCompleted: false },
    }),
    prisma.enterpriseTaskBlocker.count({
      where: { organizationId: args.organizationId, taskId: args.taskId, status: "OPEN" },
    }),
    prisma.enterpriseTaskDependency.findMany({
      where: {
        organizationId: args.organizationId,
        successorId: args.taskId,
        dependencyType: { in: ["BLOCKS", "FINISH_TO_START"] },
      },
      select: {
        predecessor: { select: { id: true, title: true, status: true, archivedAt: true } },
      },
      take: 300,
    }),
  ]);

  if (incompleteChecklist > 0) {
    throw new WorkCoordinationHotfixError(
      "TASK_CHECKLIST_INCOMPLETE",
      409,
      `Terminez les ${incompleteChecklist} élément(s) de checklist restant(s) avant de clôturer cette tâche.`
    );
  }
  if (openBlockers > 0) {
    throw new WorkCoordinationHotfixError(
      "TASK_BLOCKERS_OPEN",
      409,
      `Résolvez les ${openBlockers} blocage(s) ouvert(s) avant de clôturer cette tâche.`
    );
  }

  const unresolvedDependencies = dependencies
    .map((entry) => entry.predecessor)
    .filter((task) => task.status !== "DONE");
  if (unresolvedDependencies.length > 0) {
    throw new WorkCoordinationHotfixError(
      "TASK_DEPENDENCIES_INCOMPLETE",
      409,
      `Cette tâche dépend encore de ${unresolvedDependencies.length} tâche(s) non terminée(s).`
    );
  }
}

export function assertTaskCoordinationMutationAllowed(args: {
  taskStatus: string;
  action: string;
}) {
  if (["DONE", "CANCELLED"].includes(args.taskStatus)) {
    throw new WorkCoordinationHotfixError(
      "TASK_COORDINATION_LOCKED",
      409,
      "La coordination d’une tâche terminée ou annulée est en lecture seule."
    );
  }
  if (args.action === "ADD_BLOCKER" && args.taskStatus === "BLOCKED") {
    return;
  }
}

export function assertMeetingCoordinationMutationAllowed(args: {
  meetingStatus: string;
  action: string;
}) {
  if (args.meetingStatus === "CANCELLED") {
    throw new WorkCoordinationHotfixError(
      "MEETING_COORDINATION_LOCKED",
      409,
      "Une réunion annulée est en lecture seule."
    );
  }
  if (args.meetingStatus === "COMPLETED") {
    const postMeetingActions = new Set(["SAVE_MINUTES", "LINK_TASK", "UNLINK_TASK"]);
    if (!postMeetingActions.has(args.action)) {
      throw new WorkCoordinationHotfixError(
        "MEETING_AGENDA_LOCKED",
        409,
        "L’ordre du jour d’une réunion terminée est figé. Seuls le compte rendu et les actions de suivi peuvent encore évoluer."
      );
    }
  }
}

export function preserveMeetingParticipantResponses(
  existingParticipants: Array<{ userId: string; role: string; responseStatus: string }>,
  requestedParticipants: Array<{ userId: string; role?: string; responseStatus?: string }>
) {
  const existingByUser = new Map(existingParticipants.map((participant) => [participant.userId, participant]));
  return requestedParticipants.map((participant) => {
    const existing = existingByUser.get(participant.userId);
    if (!existing) {
      return {
        userId: participant.userId,
        role: participant.role || "PARTICIPANT",
        responseStatus: "INVITED",
      };
    }
    return {
      userId: participant.userId,
      role: existing.role,
      responseStatus: existing.responseStatus,
    };
  });
}

export async function updateEnterpriseRequestCorrection(args: {
  organizationId: string;
  requestId: string;
  actorUserId: string;
  revision: number;
  data: {
    requestType?: string;
    title?: string;
    description?: string;
    priority?: string;
    assignedToUserId?: string | null;
    departmentId?: string | null;
    dueAt?: Date | null;
  };
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRequest.findFirst({
      where: {
        id: args.requestId,
        organizationId: args.organizationId,
        archivedAt: null,
        status: "CORRECTION_REQUESTED",
      },
    });
    if (!existing) {
      throw new WorkCoordinationHotfixError(
        "REQUEST_CORRECTION_NOT_EDITABLE",
        409,
        "Cette demande n’attend plus de correction. Actualisez la page."
      );
    }
    if (existing.requestedByUserId !== args.actorUserId) {
      throw new WorkCoordinationHotfixError(
        "REQUEST_CORRECTION_FORBIDDEN",
        403,
        "Seul le demandeur peut modifier le contenu demandé en correction."
      );
    }
    if (args.data.requestType && args.data.requestType !== existing.requestType && !(REQUEST_TYPES as readonly string[]).includes(args.data.requestType)) {
      throw new WorkCoordinationHotfixError(
        "INVALID_REQUEST_TYPE",
        400,
        "Le nouveau type de demande doit appartenir au catalogue standard."
      );
    }
    if (args.data.assignedToUserId) {
      const member = await tx.organizationMember.findFirst({
        where: { organizationId: args.organizationId, userId: args.data.assignedToUserId, status: "ACTIVE", removedAt: null },
        select: { userId: true },
      });
      if (!member) {
        throw new WorkCoordinationHotfixError(
          "INVALID_ENTERPRISE_MEMBER",
          400,
          "Le collaborateur sélectionné n’est pas un membre actif de cette entreprise."
        );
      }
    }
    if (args.data.departmentId) {
      const department = await tx.enterpriseDepartment.findFirst({
        where: { id: args.data.departmentId, organizationId: args.organizationId, isActive: true },
        select: { id: true },
      });
      if (!department) {
        throw new WorkCoordinationHotfixError(
          "INVALID_ENTERPRISE_DEPARTMENT",
          400,
          "Le département sélectionné n’appartient pas à cette entreprise ou n’est plus actif."
        );
      }
    }
    const updated = await tx.enterpriseRequest.updateMany({
      where: {
        id: existing.id,
        organizationId: args.organizationId,
        status: "CORRECTION_REQUESTED",
        revision: args.revision,
        archivedAt: null,
      },
      data: {
        ...(args.data.requestType !== undefined ? { requestType: args.data.requestType } : {}),
        ...(args.data.title !== undefined ? { title: args.data.title } : {}),
        ...(args.data.description !== undefined ? { description: args.data.description } : {}),
        ...(args.data.priority !== undefined ? { priority: args.data.priority } : {}),
        ...(args.data.assignedToUserId !== undefined ? { assignedToUserId: normalizeNullable(args.data.assignedToUserId) } : {}),
        ...(args.data.departmentId !== undefined ? { departmentId: normalizeNullable(args.data.departmentId) } : {}),
        ...(args.data.dueAt !== undefined ? { dueAt: args.data.dueAt } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new WorkCoordinationHotfixError(
        "REVISION_CONFLICT",
        409,
        "La demande a changé pendant la correction. Actualisez avant de réessayer."
      );
    }
    const saved = await tx.enterpriseRequest.findUnique({ where: { id: existing.id } });
    await tx.enterpriseOperationalEvent.create({
      data: {
        organizationId: args.organizationId,
        entityType: "EnterpriseRequest",
        entityId: existing.id,
        eventType: "ENTERPRISE_REQUEST_CORRECTION_UPDATED",
        summary: "Contenu de la demande corrigé avant resoumission.",
        actorUserId: args.actorUserId,
        fromStatus: existing.status,
        toStatus: existing.status,
      },
    });
    return saved;
  });
}

function normalizeNullable(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
