import type { Prisma } from "@prisma/client";
import type { CalendarContext } from "@/lib/internal-calendar";

export const CALENDAR_RESPONSE = {
  PENDING: "En attente",
  ACCEPTED: "Accepté",
  DECLINED: "Refusé",
} as const;

export const CALENDAR_PARTICIPANT_STATUS = {
  ACTIVE: "Actif",
  DECLINED: "Refusé",
  REMOVED: "Retiré",
} as const;

export function acceptedCalendarParticipantWhere(collaboratorId: string): Prisma.InternalCalendarEventParticipantWhereInput {
  return {
    collaboratorId,
    participantStatus: CALENDAR_PARTICIPANT_STATUS.ACTIVE,
    responseStatus: CALENDAR_RESPONSE.ACCEPTED,
  };
}

export function calendarEventAccessWhere(context: CalendarContext): Prisma.InternalCalendarEventWhereInput {
  if (context.canViewGlobal) {
    return { organizationId: context.activeOrganizationId, deletedAt: null };
  }

  const collaboratorId = context.calendarCollaboratorId || "__no_collaborator__";
  const departmentId = context.employee?.departmentId || "__no_department__";
  return {
    organizationId: context.activeOrganizationId,
    deletedAt: null,
    OR: [
      { createdBy: context.userId },
      { ownerCollaboratorId: collaboratorId },
      { visibility: "Public interne" },
      { visibility: "Département", departmentId },
      { visibility: "Participants", participants: { some: acceptedCalendarParticipantWhere(collaboratorId) } },
    ],
  };
}

export function calendarOwnedOrAcceptedWhere(context: CalendarContext): Prisma.InternalCalendarEventWhereInput {
  const collaboratorId = context.calendarCollaboratorId || "__no_collaborator__";
  return {
    organizationId: context.activeOrganizationId,
    deletedAt: null,
    OR: [
      { createdBy: context.userId },
      { ownerCollaboratorId: collaboratorId },
      { participants: { some: acceptedCalendarParticipantWhere(collaboratorId) } },
    ],
  };
}

export function calendarInvitationWhere(context: CalendarContext): Prisma.InternalCalendarEventWhereInput {
  const collaboratorId = context.calendarCollaboratorId || "__no_collaborator__";
  return {
    organizationId: context.activeOrganizationId,
    deletedAt: null,
    participants: {
      some: {
        collaboratorId,
        participantStatus: CALENDAR_PARTICIPANT_STATUS.ACTIVE,
        responseStatus: CALENDAR_RESPONSE.PENDING,
      },
    },
  };
}

export function creatorParticipantCreate(collaboratorId: string) {
  return {
    collaboratorId,
    role: "Organisateur",
    participantStatus: CALENDAR_PARTICIPANT_STATUS.ACTIVE,
    responseStatus: CALENDAR_RESPONSE.ACCEPTED,
    respondedAt: new Date(),
  };
}

export function invitedParticipantCreate(collaboratorId: string) {
  return {
    collaboratorId,
    role: "Participant",
    participantStatus: CALENDAR_PARTICIPANT_STATUS.ACTIVE,
    responseStatus: CALENDAR_RESPONSE.PENDING,
    respondedAt: null,
  };
}
