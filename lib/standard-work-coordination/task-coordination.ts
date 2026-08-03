import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getEnterpriseCoreV2Access, canMutateOwnedObject, enterpriseTaskVisibilityWhere } from "@/lib/enterprise/core-v2/access";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export const taskCoordinationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ADD_CHECKLIST"), title: z.string().trim().min(1).max(240), position: z.coerce.number().int().min(0).max(10000).default(0) }),
  z.object({ action: z.literal("TOGGLE_CHECKLIST"), checklistItemId: z.string().cuid(), completed: z.boolean() }),
  z.object({ action: z.literal("DELETE_CHECKLIST"), checklistItemId: z.string().cuid() }),
  z.object({ action: z.literal("ADD_DEPENDENCY"), predecessorTaskId: z.string().cuid(), dependencyType: z.enum(["BLOCKS", "FINISH_TO_START"]).default("BLOCKS") }),
  z.object({ action: z.literal("REMOVE_DEPENDENCY"), dependencyId: z.string().cuid() }),
  z.object({ action: z.literal("ADD_BLOCKER"), reason: z.string().trim().min(3).max(2000), responsibleUserId: z.string().cuid().nullable().optional() }),
  z.object({ action: z.literal("RESOLVE_BLOCKER"), blockerId: z.string().cuid(), resolutionComment: z.string().trim().min(3).max(2000) }),
]);

export async function getTaskCoordinationContext(args: {
  session: SessionPayload;
  organizationId: string;
  taskId: string;
  action: "read" | "write";
}) {
  const access = await getEnterpriseCoreV2Access({
    session: args.session,
    organizationId: args.organizationId,
    moduleCode: "TASKS_OPERATIONS",
    action: args.action,
  });
  if (!access) return null;
  const task = await prisma.enterpriseTask.findFirst({
    where: {
      id: args.taskId,
      ...enterpriseTaskVisibilityWhere({
        organizationId: args.organizationId,
        userId: args.session.userId,
        canSeeAll: access.canSeeAll,
      }),
    },
    select: {
      id: true,
      organizationId: true,
      title: true,
      status: true,
      createdByUserId: true,
      assignedToUserId: true,
      parentTaskId: true,
      revision: true,
    },
  });
  if (!task) return null;
  const canMutate = canMutateOwnedObject({
    canManage: access.canManage,
    userId: args.session.userId,
    relatedUserIds: [task.createdByUserId, task.assignedToUserId],
  });
  return { access, task, canMutate };
}

