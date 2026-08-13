import type { CalendarContext, ProfessionalCalendarCollaborator, ProfessionalCalendarEvent } from "./types";

export function collaboratorName(items: ProfessionalCalendarCollaborator[], id?: string | null, fallback = "Collaborator") {
  return items.find((item) => item.id === id)?.fullName || fallback;
}

export function canManageEvent(event: ProfessionalCalendarEvent, context: CalendarContext) {
  return event.createdBy === context.userId && event.ownerCollaboratorId === context.employeeId;
}

export function isMyEvent(event: ProfessionalCalendarEvent, context: CalendarContext) {
  return event.createdBy === context.userId || event.ownerCollaboratorId === context.employeeId || event.participants.some((participant) => participant.collaboratorId === context.employeeId && participant.participantStatus === "Actif" && participant.responseStatus === "Accepté");
}

export function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    map.set(value, [...(map.get(value) || []), item]);
  }
  return map;
}
