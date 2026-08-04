import type { Prisma } from "@prisma/client";
import { DTSC_SPECIAL_PERMISSIONS, hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import type { CalendarContext } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";

export async function canManageCalendarResources(context: CalendarContext) {
  if (!context.activeOrganizationId) return false;
  if (!context.dtscInternal) return context.canManagePeople;
  if (context.role === "ADMIN" || context.positionCode === "CEO" || context.positionCode === "COO") return true;
  return hasDtscIndividualPermission(context.userId, DTSC_SPECIAL_PERMISSIONS.MANAGE_CALENDAR_RESOURCES);
}

export function calendarResourceReservationConflictWhere({
  organizationId,
  resourceId,
  startsAt,
  endsAt,
  excludeReservationId,
}: {
  organizationId: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  excludeReservationId?: string;
}): Prisma.CalendarResourceReservationWhereInput {
  return {
    organizationId,
    resourceId,
    status: "CONFIRMED",
    canceledAt: null,
    ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    startsAt: { lt: endsAt },
    endsAt: { gt: startsAt },
  };
}

export async function listCalendarResources(organizationId: string) {
  const resources = await prisma.calendarResource.findMany({
    where: { organizationId, isActive: true, archivedAt: null },
    orderBy: [{ resourceType: "asc" }, { name: "asc" }],
    take: 300,
  });
  const reservations = resources.length
    ? await prisma.calendarResourceReservation.findMany({
        where: {
          organizationId,
          resourceId: { in: resources.map((resource) => resource.id) },
          status: "CONFIRMED",
          canceledAt: null,
          endsAt: { gte: new Date() },
        },
        orderBy: { startsAt: "asc" },
        take: 1000,
      })
    : [];
  return resources.map((resource) => ({
    ...resource,
    reservations: reservations.filter((reservation) => reservation.resourceId === resource.id).slice(0, 20),
  }));
}

export async function evaluateOperationalSlaInstances(now = new Date()) {
  const instances = await prisma.operationalSlaInstance.findMany({
    where: { status: { in: ["RUNNING", "WARNING"] }, completedAt: null },
    orderBy: { dueAt: "asc" },
    take: 1000,
  });
  const policies = instances.length
    ? await prisma.operationalSlaPolicy.findMany({ where: { id: { in: [...new Set(instances.map((instance) => instance.policyId))] } } })
    : [];
  const policiesById = new Map(policies.map((policy) => [policy.id, policy]));
  const updates: Array<{ id: string; status: string }> = [];
  for (const instance of instances) {
    const policy = policiesById.get(instance.policyId);
    if (!policy) continue;
    const warningAt = policy.warningMinutes ? new Date(instance.dueAt.getTime() - policy.warningMinutes * 60_000) : null;
    let status = instance.status;
    if (instance.dueAt <= now) status = "BREACHED";
    else if (warningAt && warningAt <= now) status = "WARNING";
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
    updates.push({ id: instance.id, status });
  }
  return updates;
}
