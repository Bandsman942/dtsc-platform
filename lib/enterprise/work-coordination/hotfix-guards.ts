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
