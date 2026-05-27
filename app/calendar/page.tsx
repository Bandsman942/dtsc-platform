import { redirect } from "next/navigation";
import type { CollaboratorAvailability, Prisma } from "@prisma/client";
import { InternalCalendarModule, type CalendarAvailabilityItem, type CalendarEventItem } from "@/components/calendar/internal-calendar-module";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { canAccessInternalCalendar, calendarEventInclude, getCalendarContext, internalCalendarAccessWhere } from "@/lib/internal-calendar";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export default async function CalendarPage() {
  const user = await requireUser();
  const session = await getSession();
  if (!isDtscInternalSession(session) || !canAccessInternalCalendar(user)) {
    redirect("/dashboard");
  }

  const context = await getCalendarContext({ id: user.id, role: user.role });

  if (!context.employee && user.role === "CLIENT") {
    redirect("/dashboard");
  }

  const [events, availabilities, collaborators] = await Promise.all([
    prisma.internalCalendarEvent.findMany({
      where: internalCalendarAccessWhere(context),
      include: calendarEventInclude(),
      orderBy: [{ startDateTime: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.collaboratorAvailability.findMany({
      where: context.canViewGlobal || context.canManagePeople
        ? { deletedAt: null }
        : { deletedAt: null, collaboratorId: context.employee?.id || "__no_employee__" },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      take: 200,
    }),
    prisma.hrcfoEmployee.findMany({
      where: context.canViewGlobal || context.canManagePeople
        ? { status: { not: "EXITED" } }
        : { id: context.employee?.id || "__no_employee__" },
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
    }),
  ]);

  return (
    <AppShell user={user}>
      <InternalCalendarModule
        initialEvents={events.map(serializeCalendarEvent)}
        initialAvailabilities={availabilities.map(serializeAvailability)}
        collaborators={collaborators}
        context={{
          employeeId: context.employee?.id || null,
          canViewGlobal: context.canViewGlobal,
          canManagePeople: context.canManagePeople,
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
    startTime: availability.startTime,
    endTime: availability.endTime,
    availabilityStatus: availability.availabilityStatus,
    recurrenceType: availability.recurrenceType,
    locationMode: availability.locationMode,
    notes: availability.notes,
  };
}
