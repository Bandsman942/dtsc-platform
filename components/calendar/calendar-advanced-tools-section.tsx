import type { UserRole } from "@prisma/client";
import { CalendarAdvancedToolsPanel } from "@/components/calendar/calendar-advanced-tools/panel";
import { canManageCalendarResources, listCalendarResources } from "@/lib/calendar-advanced";
import type { CalendarContext } from "@/lib/internal-calendar";
import { getTechnicalDebtFeatureStatuses } from "@/lib/technical-debt/feature-gates";

export async function CalendarAdvancedToolsSection({
  context,
  events,
  collaborators,
  locale,
  timezone,
}: {
  context: CalendarContext & { role: UserRole };
  events: Array<{ id: string; title: string; startDateTime: Date; endDateTime: Date; createdBy: string | null; ownerCollaboratorId: string | null }>;
  collaborators: Array<{ id: string; fullName: string; department: string; jobTitle: string }>;
  locale?: string | null;
  timezone?: string | null;
}) {
  const [resources, canManageResources] = await Promise.all([
    listCalendarResources(context.activeOrganizationId || ""),
    canManageCalendarResources(context),
  ]);
  const statuses = getTechnicalDebtFeatureStatuses();
  const ownedEvents = events.filter((event) => event.createdBy === context.userId && event.ownerCollaboratorId === context.calendarCollaboratorId);
  return (
    <CalendarAdvancedToolsPanel
      initialResources={resources.map((resource) => ({
        id: resource.id,
        name: resource.name,
        resourceType: resource.resourceType,
        description: resource.description,
        location: resource.location,
        capacity: resource.capacity,
        reservations: resource.reservations.map((reservation) => ({
          id: reservation.id,
          eventId: reservation.eventId,
          startsAt: reservation.startsAt.toISOString(),
          endsAt: reservation.endsAt.toISOString(),
          status: reservation.status,
        })),
      }))}
      events={ownedEvents.map((event) => ({ id: event.id, title: event.title, startDateTime: event.startDateTime.toISOString(), endDateTime: event.endDateTime.toISOString() }))}
      collaborators={collaborators}
      canManageResources={canManageResources}
      featureStatuses={{ externalCalendar: statuses.externalCalendar, slotSuggestions: statuses.slotSuggestions, resourceBooking: statuses.resourceBooking }}
      locale={locale}
      timezone={timezone}
    />
  );
}
