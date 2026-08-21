import { UserRole } from "@prisma/client";
import { DTSC_SPECIAL_PERMISSIONS, hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import { getOperationalActor, OPERATIONAL_OBJECT_TYPES, resolveOperationalObjectAccess, type OperationalObjectType } from "@/lib/operational-access";
import {
  getOperationalSlaReference,
  isOperationalSlaObjectType,
  type OperationalSlaObjectType,
} from "@/lib/operational-sla-reference";
import { prisma } from "@/lib/prisma";

export type OperationalSlaTarget = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
};

type OperationalSlaPolicyFilters = {
  priority: string | null;
  startStatus: string | null;
  stopStatuses: string[];
  compatibility: {
    invalidPriority: string | null;
    invalidStartStatus: string | null;
    invalidStopStatuses: string[];
  };
};

type OperationalSlaPolicyLike = {
  objectType: string;
  priority: string | null;
  startStatus: string | null;
  stopStatusesJson: unknown;
};

export async function canManageOperationalSla(user: { id: string; role: UserRole }) {
  if (user.role === UserRole.ADMIN) return true;
  const actor = await getOperationalActor(user);
  if (actor.positionCode === "CEO" || actor.positionCode === "COO") return true;
  return hasDtscIndividualPermission(user.id, DTSC_SPECIAL_PERMISSIONS.MANAGE_OPERATIONAL_SLA);
}

export function resolveOperationalSlaPolicyFilters(policy: OperationalSlaPolicyLike): OperationalSlaPolicyFilters {
  const reference = getOperationalSlaReference(policy.objectType);
  const rawPriority = policy.priority?.trim() || "";
  const rawStartStatus = policy.startStatus?.trim() || "";
  const rawStopStatuses = stringArray(policy.stopStatusesJson);
  if (!reference) {
    return {
      priority: null,
      startStatus: null,
      stopStatuses: [],
      compatibility: {
        invalidPriority: rawPriority || null,
        invalidStartStatus: rawStartStatus || null,
        invalidStopStatuses: rawStopStatuses,
      },
    };
  }
  const priority = rawPriority && reference.priorities.includes(rawPriority) ? rawPriority : null;
  const startStatus = rawStartStatus && reference.statuses.includes(rawStartStatus) ? rawStartStatus : null;
  const stopStatuses = rawStopStatuses.filter((status) => reference.statuses.includes(status));
  return {
    priority,
    startStatus,
    stopStatuses,
    compatibility: {
      invalidPriority: rawPriority && !priority ? rawPriority : null,
      invalidStartStatus: rawStartStatus && !startStatus ? rawStartStatus : null,
      invalidStopStatuses: rawStopStatuses.filter((status) => !reference.statuses.includes(status)),
    },
  };
}

export function matchOperationalSlaPolicy(
  policy: OperationalSlaPolicyLike,
  target: Pick<OperationalSlaTarget, "status" | "priority">,
) {
  const filters = resolveOperationalSlaPolicyFilters(policy);
  if (filters.priority && target.priority !== filters.priority) return { matches: false as const, reason: "PRIORITY" as const, filters };
  if (filters.startStatus && target.status !== filters.startStatus) return { matches: false as const, reason: "START_STATUS" as const, filters };
  if (filters.stopStatuses.includes(target.status)) return { matches: false as const, reason: "STOP_STATUS" as const, filters };
  return { matches: true as const, reason: null, filters };
}

export async function bindOperationalSlaInstance({
  user,
  policyId,
  objectType,
  objectId,
  responsibleUserId,
}: {
  user: { id: string; role: UserRole };
  policyId: string;
  objectType: OperationalObjectType;
  objectId: string;
  responsibleUserId?: string | null;
}) {
  if (!OPERATIONAL_OBJECT_TYPES.includes(objectType)) throw new Error("SLA_OBJECT_TYPE_UNSUPPORTED");
  const actor = await getOperationalActor(user);
  const access = await resolveOperationalObjectAccess({ actor, objectType, objectId, action: "read" });
  if (!access.allowed || !access.object) throw new Error("SLA_OBJECT_FORBIDDEN");
  const policy = await prisma.operationalSlaPolicy.findFirst({ where: { id: policyId, objectType, isActive: true, archivedAt: null } });
  if (!policy) throw new Error("SLA_POLICY_NOT_FOUND");

  const target = targetFromRecord(objectType, objectId, access.object as unknown as Record<string, unknown>);
  const match = matchOperationalSlaPolicy(policy, target);
  if (!match.matches) {
    if (match.reason === "PRIORITY") throw new Error("SLA_POLICY_PRIORITY_MISMATCH");
    if (match.reason === "START_STATUS") throw new Error("SLA_POLICY_START_STATUS_MISMATCH");
    throw new Error("SLA_POLICY_STOP_STATUS_REACHED");
  }

  const startedAt = new Date();
  const dueAt = new Date(startedAt.getTime() + policy.targetMinutes * 60_000);
  return prisma.operationalSlaInstance.upsert({
    where: { policyId_objectType_objectId: { policyId, objectType, objectId } },
    update: { responsibleUserId: responsibleUserId || null, startedAt, dueAt, warnedAt: null, breachedAt: null, completedAt: null, pausedAt: null, status: "RUNNING", lastEvaluatedAt: startedAt },
    create: { organizationId: policy.organizationId, policyId, objectType, objectId, responsibleUserId: responsibleUserId || null, startedAt, dueAt, status: "RUNNING", lastEvaluatedAt: startedAt },
  });
}

