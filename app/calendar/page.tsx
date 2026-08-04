import { redirect } from "next/navigation";
import type { CollaboratorAvailability, Prisma } from "@prisma/client";
import { CalendarAdvancedToolsSection } from "@/components/calendar/calendar-advanced-tools-section";
import {
  InternalCalendarWorkspaceV2,
  type ProfessionalAvailability,
  type ProfessionalCalendarEvent,
} from "@/components/calendar/internal-calendar-workspace-v2";
import { DtscWorkSchedulePanel } from "@/components/calendar/dtsc-work-schedule-panel";
import { UnifiedWorkCalendarPanel, type UnifiedWorkCalendarItem } from "@/components/calendar/unified-work-calendar-panel";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { calendarEventAccessWhere, calendarInvitationWhere } from "@/lib/calendar-participation";
import {
  canAccessInternalCalendar,
  calendarEventInclude,
  canUseInternalCalendarFeature,
  collaboratorAvailabilityWhere,
  getCalendarCollaborators,
  getCalendarContext,
} from "@/lib/internal-calendar";
import { SaasAccessNotice } from "@/components/enterprise/saas-access-notice";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { loadUnifiedWorkCalendar } from "@/lib/standard-work-coordination/calendar";
import { serializeScheduleException, serializeWeeklyAvailability, todayDateKey } from "@/lib/work-schedule";

const CALENDAR_SOURCE_MODULES = [
  ["tasks", "TASKS_OPERATIONS"],
  ["requests", "INTERNAL_REQUESTS"],
  ["approvals", "VALIDATIONS"],
  ["meetings", "MEETINGS"],
  ["workflows", "WORKFLOWS"],
  ["documents", "DOCUMENTS"],
] as const;

type CalendarProjectionSource = "calendar" | "tasks" | "requests" | "approvals" | "meetings" | "workflows" | "documents";

