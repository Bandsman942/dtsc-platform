import { UserRole, type CollaboratorAvailability, type Prisma } from "@prisma/client";
import { canUseFeature } from "@/lib/billing/entitlements";
import { normalizePositionCode } from "@/lib/business-roles";
import { notifyUsers } from "@/lib/notifications";
import { DTSC_INTERNAL_ORGANIZATION_ID, getActiveOrganizationId, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export type CalendarContext = Awaited<ReturnType<typeof getCalendarContext>>;

export function canAccessInternalCalendar(user: { role: UserRole }, session?: Pick<SessionPayload, "activeContext" | "activeOrganizationId"> | null) {
  return user.role !== UserRole.CLIENT || session?.activeContext === "ORGANIZATION";
}

export async function canUseInternalCalendarFeature(context: Pick<CalendarContext, "activeOrganizationId" | "dtscInternal">) {
  if (context.dtscInternal) {
    return { allowed: true, message: "Accès autorisé.", code: "OK" as const };
  }
  return canUseFeature(context.activeOrganizationId, "calendar");
}

export async function getCalendarContext(
  user: { id: string; role: UserRole },
  session?: Pick<SessionPayload, "activeContext" | "activeOrganizationId" | "activeOrganizationRole"> | null,
) {
  const activeOrganizationId = getActiveOrganizationId(session) || (isDtscInternalSession(session) ? DTSC_INTERNAL_ORGANIZATION_ID : null);
  const dtscInternal = isDtscInternalSession(session);
  const employee = dtscInternal
    ? await prisma.hrcfoEmployee.findFirst({
        where: { userId: user.id, status: { not: "EXITED" } },
        include: { position: true },
      })
    : null;
  const organizationMember = !dtscInternal && activeOrganizationId
    ? await prisma.organizationMember.findFirst({
        where: {
          organizationId: activeOrganizationId,
          userId: user.id,
          status: "ACTIVE",
          removedAt: null,
          organization: { status: "ACTIVE", deletedAt: null },
        },
      })
    : null;
  const positionCode = normalizePositionCode(employee?.position?.code || employee?.positionCode || employee?.jobTitle || "");
  const organizationRole = organizationMember?.role || session?.activeOrganizationRole || null;
  const canViewOrganizationGlobal = organizationRole === "OWNER" || organizationRole === "ADMIN_ENTREPRISE" || organizationRole === "ADMIN_ENTERPRISE" || organizationRole === "MANAGER";
  const canViewGlobal = dtscInternal
    ? user.role === "ADMIN" || positionCode === "CEO" || positionCode === "COO"
    : canViewOrganizationGlobal;
  const canViewPeopleAvailability = dtscInternal && user.role === UserRole.SUPPORT;
  const canManagePeople = canViewGlobal || positionCode === "HR_CFO";
  const canOverrideConflicts = dtscInternal
    ? user.role === "ADMIN" || positionCode === "CEO" || positionCode === "COO" || positionCode === "HR_CFO"
    : canViewOrganizationGlobal;

  return {
    userId: user.id,
    role: user.role,
    activeOrganizationId,
    dtscInternal,
    employee,
    organizationMember,
    calendarCollaboratorId: dtscInternal ? employee?.id || null : organizationMember?.id || null,
    positionCode,
    canViewGlobal,
    canViewPeopleAvailability,
    canManagePeople,
    canOverrideConflicts,
  };
}

export function internalCalendarAccessWhere(context: CalendarContext): Prisma.InternalCalendarEventWhereInput {
  if (context.canViewGlobal) {
    return { organizationId: context.activeOrganizationId, deletedAt: null };
  }

  const employeeId = context.calendarCollaboratorId || "__no_employee__";
  const departmentId = context.employee?.departmentId || "__no_department__";
  return {
    organizationId: context.activeOrganizationId,
    deletedAt: null,
    OR: [
      { createdBy: context.userId },
      { ownerCollaboratorId: employeeId },
      { visibility: "Public interne" },
      { visibility: "Département", departmentId },
      { visibility: "Participants", participants: { some: { collaboratorId: employeeId, participantStatus: "Actif" } } },
    ],
  };
}

export function canManageCollaboratorCalendar(context: CalendarContext, collaboratorId?: string | null) {
  if (!collaboratorId) {
    return true;
  }
  return context.canManagePeople || context.calendarCollaboratorId === collaboratorId;
}

export function collaboratorAvailabilityWhere(context: CalendarContext, collaboratorId?: string): Prisma.CollaboratorAvailabilityWhereInput {
  const base = { organizationId: context.activeOrganizationId, deletedAt: null };
  if (context.canViewGlobal || context.canManagePeople || context.canViewPeopleAvailability) {
    return { ...base, ...(collaboratorId ? { collaboratorId } : {}) };
  }
  return { ...base, collaboratorId: context.calendarCollaboratorId || "__no_employee__" };
}

export function calendarCollaboratorWhere(context: CalendarContext) {
  if (context.dtscInternal) {
    return context.canViewGlobal || context.canManagePeople || context.canViewPeopleAvailability
      ? { status: { not: "EXITED" as const } }
      : { id: context.employee?.id || "__no_employee__" };
  }
  return context.canViewGlobal || context.canManagePeople
    ? {
        organizationId: context.activeOrganizationId || "__no_organization__",
        status: "ACTIVE",
        removedAt: null,
      }
    : {
        id: context.organizationMember?.id || "__no_member__",
        organizationId: context.activeOrganizationId || "__no_organization__",
        status: "ACTIVE",
        removedAt: null,
      };
}

export async function getCalendarCollaborators(context: CalendarContext) {
  if (context.dtscInternal) {
    return prisma.hrcfoEmployee.findMany({
      where: calendarCollaboratorWhere(context) as Prisma.HrcfoEmployeeWhereInput,
      select: {
        id: true,
        fullName: true,
        email: true,
        department: true,
        departmentId: true,
        jobTitle: true,
        userId: true,
      },
      orderBy: { fullName: "asc" },
      take: 300,
    });
  }

  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: context.activeOrganizationId || "__no_organization__",
      status: "ACTIVE",
      removedAt: null,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    take: 300,
  });
  return members.map((member) => ({
    id: member.id,
    fullName: member.user.name,
    email: member.user.email,
    department: member.role,
    departmentId: null,
    jobTitle: member.role,
    userId: member.userId,
  }));
}

