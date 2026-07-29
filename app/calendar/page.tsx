import { redirect } from "next/navigation";
import type { CollaboratorAvailability, Prisma } from "@prisma/client";
import { InternalCalendarModule, type CalendarAvailabilityItem, type CalendarEventItem } from "@/components/calendar/internal-calendar-module";
import { DtscWorkScheduleModule, type DtscScheduleExceptionItem, type DtscWeeklyAvailabilityItem } from "@/components/calendar/dtsc-work-schedule-module";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { canAccessInternalCalendar, calendarEventInclude, canUseInternalCalendarFeature, collaboratorAvailabilityWhere, getCalendarCollaborators, getCalendarContext, internalCalendarAccessWhere } from "@/lib/internal-calendar";
import { SaasAccessNotice } from "@/components/enterprise/saas-access-notice";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { canViewTeamWorkSchedule, listDtscWorkSchedule, scheduleExceptionType } from "@/lib/work-schedule";

export default async function CalendarPage() {
  const user = await requireUser();
  const session = await getSession();
  if (!session || !canAccessInternalCalendar(user, session)) {
    redirect("/dashboard");
  }

  const context = await getCalendarContext({ id: user.id, role: user.role }, session);

  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    redirect("/dashboard");
  }
  const calendarAccess = await canUseInternalCalendarFeature(context);
  if (!calendarAccess.allowed) {
    const entitlements = await getOrganizationEntitlements(context.activeOrganizationId);
    return (
      <AppShell user={user}>
        <SaasAccessNotice
          title="Calendrier indisponible"
          message={calendarAccess.message}
          planLabel={entitlements?.planLabel}
          subscriptionStatus={entitlements?.subscriptionStatus}
        />
      </AppShell>
    );
  }

  const [events, legacyAvailabilities, collaborators, dtscSchedule] = await Promise.all([
    prisma.internalCalendarEvent.findMany({
      where: internalCalendarAccessWhere(context),
      include: calendarEventInclude(),
      orderBy: [{ startDateTime: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    context.dtscInternal
      ? Promise.resolve([] as CollaboratorAvailability[])
      : prisma.collaboratorAvailability.findMany({
          where: collaboratorAvailabilityWhere(context),
          orderBy: [{ specificDate: "asc" }, { recurrenceStart: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
          take: 200,
        }),
    getCalendarCollaborators(context),
    context.dtscInternal ? listDtscWorkSchedule(context) : Promise.resolve({ weekly: [] as CollaboratorAvailability[], exceptions: [] as CollaboratorAvailability[] }),
  ]);

  const calendarAvailabilities = context.dtscInternal ? dtscSchedule.weekly : legacyAvailabilities;

  return (
    <AppShell user={user}>
      {context.dtscInternal && context.calendarCollaboratorId ? (
        <DtscWorkScheduleModule
          initialWeekly={dtscSchedule.weekly.map(serializeWeeklyAvailability)}
          initialExceptions={dtscSchedule.exceptions.map(serializeScheduleException)}
          collaborators={collaborators}
          employeeId={context.calendarCollaboratorId}
          canViewTeam={canViewTeamWorkSchedule(context)}
          timezone={user.timezone || "UTC"}
        />
      ) : null}
      <InternalCalendarModule
        initialEvents={events.map(serializeCalendarEvent)}
        initialAvailabilities={calendarAvailabilities.map(serializeAvailability)}
        collaborators={collaborators}
        context={{
          employeeId: context.calendarCollaboratorId || null,
          canViewGlobal: context.canViewGlobal,
          canViewPeopleAvailability: context.canViewPeopleAvailability,
          canManagePeople: context.dtscInternal ? false : context.canManagePeople,
          canOverrideConflicts: context.canOverrideConflicts,
        }}
        userPreferences={{ locale: user.locale, timezone: user.timezone, dateFormat: user.dateFormat }}
      />
    </AppShell>
  );
}

type CalendarEventRecord = Prisma.InternalCalendarEventGetPayload<{ include: { participants: true; conflicts: true } }>;

function serializeCalendarEvent(event: CalendarEventRecord): CalendarEventItem {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    startDateTime: event.startDateTime.toISOString(),
    endDateTime: event.endDateTime.toISOString(),
    status: event.status,
    priority: event.priority,
    locationMode: event.locationMode,
    physicalLocation: event.physicalLocation,
    meetingLink: event.meetingLink,
    sourceModule: event.sourceModule,
    ownerCollaboratorId: event.ownerCollaboratorId,
    departmentId: event.departmentId,
    visibility: event.visibility,
    participants: event.participants.map((participant) => ({
      id: participant.id,
      collaboratorId: participant.collaboratorId,
      participantStatus: participant.participantStatus,
      responseStatus: participant.responseStatus,
      role: participant.role,
    })),
    conflicts: event.conflicts.map((conflict) => ({
      id: conflict.id,
      collaboratorId: conflict.collaboratorId,
      conflictType: conflict.conflictType,
      severity: conflict.severity,
      message: conflict.message,
      resolved: conflict.resolved,
    })),
  };
}

function serializeAvailability(availability: CollaboratorAvailability): CalendarAvailabilityItem {
  return {
    id: availability.id,
    collaboratorId: availability.collaboratorId,
    dayOfWeek: availability.dayOfWeek,
    specificDate: availability.specificDate?.toISOString() || null,
    startTime: availability.startTime,
    endTime: availability.endTime,
    availabilityStatus: availability.availabilityStatus,
    recurrenceType: availability.recurrenceType,
    recurrenceStart: availability.recurrenceStart?.toISOString() || null,
    recurrenceUntil: availability.recurrenceUntil?.toISOString() || null,
    recurrenceInterval: availability.recurrenceInterval,
    locationMode: availability.locationMode,
    notes: availability.notes,
  };
}

function serializeWeeklyAvailability(availability: CollaboratorAvailability): DtscWeeklyAvailabilityItem {
  return {
    id: availability.id,
    collaboratorId: availability.collaboratorId,
    dayOfWeek: availability.dayOfWeek,
    startTime: availability.startTime,
    endTime: availability.endTime,
    locationMode: availability.locationMode,
    notes: availability.notes,
    recurrenceStart: availability.recurrenceStart?.toISOString() || null,
    recurrenceUntil: availability.recurrenceUntil?.toISOString() || null,
  };
}

function serializeScheduleException(exception: CollaboratorAvailability): DtscScheduleExceptionItem {
  return {
    id: exception.id,
    collaboratorId: exception.collaboratorId,
    type: scheduleExceptionType(exception.availabilityStatus),
    availabilityStatus: exception.availabilityStatus,
    startDateTime: (exception.recurrenceStart || exception.specificDate)?.toISOString() || null,
    endDateTime: (exception.recurrenceUntil || exception.specificDate)?.toISOString() || null,
    locationMode: exception.locationMode,
    reason: exception.notes,
    notes: exception.notes,
  };
}