export async function listOperationalSlaTargets({
  user,
  objectType,
}: {
  user: { id: string; role: UserRole };
  objectType: OperationalObjectType;
}) {
  const targets = await readOperationalSlaTargets(objectType);
  const actor = await getOperationalActor(user);
  const canReadAll = actor.role === UserRole.ADMIN || actor.positionCode === "CEO" || actor.positionCode === "COO";
  if (canReadAll) return targets;

  const access = await Promise.all(targets.map(async (target) => ({
    target,
    allowed: (await resolveOperationalObjectAccess({ actor, objectType, objectId: target.id, action: "read" })).allowed,
  })));
  return access.filter((entry) => entry.allowed).map((entry) => entry.target);
}

export async function evaluateSlaInstances({ organizationId, now = new Date() }: { organizationId?: string | null; now?: Date }) {
  const instances = await prisma.operationalSlaInstance.findMany({
    where: { ...(organizationId ? { organizationId } : {}), status: { in: ["RUNNING", "WARNING"] }, completedAt: null },
    orderBy: { dueAt: "asc" },
    take: 1000,
  });
  const policies = instances.length ? await prisma.operationalSlaPolicy.findMany({ where: { id: { in: [...new Set(instances.map((instance) => instance.policyId))] } } }) : [];
  const policiesById = new Map(policies.map((policy) => [policy.id, policy]));
  const stateByKey = await loadOperationalSlaStateMap(instances.map((instance) => ({ objectType: instance.objectType, objectId: instance.objectId })));
  const results: Array<{ id: string; status: string; dueAt: Date }> = [];

  for (const instance of instances) {
    const policy = policiesById.get(instance.policyId);
    if (!policy) continue;
    const target = stateByKey.get(stateKey(instance.objectType, instance.objectId));
    const filters = resolveOperationalSlaPolicyFilters(policy);
    if (target && filters.stopStatuses.includes(target.status)) {
      await prisma.operationalSlaInstance.update({
        where: { id: instance.id },
        data: { status: "COMPLETED", completedAt: now, lastEvaluatedAt: now },
      });
      results.push({ id: instance.id, status: "COMPLETED", dueAt: instance.dueAt });
      continue;
    }

    const warningAt = policy.warningMinutes ? new Date(instance.dueAt.getTime() - policy.warningMinutes * 60_000) : null;
    const status = instance.dueAt <= now ? "BREACHED" : warningAt && warningAt <= now ? "WARNING" : "RUNNING";
    if (status !== instance.status || !instance.lastEvaluatedAt) {
      await prisma.operationalSlaInstance.update({
        where: { id: instance.id },
        data: {
          status,
          lastEvaluatedAt: now,
          warnedAt: status === "WARNING" && !instance.warnedAt ? now : undefined,
          breachedAt: status === "BREACHED" && !instance.breachedAt ? now : undefined,
        },
      });
    }
    results.push({ id: instance.id, status, dueAt: instance.dueAt });
  }
  return results;
}

async function loadOperationalSlaStateMap(items: Array<{ objectType: string; objectId: string }>) {
  const grouped = new Map<OperationalSlaObjectType, string[]>();
  for (const item of items) {
    if (!isOperationalSlaObjectType(item.objectType)) continue;
    const ids = grouped.get(item.objectType) || [];
    ids.push(item.objectId);
    grouped.set(item.objectType, ids);
  }
  const batches = await Promise.all([...grouped.entries()].map(async ([objectType, ids]) => [objectType, await readOperationalSlaTargets(objectType, [...new Set(ids)])] as const));
  const result = new Map<string, OperationalSlaTarget>();
  for (const [objectType, targets] of batches) {
    for (const target of targets) result.set(stateKey(objectType, target.id), target);
  }
  return result;
}

