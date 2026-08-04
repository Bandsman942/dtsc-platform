import { UserRole } from "@prisma/client";
import { DTSC_SPECIAL_PERMISSIONS, hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import { getOperationalActor, OPERATIONAL_OBJECT_TYPES, resolveOperationalObjectAccess, type OperationalObjectType } from "@/lib/operational-access";
import { prisma } from "@/lib/prisma";

export async function canManageOperationalSla(user: { id: string; role: UserRole }) {
  if (user.role === UserRole.ADMIN) return true;
  const actor = await getOperationalActor(user);
  if (actor.positionCode === "CEO" || actor.positionCode === "COO") return true;
  return hasDtscIndividualPermission(user.id, DTSC_SPECIAL_PERMISSIONS.MANAGE_OPERATIONAL_SLA);
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
  if (!access.allowed) throw new Error("SLA_OBJECT_FORBIDDEN");
  const policy = await prisma.operationalSlaPolicy.findFirst({ where: { id: policyId, objectType, isActive: true, archivedAt: null } });
  if (!policy) throw new Error("SLA_POLICY_NOT_FOUND");
  const startedAt = new Date();
  const dueAt = new Date(startedAt.getTime() + policy.targetMinutes * 60_000);
  return prisma.operationalSlaInstance.upsert({
    where: { policyId_objectType_objectId: { policyId, objectType, objectId } },
    update: { responsibleUserId: responsibleUserId || null, startedAt, dueAt, warnedAt: null, breachedAt: null, completedAt: null, pausedAt: null, status: "RUNNING", lastEvaluatedAt: startedAt },
    create: { organizationId: policy.organizationId, policyId, objectType, objectId, responsibleUserId: responsibleUserId || null, startedAt, dueAt, status: "RUNNING", lastEvaluatedAt: startedAt },
  });
}

export async function evaluateSlaInstances({ organizationId, now = new Date() }: { organizationId?: string | null; now?: Date }) {
  const instances = await prisma.operationalSlaInstance.findMany({
    where: { ...(organizationId ? { organizationId } : {}), status: { in: ["RUNNING", "WARNING"] }, completedAt: null },
    orderBy: { dueAt: "asc" },
    take: 1000,
  });
  const policies = instances.length ? await prisma.operationalSlaPolicy.findMany({ where: { id: { in: [...new Set(instances.map((instance) => instance.policyId))] } } }) : [];
  const policiesById = new Map(policies.map((policy) => [policy.id, policy]));
  const results: Array<{ id: string; status: string; dueAt: Date }> = [];
  for (const instance of instances) {
    const policy = policiesById.get(instance.policyId);
    if (!policy) continue;
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