export default async function CalendarPage() {
  const user = await requireUser();
  const session = await getSession();
  if (!session || !canAccessInternalCalendar(user, session)) redirect("/dashboard");

  const context = await getCalendarContext({ id: user.id, role: user.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) redirect("/dashboard");

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

  const ownAvailabilityWhere = context.dtscInternal
    ? { organizationId: context.activeOrganizationId, collaboratorId: context.calendarCollaboratorId, deletedAt: null }
    : collaboratorAvailabilityWhere(context);
  const teamReadAllowed = context.dtscInternal && context.canViewOrganizationAvailability;
  const sourceAccess = await Promise.all(
    CALENDAR_SOURCE_MODULES.map(async ([source, moduleCode]) => ({
      source,
      allowed: await canAccessEnterpriseModule(session.userId, context.activeOrganizationId || "", moduleCode, "read"),
    })),
  );
  const allowedSources: CalendarProjectionSource[] = [
    "calendar",
    ...sourceAccess.filter((entry) => entry.allowed).map((entry) => entry.source),
  ];
  const now = new Date();
  const unifiedFrom = new Date(now.getTime() - 14 * 86_400_000);
  const unifiedTo = new Date(now.getTime() + 60 * 86_400_000);

  const [
    events,
    invitations,
    availabilities,
    collaborators,
    weeklyRecords,
    exceptionRecords,
    teamWeeklyRecords,
    teamExceptionRecords,
    unifiedEvents,
  ] = await Promise.all([
    prisma.internalCalendarEvent.findMany({
      where: calendarEventAccessWhere(context),
      include: calendarEventInclude(),
      orderBy: [{ startDateTime: "asc" }, { createdAt: "desc" }],
      take: 300,
    }),
    prisma.internalCalendarEvent.findMany({
      where: calendarInvitationWhere(context),
      include: calendarEventInclude(),
      orderBy: [{ startDateTime: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.collaboratorAvailability.findMany({
      where: ownAvailabilityWhere,
      orderBy: [{ specificDate: "asc" }, { recurrenceStart: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
      take: 500,
    }),
    getCalendarCollaborators(context),
    context.dtscInternal
      ? prisma.collaboratorAvailability.findMany({
          where: {
            organizationId: context.activeOrganizationId,
            collaboratorId: context.calendarCollaboratorId,
            deletedAt: null,
            recurrenceType: "Hebdomadaire",
            specificDate: null,
            dayOfWeek: { not: null },
            availabilityStatus: "Disponible",
          },
          orderBy: [{ dayOfWeek: "asc" }, { recurrenceStart: "desc" }, { startTime: "asc" }],
          take: 300,
        })
      : Promise.resolve([]),
    context.dtscInternal
      ? prisma.collaboratorAvailability.findMany({
          where: { organizationId: context.activeOrganizationId, collaboratorId: context.calendarCollaboratorId, deletedAt: null, recurrenceType: "Aucune", specificDate: { not: null } },
          orderBy: [{ specificDate: "desc" }, { startTime: "asc" }],
          take: 300,
        })
      : Promise.resolve([]),
    teamReadAllowed
      ? prisma.collaboratorAvailability.findMany({
          where: { organizationId: context.activeOrganizationId, deletedAt: null, recurrenceType: "Hebdomadaire", specificDate: null, dayOfWeek: { not: null } },
          orderBy: [{ collaboratorId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
          take: 1000,
        })
      : Promise.resolve([]),
    teamReadAllowed
      ? prisma.collaboratorAvailability.findMany({
          where: { organizationId: context.activeOrganizationId, deletedAt: null, recurrenceType: "Aucune", specificDate: { not: null } },
          orderBy: [{ specificDate: "desc" }, { startTime: "asc" }],
          take: 1000,
        })
      : Promise.resolve([]),
    loadUnifiedWorkCalendar({
      organizationId: context.activeOrganizationId,
      userId: session.userId,
      canSeeAll: context.canViewGlobal,
      dtscInternal: context.dtscInternal,
      timezone: user.timezone || "Africa/Kinshasa",
      from: unifiedFrom,
      to: unifiedTo,
      sources: allowedSources,
      internalCalendarWhere: calendarEventAccessWhere(context),
    }),
  ]);

  const today = todayDateKey(user.timezone || "Africa/Kinshasa");
  const activeWeekly = weeklyRecords.filter((record) => {
    const from = record.recurrenceStart?.toISOString().slice(0, 10) || null;
    const until = record.recurrenceUntil?.toISOString().slice(0, 10) || null;
    return (!from || from <= today) && (!until || until >= today);
  });
  const weeklyMinutes = activeWeekly.reduce((sum, record) => sum + Math.max(0, timeMinutes(record.endTime) - timeMinutes(record.startTime)), 0);
  const activeDays = new Set(activeWeekly.map((record) => record.dayOfWeek).filter((value): value is number => typeof value === "number"));
  const explorerRecords = context.dtscInternal
    ? (teamReadAllowed ? [...teamWeeklyRecords, ...teamExceptionRecords] : [...weeklyRecords, ...exceptionRecords])
    : availabilities;

  return (
    <AppShell user={user}>
      <div className="min-w-0 space-y-7">
        {context.dtscInternal ? (
          <DtscWorkSchedulePanel
            initialWeeklyAvailabilities={weeklyRecords.map(serializeWeeklyAvailability)}
            initialExceptions={exceptionRecords.map((record) => serializeScheduleException(record, true))}
            teamWeeklyAvailabilities={teamWeeklyRecords.map(serializeWeeklyAvailability)}
            teamExceptions={teamExceptionRecords.map((record) => serializeScheduleException(record, false))}
            collaborators={collaborators}
            employeeId={context.calendarCollaboratorId}
            canViewOrganizationAvailability={context.canViewOrganizationAvailability}
            summary={{
              hoursAvailableThisWeek: Math.round((weeklyMinutes / 60) * 100) / 100,
              availableDays: activeDays.size,
              configuredSlots: activeWeekly.length,
              overlapConflicts: 0,
            }}
            locale={user.locale}
            timezone={user.timezone || "Africa/Kinshasa"}
          />
        ) : null}

        <InternalCalendarWorkspaceV2
          initialEvents={events.map(serializeCalendarEvent)}
          initialInvitations={invitations.map(serializeCalendarEvent)}
          availabilityRecords={explorerRecords.map(serializeAvailability)}
          collaborators={collaborators}
          context={{
            employeeId: context.calendarCollaboratorId,
            userId: session.userId,
            canViewGlobal: context.canViewGlobal,
            canViewPeopleAvailability: context.canViewPeopleAvailability,
            canOverrideConflicts: context.canOverrideConflicts,
            dtscScheduleProjection: context.dtscInternal,
          }}
          locale={user.locale}
          timezone={user.timezone || "Africa/Kinshasa"}
        />

        <CalendarAdvancedToolsSection
          context={context}
          events={events.map((event) => ({
            id: event.id,
            title: event.title,
            startDateTime: event.startDateTime,
            endDateTime: event.endDateTime,
            createdBy: event.createdBy,
            ownerCollaboratorId: event.ownerCollaboratorId,
          }))}
          collaborators={collaborators.map((collaborator) => ({
            id: collaborator.id,
            fullName: collaborator.fullName,
            department: collaborator.department,
            jobTitle: collaborator.jobTitle,
          }))}
        />

        <UnifiedWorkCalendarPanel initialEvents={unifiedEvents.map(serializeUnifiedEvent)} locale={user.locale} />
      </div>
    </AppShell>
  );
}

type CalendarEventRecord = Prisma.InternalCalendarEventGetPayload<{ include: { participants: true; conflicts: true } }>;

function serializeCalendarEvent(event: CalendarEventRecord): ProfessionalCalendarEvent {
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
    createdBy: event.createdBy,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
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

function serializeUnifiedEvent(event: Awaited<ReturnType<typeof loadUnifiedWorkCalendar>>[number]): UnifiedWorkCalendarItem {
  return { ...event, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString() };
}

function serializeAvailability(availability: CollaboratorAvailability): ProfessionalAvailability {
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

function timeMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}
