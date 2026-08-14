"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarCheck2, CalendarClock, Plus, RefreshCcw, Search, UserRoundPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { confirmSensitiveAction } from "@/lib/client-confirmation";
import { ITERATION04_USER_GUIDES } from "@/lib/user-guides/iteration04-guides";
import { AvailabilityExplorer } from "./availability-view";
import { EventFormDialog } from "./event-dialog";
import { EventCard, EventDetail, InvitationList } from "./event-views";
import { availabilityIntersectsRange, currentDateKey, resolveDateRange } from "./format";
import { canManageEvent, collaboratorName, groupBy, isMyEvent } from "./helpers";
import { calendarWorkspaceText, serverFallback } from "./text";
import type { AvailabilityView, CalendarContext, CalendarView, DatePreset, EventTemplate, ProfessionalAvailability, ProfessionalCalendarCollaborator, ProfessionalCalendarEvent } from "./types";

export type { ProfessionalAvailability, ProfessionalCalendarCollaborator, ProfessionalCalendarConflict, ProfessionalCalendarEvent, ProfessionalCalendarParticipant } from "./types";

export function InternalCalendarWorkspaceV2({ initialEvents, initialInvitations, availabilityRecords, collaborators, context, locale = "fr", timezone = "Africa/Kinshasa" }: {
  initialEvents: ProfessionalCalendarEvent[];
  initialInvitations: ProfessionalCalendarEvent[];
  availabilityRecords: ProfessionalAvailability[];
  collaborators: ProfessionalCalendarCollaborator[];
  context: CalendarContext;
  locale?: string | null;
  timezone?: string | null;
}) {
  const text = calendarWorkspaceText(locale);
  const searchParams = useSearchParams();
  const initialEventId = searchParams.get("event") || searchParams.get("invitation");
  const [events, setEvents] = useState(initialEvents);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [activeView, setActiveView] = useState<CalendarView>(searchParams.get("invitation") ? "invitations" : "mine");
  const [selectedEventId, setSelectedEventId] = useState(initialEventId || initialEvents[0]?.id || initialInvitations[0]?.id || "");
  const [query, setQuery] = useState("");
  const [eventForm, setEventForm] = useState<{ event?: ProfessionalCalendarEvent; template?: EventTemplate } | null>(null);
  const [eventToDelete, setEventToDelete] = useState<ProfessionalCalendarEvent | null>(null);
  const [message, setMessage] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [customDate, setCustomDate] = useState(currentDateKey(timezone));
  const [departmentId, setDepartmentId] = useState("ALL");
  const [availabilityView, setAvailabilityView] = useState<AvailabilityView>("list");
  const [availabilityStatus, setAvailabilityStatus] = useState("ALL");
  useToastMessage(message);

  const acceptedMine = useMemo(() => events.filter((event) => isMyEvent(event, context)), [context, events]);
  const visibleEvents = useMemo(() => {
    const source = activeView === "team" && context.canViewGlobal ? events : acceptedMine;
    const normalized = query.trim().toLocaleLowerCase();
    return source.filter((event) => {
      if (!normalized) return true;
      return [event.title, event.description, event.eventType, event.status, event.priority, collaboratorName(collaborators, event.ownerCollaboratorId, text.collaborator)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [acceptedMine, activeView, collaborators, context.canViewGlobal, events, query, text.collaborator]);

  const selectedEvent = useMemo(() => [...events, ...invitations].find((event) => event.id === selectedEventId) || null, [events, invitations, selectedEventId]);
  const departments = useMemo(() => {
    const values = new Map<string, string>();
    for (const collaborator of collaborators) values.set(collaborator.departmentId || collaborator.department || "UNASSIGNED", collaborator.department || text.department);
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], locale || undefined));
  }, [collaborators, locale, text.department]);
  const statuses = useMemo(() => [...new Set(availabilityRecords.map((record) => record.availabilityStatus))].sort(), [availabilityRecords]);
  const dateRange = useMemo(() => resolveDateRange(datePreset, customDate), [customDate, datePreset]);
  const filteredAvailabilities = useMemo(() => availabilityRecords.filter((record) => {
    const collaborator = collaborators.find((item) => item.id === record.collaboratorId);
    const collaboratorDepartment = collaborator?.departmentId || collaborator?.department || "UNASSIGNED";
    if (departmentId !== "ALL" && collaboratorDepartment !== departmentId) return false;
    if (availabilityStatus !== "ALL" && record.availabilityStatus !== availabilityStatus) return false;
    return availabilityIntersectsRange(record, dateRange.start, dateRange.end);
  }), [availabilityRecords, availabilityStatus, collaborators, dateRange.end, dateRange.start, departmentId]);
  const availabilityByCollaborator = useMemo(() => groupBy(filteredAvailabilities, (record) => record.collaboratorId), [filteredAvailabilities]);
  const availabilityByStatus = useMemo(() => groupBy(filteredAvailabilities, (record) => record.availabilityStatus), [filteredAvailabilities]);

  async function refresh() {
    const response = await fetch(`/api/calendar?scope=${context.canViewGlobal && activeView === "team" ? "team" : "mine"}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { events?: ProfessionalCalendarEvent[]; message?: string } | null;
    if (!response.ok || !body) {
      setMessage(serverFallback(locale, body?.message, text.refreshFailed));
      return;
    }
    setEvents(body.events || []);
    setMessage(text.refreshSuccess);
  }

  async function respondToInvitation(event: ProfessionalCalendarEvent, responseValue: "ACCEPT" | "DECLINE", confirmConflicts = false) {
    const response = await fetch(`/api/calendar/events/${event.id}/participants/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: responseValue, confirmConflicts }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string; conflicts?: Array<{ message: string; severity: string }> } | null;
    if (response.status === 409 && responseValue === "ACCEPT" && body?.conflicts?.length && !confirmConflicts) {
      const hasBlocking = body.conflicts.some((conflict) => conflict.severity === "Bloquant");
      if (hasBlocking) {
        setMessage(serverFallback(locale, body.message, text.blockingConflictAcceptance));
        return;
      }
      const conflictDetails = body.conflicts.map((conflict) => `• ${serverFallback(locale, conflict.message, text.slotWarning)}`).join("\n");
      const confirmation = await confirmSensitiveAction({
        title: text.conflictsExist,
        description: `${serverFallback(locale, body.message, text.conflictsExist)}\n\n${conflictDetails}\n\n${text.confirmAcceptance}`,
        confirmLabel: text.accept,
        cancelLabel: text.cancel,
        tone: "warning",
      });
      if (confirmation.confirmed) await respondToInvitation(event, responseValue, true);
      return;
    }
    if (!response.ok) {
      setMessage(serverFallback(locale, body?.message, text.invitationResponseFailed));
      return;
    }
    setInvitations((current) => current.filter((item) => item.id !== event.id));
    if (responseValue === "ACCEPT") {
      setEvents((current) => current.some((item) => item.id === event.id) ? current : [...current, event]);
      setActiveView("mine");
      setSelectedEventId(event.id);
      setMessage(text.invitationAccepted);
    } else {
      setSelectedEventId("");
      setMessage(text.invitationDeclined);
    }
  }

  async function deleteEvent(event: ProfessionalCalendarEvent) {
    const response = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setMessage(serverFallback(locale, body?.message, text.cancelEventFailed));
      return;
    }
    setEvents((current) => current.filter((item) => item.id !== event.id));
    setSelectedEventId("");
    setEventToDelete(null);
    setMessage(text.eventCancelled);
  }

  function upsertEvent(event: ProfessionalCalendarEvent) {
    setEvents((current) => current.some((item) => item.id === event.id) ? current.map((item) => item.id === event.id ? event : item) : [event, ...current]);
    setSelectedEventId(event.id);
    setActiveView("mine");
  }

  return (
    <div className="min-w-0 space-y-6">
      <section className="dtsc-panel min-w-0 overflow-hidden p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{text.eyebrow}</p><h1 className="mt-1 break-words text-3xl font-black text-dtsc-ink sm:text-4xl">{text.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">{text.description}</p></div>
          <div className="flex min-w-0 flex-wrap gap-2"><ContextualUserGuide guide={ITERATION04_USER_GUIDES.CALENDAR} compact /><Button type="button" variant="outline" onClick={() => void refresh()} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><RefreshCcw className="h-4 w-4" /> {text.refresh}</Button><Button type="button" onClick={() => setEventForm({})} className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" /> {text.newEvent}</Button></div>
        </div>
      </section>

      <section className="dtsc-card min-w-0 overflow-hidden p-3">
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1" aria-label={text.viewsAria}>
          <ViewButton active={activeView === "mine"} onClick={() => setActiveView("mine")} icon={CalendarCheck2} label={text.myCalendar} count={acceptedMine.length} />
          {context.canViewGlobal ? <ViewButton active={activeView === "team"} onClick={() => setActiveView("team")} icon={Users} label={text.teamCalendar} count={events.length} /> : null}
          <ViewButton active={activeView === "invitations"} onClick={() => setActiveView("invitations")} icon={UserRoundPlus} label={text.invitations} count={invitations.length} />
          <ViewButton active={activeView === "availability"} onClick={() => setActiveView("availability")} icon={CalendarClock} label={text.availability} count={filteredAvailabilities.length} />
        </div>
      </section>

      {activeView === "availability" ? (
        <AvailabilityExplorer records={filteredAvailabilities} collaborators={collaborators} departments={departments} statuses={statuses} datePreset={datePreset} customDate={customDate} departmentId={departmentId} availabilityStatus={availabilityStatus} view={availabilityView} range={dateRange} byCollaborator={availabilityByCollaborator} byStatus={availabilityByStatus} onDatePreset={setDatePreset} onCustomDate={setCustomDate} onDepartment={setDepartmentId} onStatus={setAvailabilityStatus} onView={setAvailabilityView} onInvite={(collaboratorId) => setEventForm({ template: { participantIds: [collaboratorId], title: `${text.eventWith} ${collaboratorName(collaborators, collaboratorId, text.collaborator)}` } })} locale={locale} timezone={timezone} />
      ) : activeView === "invitations" ? (
        <InvitationList invitations={invitations} collaborators={collaborators} locale={locale} timezone={timezone} onSelect={setSelectedEventId} onRespond={(event, value) => void respondToInvitation(event, value)} />
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="dtsc-card min-w-0 overflow-hidden p-4">
            <label className="relative block min-w-0"><span className="sr-only">{text.searchEvents}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchEventsPlaceholder} className="h-11 rounded-xl bg-dtsc-page pl-10" /></label>
            <div className="mt-4 max-h-[72dvh] min-w-0 space-y-3 overflow-y-auto pr-1">{visibleEvents.map((event) => <EventCard key={event.id} event={event} ownerName={collaboratorName(collaborators, event.ownerCollaboratorId, text.collaborator)} selected={selectedEventId === event.id} canEdit={canManageEvent(event, context)} locale={locale} timezone={timezone} onSelect={() => setSelectedEventId(event.id)} onEdit={() => setEventForm({ event })} onDelete={() => setEventToDelete(event)} />)}{!visibleEvents.length ? <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center text-sm text-dtsc-muted">{text.noEvents}</p> : null}</div>
          </section>
          <section className="dtsc-card min-w-0 overflow-hidden p-4">{selectedEvent ? <EventDetail event={selectedEvent} collaborators={collaborators} context={context} locale={locale} timezone={timezone} onEdit={() => setEventForm({ event: selectedEvent })} onDelete={() => setEventToDelete(selectedEvent)} /> : <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center text-sm text-dtsc-muted">{text.selectEvent}</p>}</section>
        </div>
      )}

      {eventForm ? <EventFormDialog event={eventForm.event} template={eventForm.template} collaborators={collaborators} context={context} locale={locale} onClose={() => setEventForm(null)} onSaved={(event) => { upsertEvent(event); setEventForm(null); setMessage(eventForm.event ? text.eventUpdated : text.eventCreated); }} /> : null}
      {eventToDelete ? <Dialog open title={text.cancelEventTitle} description={eventToDelete.title} onClose={() => setEventToDelete(null)} className="max-w-lg"><p className="text-sm leading-6 text-dtsc-muted">{text.cancelEventDescription}</p><div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={() => setEventToDelete(null)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">{text.keepEvent}</Button><Button type="button" onClick={() => void deleteEvent(eventToDelete)} className="rounded-xl bg-red-600 text-white">{text.cancelEventAction}</Button></div></Dialog> : null}
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof CalendarCheck2; label: string; count: number }) {
  return <button type="button" onClick={onClick} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-black ${active ? "bg-cyan-400 text-[#001736]" : "border border-dtsc-border bg-dtsc-surface text-dtsc-muted"}`}><Icon className="h-4 w-4" />{label}<span className="rounded-full bg-black/10 px-2 py-0.5 text-xs">{count}</span></button>;
}