export async function loadTaskCoordination(organizationId: string, taskId: string) {
  const [checklist, dependencies, blockers] = await Promise.all([
    prisma.enterpriseTaskChecklistItem.findMany({
      where: { organizationId, taskId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: 300,
    }),
    prisma.enterpriseTaskDependency.findMany({
      where: { organizationId, OR: [{ predecessorId: taskId }, { successorId: taskId }] },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    prisma.enterpriseTaskBlocker.findMany({
      where: { organizationId, taskId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);
  const completed = checklist.filter((item) => item.isCompleted).length;
  return {
    checklist,
    dependencies,
    blockers,
    progress: checklist.length ? Math.round((completed / checklist.length) * 100) : null,
    openBlockerCount: blockers.filter((item) => item.status === "OPEN").length,
  };
}

export async function applyTaskCoordinationAction(args: {
  organizationId: string;
  taskId: string;
  actorUserId: string;
  payload: z.infer<typeof taskCoordinationActionSchema>;
}) {
  const { organizationId, taskId, actorUserId, payload } = args;
  if (payload.action === "ADD_CHECKLIST") {
    return prisma.$transaction(async (tx) => {
      const item = await tx.enterpriseTaskChecklistItem.create({
        data: { organizationId, taskId, title: payload.title, position: payload.position, createdById: actorUserId },
      });
      await addTaskEvent(tx, { organizationId, taskId, actorUserId, eventType: "TASK_CHECKLIST_ITEM_ADDED", summary: `Élément de checklist ajouté : ${payload.title}.` });
      return { item };
    });
  }
  if (payload.action === "TOGGLE_CHECKLIST") {
    return prisma.$transaction(async (tx) => {
      const current = await tx.enterpriseTaskChecklistItem.findFirst({ where: { id: payload.checklistItemId, organizationId, taskId } });
      if (!current) throw new TaskCoordinationError("CHECKLIST_ITEM_NOT_FOUND", 404, "Élément de checklist introuvable.");
      const item = await tx.enterpriseTaskChecklistItem.update({
        where: { id: current.id },
        data: { isCompleted: payload.completed, completedAt: payload.completed ? new Date() : null, completedById: payload.completed ? actorUserId : null },
      });
      await addTaskEvent(tx, { organizationId, taskId, actorUserId, eventType: payload.completed ? "TASK_CHECKLIST_ITEM_COMPLETED" : "TASK_CHECKLIST_ITEM_REOPENED", summary: payload.completed ? `Checklist terminée : ${item.title}.` : `Checklist rouverte : ${item.title}.` });
      return { item };
    });
  }
  if (payload.action === "DELETE_CHECKLIST") {
    return prisma.$transaction(async (tx) => {
      const current = await tx.enterpriseTaskChecklistItem.findFirst({ where: { id: payload.checklistItemId, organizationId, taskId } });
      if (!current) throw new TaskCoordinationError("CHECKLIST_ITEM_NOT_FOUND", 404, "Élément de checklist introuvable.");
      await tx.enterpriseTaskChecklistItem.delete({ where: { id: current.id } });
      await addTaskEvent(tx, { organizationId, taskId, actorUserId, eventType: "TASK_CHECKLIST_ITEM_DELETED", summary: `Élément de checklist supprimé : ${current.title}.` });
      return { deletedId: current.id };
    });
  }
  if (payload.action === "ADD_DEPENDENCY") {
    if (payload.predecessorTaskId === taskId) throw new TaskCoordinationError("DEPENDENCY_CYCLE", 409, "Une tâche ne peut pas dépendre d’elle-même.");
    return prisma.$transaction(async (tx) => {
      const tasks = await tx.enterpriseTask.findMany({
        where: { organizationId, id: { in: [payload.predecessorTaskId, taskId] }, archivedAt: null },
        select: { id: true, title: true },
      });
      if (tasks.length !== 2) throw new TaskCoordinationError("DEPENDENCY_TASK_NOT_FOUND", 404, "Une des tâches liées est introuvable dans cette entreprise.");
      if (await wouldCreateDependencyCycle(tx, organizationId, payload.predecessorTaskId, taskId)) {
        throw new TaskCoordinationError("DEPENDENCY_CYCLE", 409, "Cette dépendance créerait un cycle entre les tâches.");
      }
      const dependency = await tx.enterpriseTaskDependency.create({
        data: { organizationId, predecessorId: payload.predecessorTaskId, successorId: taskId, dependencyType: payload.dependencyType, createdById: actorUserId },
      });
      await addTaskEvent(tx, { organizationId, taskId, actorUserId, eventType: "TASK_DEPENDENCY_ADDED", summary: `Dépendance ajoutée avec la tâche ${payload.predecessorTaskId}.` });
      return { dependency };
    });
  }
  if (payload.action === "REMOVE_DEPENDENCY") {
    return prisma.$transaction(async (tx) => {
      const current = await tx.enterpriseTaskDependency.findFirst({
        where: { id: payload.dependencyId, organizationId, OR: [{ predecessorId: taskId }, { successorId: taskId }] },
      });
      if (!current) throw new TaskCoordinationError("DEPENDENCY_NOT_FOUND", 404, "Dépendance introuvable.");
      await tx.enterpriseTaskDependency.delete({ where: { id: current.id } });
      await addTaskEvent(tx, { organizationId, taskId, actorUserId, eventType: "TASK_DEPENDENCY_REMOVED", summary: "Dépendance de tâche supprimée." });
      return { deletedId: current.id };
    });
  }
  if (payload.action === "ADD_BLOCKER") {
    return prisma.$transaction(async (tx) => {
      if (payload.responsibleUserId) await requireActiveMember(tx, organizationId, payload.responsibleUserId);
      const blocker = await tx.enterpriseTaskBlocker.create({
        data: { organizationId, taskId, reason: payload.reason, responsibleUserId: payload.responsibleUserId || null, createdById: actorUserId },
      });
      const task = await tx.enterpriseTask.findFirst({ where: { id: taskId, organizationId }, select: { status: true, revision: true } });
      if (!task) throw new TaskCoordinationError("TASK_NOT_FOUND", 404, "Tâche introuvable.");
      if (["TODO", "IN_PROGRESS"].includes(task.status)) {
        await tx.enterpriseTask.update({ where: { id: taskId }, data: { status: "BLOCKED", revision: { increment: 1 } } });
      }
      await addTaskEvent(tx, { organizationId, taskId, actorUserId, eventType: "TASK_BLOCKED", summary: `Blocage déclaré : ${payload.reason}.`, fromStatus: task.status, toStatus: "BLOCKED" });
      return { blocker };
    });
  }
  return prisma.$transaction(async (tx) => {
    const current = await tx.enterpriseTaskBlocker.findFirst({ where: { id: payload.blockerId, organizationId, taskId, status: "OPEN" } });
    if (!current) throw new TaskCoordinationError("BLOCKER_NOT_FOUND", 404, "Blocage actif introuvable.");
    const blocker = await tx.enterpriseTaskBlocker.update({
      where: { id: current.id },
      data: { status: "RESOLVED", resolutionComment: payload.resolutionComment, resolvedById: actorUserId, resolvedAt: new Date() },
    });
    const remaining = await tx.enterpriseTaskBlocker.count({ where: { organizationId, taskId, status: "OPEN" } });
    if (!remaining) {
      await tx.enterpriseTask.updateMany({ where: { id: taskId, organizationId, status: "BLOCKED" }, data: { status: "IN_PROGRESS", revision: { increment: 1 } } });
    }
    await addTaskEvent(tx, { organizationId, taskId, actorUserId, eventType: "TASK_BLOCKER_RESOLVED", summary: `Blocage résolu : ${payload.resolutionComment}.`, fromStatus: "BLOCKED", toStatus: remaining ? "BLOCKED" : "IN_PROGRESS" });
    return { blocker };
  });
}

async function wouldCreateDependencyCycle(tx: Prisma.TransactionClient, organizationId: string, predecessorId: string, successorId: string) {
  const edges = await tx.enterpriseTaskDependency.findMany({ where: { organizationId }, select: { predecessorId: true, successorId: true }, take: 10000 });
  const graph = new Map<string, string[]>();
  for (const edge of edges) graph.set(edge.predecessorId, [...(graph.get(edge.predecessorId) || []), edge.successorId]);
  graph.set(predecessorId, [...(graph.get(predecessorId) || []), successorId]);
  const queue = [successorId];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === predecessorId) return true;
    visited.add(current);
    queue.push(...(graph.get(current) || []));
  }
  return false;
}

async function requireActiveMember(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  const member = await tx.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { userId: true } });
  if (!member) throw new TaskCoordinationError("ASSIGNEE_NOT_ALLOWED", 400, "Le responsable du blocage doit être membre actif de cette entreprise.");
}

async function addTaskEvent(tx: Prisma.TransactionClient, input: { organizationId: string; taskId: string; actorUserId: string; eventType: string; summary: string; fromStatus?: string; toStatus?: string }) {
  await tx.enterpriseOperationalEvent.create({
    data: {
      organizationId: input.organizationId,
      entityType: "EnterpriseTask",
      entityId: input.taskId,
      eventType: input.eventType,
      summary: input.summary,
      actorUserId: input.actorUserId,
      fromStatus: input.fromStatus || null,
      toStatus: input.toStatus || null,
    },
  });
}

export class TaskCoordinationError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
  }
}
