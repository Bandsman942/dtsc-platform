import { UserRole, type Prisma } from "@prisma/client";
import { normalizePositionCode } from "@/lib/business-roles";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export type CalendarContext = Awaited<ReturnType<typeof getCalendarContext>>;

export function canAccessInternalCalendar(user: { role: UserRole }) {
  return user.role !== UserRole.CLIENT;
}

export async function getCalendarContext(user: { id: string; role: UserRole }) {
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { userId: user.id, status: { not: "EXITED" } },
    include: { position: true },
  });
  const positionCode = normalizePositionCode(employee?.position?.code || employee?.positionCode || employee?.jobTitle || "");
  const canViewGlobal = user.role === "ADMIN" || positionCode === "CEO" || positionCode === "COO";
  const canManagePeople = canViewGlobal || positionCode === "HR_CFO";
  const canOverrideConflicts = user.role === "ADMIN" || positionCode === "CEO" || positionCode === "COO" || positionCode === "HR_CFO";

  return {
    userId: user.id,
    role: user.role,
    employee,
    positionCode,
    canViewGlobal,
    canManagePeople,
    canOverrideConflicts,
  };
}

export function internalCalendarAccessWhere(context: CalendarContext): Prisma.InternalCalendarEventWhereInput {
  if (context.canViewGlobal) {
    return { deletedAt: null };
  }

  const employeeId = context.employee?.id || "__no_employee__";
  const departmentId = context.employee?.departmentId || "__no_department__";
  return {
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
  return context.canManagePeople || context.employee?.id === collaboratorId;
}

export function calendarEventInclude() {
  return {
    participants: true,
    conflicts: { where: { resolved: false }, orderBy: { createdAt: "desc" as const } },
  };
}

export async function detectCalendarConflicts({
  participantIds,
  startDateTime,
  endDateTime,
  excludeEventId,
}: {
  participantIds: string[];
  startDateTime: Date;
  endDateTime: Date;
  excludeEventId?: string;
}) {
  const uniqueIds = [...new Set(participantIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return [];
  }

  const dayOfWeek = startDateTime.getDay();
  const existingEvents = await prisma.internalCalendarEvent.findMany({
    where: {
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
      collaboratorId: { in: uniqueIds },
      dayOfWeek,
      deletedAt: null,
    },
  });
  const collaborators = await prisma.hrcfoEmployee.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, fullName: true },
  });
  const collaboratorNames = new Map(collaborators.map((collaborator) => [collaborator.id, collaborator.fullName]));

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

    const collaboratorAvailabilities = availabilities.filter((availability) => availability.collaboratorId === collaboratorId);
    const blockingAvailability = collaboratorAvailabilities.find((availability) =>
      ["Absent", "Congé", "Indisponible", "Mission"].includes(availability.availabilityStatus)
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

    const eventStart = timeValue(startDateTime);
    const eventEnd = timeValue(endDateTime);
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
  participantIds,
  title,
  body,
  targetUrl,
}: {
  participantIds: string[];
  title: string;
  body: string;
  targetUrl: string;
}) {
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { id: { in: [...new Set(participantIds)] }, status: { not: "EXITED" }, userId: { not: null } },
    select: { userId: true },
  });
  const userIds = employees.map((employee) => employee.userId).filter((userId): userId is string => Boolean(userId));
  await notifyUsers({ userIds, title, body, type: "CALENDAR", targetUrl });
}

function timeValue(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function timeStringValue(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}
