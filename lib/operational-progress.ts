import type { Prisma } from "@prisma/client";
import type { OperationalObjectType } from "@/lib/operational-access";
import { prisma } from "@/lib/prisma";

const TERMINAL_TASK_STATUSES = new Set(["COMPLETED", "VALIDATED", "CANCELED", "CANCELLED"]);

const CLOSURE_STATUSES: Partial<Record<OperationalObjectType, ReadonlySet<string>>> = {
  TASK: new Set(["COMPLETED", "PENDING_VALIDATION", "VALIDATED"]),
  OPERATION: new Set(["COMPLETED"]),
  DEPARTMENT_REQUEST: new Set(["DONE"]),
  BLOCKER: new Set(["RESOLVED"]),
  MEETING: new Set(["CLOSED"]),
  COLLAB_REQUEST: new Set(["TREATED"]),
  CEO_OBJECTIVE: new Set(["ACHIEVED"]),
  CEO_SUPERVISION: new Set(["DONE", "ARCHIVED"]),
  SCO_PURCHASE_REQUEST: new Set(["RECEIVED"]),
  SCO_LOGISTICS: new Set(["COMPLETED"]),
  MPO_PROJECT: new Set(["CLOSED"]),
  MPO_RECORD: new Set(["DELIVERED", "ARCHIVED"]),
  CTO_PROJECT: new Set(["DELIVERED", "CLOSED"]),
  CTO_RECORD: new Set(["VALIDATED", "ARCHIVED"]),
};

type DatabaseClient = Prisma.TransactionClient | typeof prisma;

export type DerivedProgress = {
  completed: number;
  total: number;
  progress: number;
  openLinkedTasks: number;
};

export function isTerminalTaskStatus(status: string) {
  return TERMINAL_TASK_STATUSES.has(normalizeStatus(status));
}

export function requiresChecklistClosure(objectType: OperationalObjectType, nextStatus: string) {
  return CLOSURE_STATUSES[objectType]?.has(normalizeStatus(nextStatus)) ?? false;
}

export async function calculateDerivedOperationalProgress(
  objectType: OperationalObjectType,
  objectId: string,
  db: DatabaseClient = prisma,
): Promise<DerivedProgress> {
  const checklist = await db.operationalChecklistItem.findMany({
    where: { objectType, objectId, deletedAt: null },
    select: { completed: true },
  });
  let completed = checklist.filter((item) => item.completed).length;
  let total = checklist.length;
  let openLinkedTasks = 0;

  if (objectType === "OPERATION") {
    const linkedTasks = await db.cooTask.findMany({
      where: { operationId: objectId },
      select: { status: true },
    });
    total += linkedTasks.length;
    const completedTasks = linkedTasks.filter((task) => isTerminalTaskStatus(task.status)).length;
    completed += completedTasks;
    openLinkedTasks = linkedTasks.length - completedTasks;
  }

  return {
    completed,
    total,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    openLinkedTasks,
  };
}

export async function validateOperationalClosure(
  objectType: OperationalObjectType,
  objectId: string,
  nextStatus: string,
  db: DatabaseClient = prisma,
) {
  const normalizedStatus = normalizeStatus(nextStatus);

  if (objectType === "OPERATION" && normalizedStatus === "CANCELED") {
    const openLinkedTasks = await db.cooTask.count({
      where: { operationId: objectId, status: { notIn: [...TERMINAL_TASK_STATUSES] } },
    });
    return openLinkedTasks > 0
      ? "Annulez, terminez ou validez d’abord toutes les tâches ouvertes liées à cette opération."
      : null;
  }

  if (!requiresChecklistClosure(objectType, normalizedStatus)) return null;

  const derived = await calculateDerivedOperationalProgress(objectType, objectId, db);
  if (derived.openLinkedTasks > 0) {
    return "Toutes les tâches liées doivent être terminées, validées ou annulées avant de clôturer cette opération.";
  }
  if (derived.total === 0) {
    return "Ajoutez au moins une tâche ou un résultat à cocher avant de clôturer cet élément.";
  }
  if (derived.progress < 100) {
    return "Toutes les tâches et tous les résultats à cocher doivent être terminés avant cette clôture.";
  }
  return null;
}

export async function syncDerivedOperationalProgress(
  objectType: OperationalObjectType,
  objectId: string,
  db: DatabaseClient = prisma,
) {
  const derived = await calculateDerivedOperationalProgress(objectType, objectId, db);

  if (objectType === "TASK") {
    const task = await db.cooTask.update({ where: { id: objectId }, data: { progress: derived.progress }, select: { operationId: true } });
    if (task.operationId) await syncDerivedOperationalProgress("OPERATION", task.operationId, db);
  } else if (objectType === "OPERATION") {
    await db.cooOperation.update({ where: { id: objectId }, data: { progress: derived.progress } });
  } else if (objectType === "CEO_OBJECTIVE") {
    await db.ceoObjective.update({ where: { id: objectId }, data: { progress: derived.progress } });
  } else if (objectType === "MPO_RECORD") {
    await db.mpoProjectRecord.update({ where: { id: objectId }, data: { progress: derived.progress } });
  } else if (objectType === "CTO_RECORD") {
    await db.ctoTechnicalRecord.update({ where: { id: objectId }, data: { progress: derived.progress } });
  }

  return derived;
}

function normalizeStatus(value: string) {
  return value.trim().toUpperCase().replaceAll(" ", "_").replaceAll("É", "E");
}