async function readOperationalSlaTargets(objectType: OperationalSlaObjectType, ids?: string[]): Promise<OperationalSlaTarget[]> {
  const where = ids?.length ? { id: { in: ids } } : undefined;
  const take = ids?.length ? undefined : 100;

  if (objectType === "CALENDAR_EVENT") {
    const records = await prisma.internalCalendarEvent.findMany({ where: ids?.length ? { id: { in: ids }, deletedAt: null } : { deletedAt: null }, select: { id: true, title: true, status: true, priority: true }, take });
    return records.map((record) => ({ ...record, priority: record.priority || null }));
  }
  if (objectType === "TASK") {
    const records = await prisma.cooTask.findMany({ where, select: { id: true, title: true, status: true, priority: true }, take });
    return records.map((record) => ({ ...record, priority: record.priority || null }));
  }
  if (objectType === "OPERATION") {
    const records = await prisma.cooOperation.findMany({ where, select: { id: true, title: true, status: true, priority: true }, take });
    return records.map((record) => ({ ...record, priority: record.priority || null }));
  }
  if (objectType === "DEPARTMENT_REQUEST") {
    const records = await prisma.cooDepartmentRequest.findMany({ where, select: { id: true, subject: true, status: true, priority: true }, take });
    return records.map((record) => ({ id: record.id, title: record.subject, status: record.status, priority: record.priority || null }));
  }
  if (objectType === "BLOCKER") {
    const records = await prisma.cooBlocker.findMany({ where, select: { id: true, title: true, status: true, severity: true }, take });
    return records.map((record) => ({ id: record.id, title: record.title, status: record.status, priority: record.severity || null }));
  }
  if (objectType === "MEETING") {
    const records = await prisma.cooMeeting.findMany({ where, select: { id: true, title: true, status: true }, take });
    return records.map((record) => ({ ...record, priority: null }));
  }
  if (objectType === "COLLAB_REQUEST") {
    const records = await prisma.collaboratorRequest.findMany({ where, select: { id: true, title: true, status: true, priority: true }, take });
    return records.map((record) => ({ ...record, priority: record.priority || null }));
  }
  if (objectType === "CEO_OBJECTIVE") {
    const records = await prisma.ceoObjective.findMany({ where, select: { id: true, title: true, status: true, priority: true }, take });
    return records.map((record) => ({ ...record, priority: record.priority || null }));
  }
  if (objectType === "CEO_SUPERVISION") {
    const records = await prisma.ceoSupervisionLog.findMany({ where, select: { id: true, title: true, status: true, priority: true }, take });
    return records.map((record) => ({ ...record, priority: record.priority || null }));
  }
  if (objectType === "SCO_PURCHASE_REQUEST") {
    const records = await prisma.scoPurchaseRequest.findMany({ where, select: { id: true, title: true, status: true, urgency: true }, take });
    return records.map((record) => ({ id: record.id, title: record.title, status: record.status, priority: record.urgency || null }));
  }
  if (objectType === "SCO_LOGISTICS") {
    const records = await prisma.scoLogisticsEvent.findMany({ where, select: { id: true, title: true, status: true }, take });
    return records.map((record) => ({ ...record, priority: null }));
  }
  if (objectType === "MPO_PROJECT") {
    const records = await prisma.mpoProject.findMany({ where, select: { id: true, title: true, status: true, priority: true }, take });
    return records.map((record) => ({ ...record, priority: record.priority || null }));
  }
  if (objectType === "MPO_RECORD") {
    const records = await prisma.mpoProjectRecord.findMany({ where, select: { id: true, title: true, status: true, priority: true }, take });
    return records.map((record) => ({ ...record, priority: record.priority || null }));
  }
  if (objectType === "CTO_PROJECT") {
    const records = await prisma.ctoTechnicalProject.findMany({ where, select: { id: true, title: true, status: true, priority: true }, take });
    return records.map((record) => ({ ...record, priority: record.priority || null }));
  }
  const records = await prisma.ctoTechnicalRecord.findMany({ where, select: { id: true, title: true, status: true, priority: true }, take });
  return records.map((record) => ({ ...record, priority: record.priority || null }));
}

function targetFromRecord(objectType: OperationalObjectType, objectId: string, record: Record<string, unknown>): OperationalSlaTarget {
  const reference = getOperationalSlaReference(objectType);
  const priorityField = reference?.priorityField;
  return {
    id: objectId,
    title: String(record.title || record.subject || objectId),
    status: String(record.status || ""),
    priority: priorityField ? String(record[priorityField] || "") || null : null,
  };
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

function stateKey(objectType: string, objectId: string) {
  return `${objectType}:${objectId}`;
}