export async function validateCalendarCollaborators(context: CalendarContext, collaboratorIds: string[]) {
  const uniqueIds = [...new Set(collaboratorIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return true;
  }
  if (context.dtscInternal) {
    const count = await prisma.hrcfoEmployee.count({ where: { id: { in: uniqueIds }, status: { not: "EXITED" } } });
    return count === uniqueIds.length;
  }
  const count = await prisma.organizationMember.count({
    where: {
      id: { in: uniqueIds },
      organizationId: context.activeOrganizationId || "__no_organization__",
      status: "ACTIVE",
      removedAt: null,
    },
  });
  return count === uniqueIds.length;
}

export function calendarEventInclude() {
  return {
    participants: true,
    conflicts: { where: { resolved: false }, orderBy: { createdAt: "desc" as const } },
  };
}

export async function detectCalendarConflicts({
  context,
  participantIds,
  startDateTime,
  endDateTime,
  excludeEventId,
}: {
  context?: CalendarContext;
  participantIds: string[];
  startDateTime: Date;
  endDateTime: Date;
  excludeEventId?: string;
}) {
  const calendarContext = context ?? ({ activeOrganizationId: DTSC_INTERNAL_ORGANIZATION_ID, dtscInternal: true } as CalendarContext);
  const uniqueIds = [...new Set(participantIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return [];
  }

  const existingEvents = await prisma.internalCalendarEvent.findMany({
    where: {
      organizationId: calendarContext.activeOrganizationId,
      deletedAt: null,
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
      startDateTime: { lt: endDateTime },
      endDateTime: { gt: startDateTime },
      OR: [
        { ownerCollaboratorId: { in: uniqueIds } },
        { participants: { some: { collaboratorId: { in: uniqueIds }, participantStatus: "Actif" } } },
      ],
    },
    include: { participants: true },
    take: 80,
  });

  const availabilities = await prisma.collaboratorAvailability.findMany({
    where: {
      organizationId: calendarContext.activeOrganizationId,
      collaboratorId: { in: uniqueIds },
      deletedAt: null,
    },
  });
  const collaboratorNames = await calendarCollaboratorNames(calendarContext, uniqueIds);

  const conflicts: Array<{
    collaboratorId: string;
    conflictType: string;
    conflictWithEventId?: string;
    conflictWithAvailabilityId?: string;
    severity: string;
    message: string;
  }> = [];

  for (const collaboratorId of uniqueIds) {
    const overlappingEvent = existingEvents.find((event) =>
      event.ownerCollaboratorId === collaboratorId || event.participants.some((participant) => participant.collaboratorId === collaboratorId)
    );
    if (overlappingEvent) {
      const name = collaboratorNames.get(collaboratorId) || "Ce collaborateur";
      conflicts.push({
        collaboratorId,
        conflictType: "Chevauchement événement",
        conflictWithEventId: overlappingEvent.id,
        severity: "Avertissement",
        message: `${name} a déjà « ${overlappingEvent.title} » sur ce créneau.`,
      });
    }

    const collaboratorAvailabilities = availabilities.filter((availability) =>
      availability.collaboratorId === collaboratorId && availabilityAppliesToDate(availability, startDateTime)
    );
    const eventStart = timeValue(startDateTime);
    const eventEnd = timeValue(endDateTime);
    const blockingAvailability = collaboratorAvailabilities.find((availability) =>
      ["Absent", "Congé", "Indisponible", "Mission"].includes(availability.availabilityStatus) &&
      timeStringValue(availability.startTime) < eventEnd &&
      timeStringValue(availability.endTime) > eventStart
    );
    if (blockingAvailability) {
      const name = collaboratorNames.get(collaboratorId) || "Ce collaborateur";
      conflicts.push({
        collaboratorId,
        conflictType: blockingAvailability.availabilityStatus,
        conflictWithAvailabilityId: blockingAvailability.id,
        severity: blockingAvailability.availabilityStatus === "Congé" || blockingAvailability.availabilityStatus === "Absent" ? "Bloquant" : "Avertissement",
        message: `${name} sera indisponible: disponibilité marquée « ${blockingAvailability.availabilityStatus} » pour ce jour (${blockingAvailability.startTime}-${blockingAvailability.endTime}).`,
      });
      continue;
    }

    const coversSlot = collaboratorAvailabilities.some((availability) =>
      ["Disponible", "Télétravail", "Sur site"].includes(availability.availabilityStatus) &&
      timeStringValue(availability.startTime) <= eventStart &&
      timeStringValue(availability.endTime) >= eventEnd
    );
    if (collaboratorAvailabilities.length > 0 && !coversSlot) {
      const name = collaboratorNames.get(collaboratorId) || "Ce collaborateur";
      conflicts.push({
        collaboratorId,
        conflictType: "Hors horaires disponibles",
        severity: "Info",
        message: `${name} n'a pas de plage disponible couvrant entièrement ce créneau.`,
      });
    }
  }

  return conflicts;
}

export async function notifyCalendarParticipants({
  context,
  participantIds,
  title,
  body,
  targetUrl,
}: {
  context: CalendarContext;
  participantIds: string[];
  title: string;
  body: string;
  targetUrl: string;
}) {
  const uniqueIds = [...new Set(participantIds)];
  const userIds = context.dtscInternal
    ? (await prisma.hrcfoEmployee.findMany({
        where: { id: { in: uniqueIds }, status: { not: "EXITED" }, userId: { not: null } },
        select: { userId: true },
      })).map((employee) => employee.userId).filter((userId): userId is string => Boolean(userId))
    : (await prisma.organizationMember.findMany({
        where: { id: { in: uniqueIds }, organizationId: context.activeOrganizationId || "__no_organization__", status: "ACTIVE", removedAt: null },
        select: { userId: true },
      })).map((member) => member.userId);
  await notifyUsers({ userIds, title, body, type: "CALENDAR", targetUrl, organizationId: context.activeOrganizationId });
}

async function calendarCollaboratorNames(context: CalendarContext, collaboratorIds: string[]) {
  if (context.dtscInternal) {
    const collaborators = await prisma.hrcfoEmployee.findMany({
      where: { id: { in: collaboratorIds } },
      select: { id: true, fullName: true },
    });
    return new Map(collaborators.map((collaborator) => [collaborator.id, collaborator.fullName]));
  }
  const members = await prisma.organizationMember.findMany({
    where: { id: { in: collaboratorIds }, organizationId: context.activeOrganizationId || "__no_organization__" },
    include: { user: { select: { name: true } } },
  });
  return new Map(members.map((member) => [member.id, member.user.name]));
}

function timeValue(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function timeStringValue(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function availabilityAppliesToDate(
  availability: Pick<CollaboratorAvailability, "dayOfWeek" | "specificDate" | "recurrenceType" | "recurrenceStart" | "recurrenceUntil" | "recurrenceInterval">,
  date: Date
) {
  const day = startOfCalendarDay(date);
  if (availability.recurrenceUntil && day.getTime() > startOfCalendarDay(availability.recurrenceUntil).getTime()) {
    return false;
  }

  if (availability.specificDate) {
    return sameCalendarDay(availability.specificDate, day);
  }

  const recurrenceStart = availability.recurrenceStart ? startOfCalendarDay(availability.recurrenceStart) : null;
  if (recurrenceStart && day.getTime() < recurrenceStart.getTime()) {
    return false;
  }

  const interval = Math.max(1, availability.recurrenceInterval || 1);
  if (availability.recurrenceType === "Quotidienne") {
    return !recurrenceStart || daysBetween(recurrenceStart, day) % interval === 0;
  }

  if (availability.recurrenceType === "Mensuelle") {
    if (!recurrenceStart) {
      return typeof availability.dayOfWeek === "number" ? availability.dayOfWeek === day.getDay() : true;
    }
    return day.getDate() === recurrenceStart.getDate() && monthsBetween(recurrenceStart, day) % interval === 0;
  }

  if (availability.recurrenceType === "Hebdomadaire") {
    if (typeof availability.dayOfWeek !== "number" || availability.dayOfWeek !== day.getDay()) {
      return false;
    }
    return !recurrenceStart || Math.floor(daysBetween(recurrenceStart, day) / 7) % interval === 0;
  }

  return typeof availability.dayOfWeek === "number" && availability.dayOfWeek === day.getDay();
}

function startOfCalendarDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function sameCalendarDay(left: Date, right: Date) {
  return startOfCalendarDay(left).getTime() === startOfCalendarDay(right).getTime();
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((startOfCalendarDay(end).getTime() - startOfCalendarDay(start).getTime()) / 86_400_000);
}

function monthsBetween(start: Date, end: Date) {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}
