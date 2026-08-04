"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarCheck2, CalendarClock, Check, Filter, Pencil, Plus, RefreshCcw, Search, Trash2, UserRoundPlus, Users, X } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { OperationalChecklistPanel } from "@/components/operations/operational-checklist-panel";
import { ITERATION04_USER_GUIDES } from "@/lib/user-guides/iteration04-guides";

export type ProfessionalCalendarParticipant = {
  id: string;
  collaboratorId: string;
  participantStatus: string;
  responseStatus: string;
  role: string;
};

export type ProfessionalCalendarConflict = {
  id: string;
  collaboratorId: string;
  conflictType: string;
  severity: string;
  message: string;
  resolved: boolean;
};

export type ProfessionalCalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  eventType: string;
  startDateTime: string;
  endDateTime: string;
  status: string;
  priority: string;
  locationMode: string;
  physicalLocation?: string | null;
  meetingLink?: string | null;
  sourceModule?: string | null;
  ownerCollaboratorId?: string | null;
  departmentId?: string | null;
  visibility: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ProfessionalCalendarParticipant[];
  conflicts: ProfessionalCalendarConflict[];
};

export type ProfessionalAvailability = {
  id: string;
  collaboratorId: string;
  dayOfWeek?: number | null;
  specificDate?: string | null;
  startTime: string;
  endTime: string;
  availabilityStatus: string;
  recurrenceType: string;
  recurrenceStart?: string | null;
  recurrenceUntil?: string | null;
  recurrenceInterval?: number | null;
  locationMode: string;
  notes?: string | null;
};

export type ProfessionalCalendarCollaborator = {
  id: string;
  fullName: string;
  email?: string | null;
  department: string;
  departmentId?: string | null;
  jobTitle: string;
  userId?: string | null;
};

type CalendarContext = {
  employeeId: string;
  userId: string;
  canViewGlobal: boolean;
  canViewPeopleAvailability?: boolean;
  canOverrideConflicts: boolean;
  dtscScheduleProjection?: boolean;
};

type EventTemplate = {
  eventType?: string;
  participantIds?: string[];
  title?: string;
};

type DatePreset = "today" | "week" | "month" | "year" | "custom";
type AvailabilityView = "list" | "collaborators" | "statuses";
type CalendarView = "mine" | "team" | "invitations" | "availability";

export function InternalCalendarWorkspaceV2({
  initialEvents,
  initialInvitations,
  availabilityRecords,
  collaborators,
  context,
  locale = "fr",
  timezone = "Africa/Kinshasa",
}: {
  initialEvents: ProfessionalCalendarEvent[];
  initialInvitations: ProfessionalCalendarEvent[];
  availabilityRecords: ProfessionalAvailability[];
  collaborators: ProfessionalCalendarCollaborator[];
  context: CalendarContext;
  locale?: string | null;
  timezone?: string | null;
}) {
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
  const [customDate, setCustomDate] = useState(todayKey());
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
      return [event.title, event.description, event.eventType, event.status, event.priority, collaboratorName(collaborators, event.ownerCollaboratorId)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [acceptedMine, activeView, collaborators, context.canViewGlobal, events, query]);

  const selectedEvent = useMemo(
    () => [...events, ...invitations].find((event) => event.id === selectedEventId) || null,
    [events, invitations, selectedEventId],
  );

  const departments = useMemo(() => {
    const values = new Map<string, string>();
    for (const collaborator of collaborators) {
      values.set(collaborator.departmentId || collaborator.department || "UNASSIGNED", collaborator.department || "Sans département");
    }
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [collaborators]);
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
      setMessage(body?.message || "Actualisation impossible.");
      return;
    }
    setEvents(body.events || []);
    setMessage("Calendrier actualisé.");
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
      if (!hasBlocking && window.confirm(`${body.message || "Des conflits existent."}\n\n${body.conflicts.map((conflict) => `• ${conflict.message}`).join("\n")}\n\nConfirmer l'acceptation ?`)) {
        await respondToInvitation(event, responseValue, true);
      } else {
        setMessage(body.message || "Acceptation impossible tant qu'un conflit bloquant subsiste.");
      }
      return;
    }
    if (!response.ok) {
      setMessage(body?.message || "Réponse impossible.");
      return;
    }
    setInvitations((current) => current.filter((item) => item.id !== event.id));
    if (responseValue === "ACCEPT") {
      setEvents((current) => current.some((item) => item.id === event.id) ? current : [...current, event]);
      setActiveView("mine");
      setSelectedEventId(event.id);
      setMessage("Invitation acceptée. L'événement est maintenant synchronisé dans votre calendrier.");
    } else {
      setSelectedEventId("");
      setMessage("Invitation refusée. L'événement n'a pas été ajouté à votre calendrier.");
    }
  }

  async function deleteEvent(event: ProfessionalCalendarEvent) {
    const response = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setMessage(body?.message || "Annulation impossible.");
      return;
    }
    setEvents((current) => current.filter((item) => item.id !== event.id));
    setSelectedEventId("");
    setEventToDelete(null);
    setMessage("Événement annulé.");
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
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Planning professionnel</p>
            <h1 className="mt-1 break-words text-3xl font-black text-dtsc-ink sm:text-4xl">Calendrier interne</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">Le créateur reste responsable de son événement. Les autres collaborateurs reçoivent une invitation et l’événement ne rejoint leur agenda qu’après acceptation.</p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <ContextualUserGuide guide={ITERATION04_USER_GUIDES.CALENDAR} compact />
            <Button type="button" variant="outline" onClick={() => void refresh()} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><RefreshCcw className="h-4 w-4" /> Actualiser</Button>
            <Button type="button" onClick={() => setEventForm({})} className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" /> Nouvel événement</Button>
          </div>
        </div>
      </section>

      <section className="dtsc-card min-w-0 overflow-hidden p-3">
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1" aria-label="Vues du calendrier">
          <ViewButton active={activeView === "mine"} onClick={() => setActiveView("mine")} icon={CalendarCheck2} label="Mon calendrier" count={acceptedMine.length} />
          {context.canViewGlobal ? <ViewButton active={activeView === "team"} onClick={() => setActiveView("team")} icon={Users} label="Calendrier équipe" count={events.length} /> : null}
          <ViewButton active={activeView === "invitations"} onClick={() => setActiveView("invitations")} icon={UserRoundPlus} label="Invitations" count={invitations.length} />
          <ViewButton active={activeView === "availability"} onClick={() => setActiveView("availability")} icon={CalendarClock} label="Disponibilités" count={filteredAvailabilities.length} />
        </div>
      </section>

      {activeView === "availability" ? (
        <AvailabilityExplorer
          records={filteredAvailabilities}
          collaborators={collaborators}
          departments={departments}
          statuses={statuses}
          datePreset={datePreset}
          customDate={customDate}
          departmentId={departmentId}
          availabilityStatus={availabilityStatus}
          view={availabilityView}
          range={dateRange}
          byCollaborator={availabilityByCollaborator}
          byStatus={availabilityByStatus}
          onDatePreset={setDatePreset}
          onCustomDate={setCustomDate}
          onDepartment={setDepartmentId}
          onStatus={setAvailabilityStatus}
          onView={setAvailabilityView}
          onInvite={(collaboratorId) => setEventForm({ template: { participantIds: [collaboratorId], title: `Événement avec ${collaboratorName(collaborators, collaboratorId)}` } })}
          locale={locale}
          timezone={timezone}
        />
      ) : activeView === "invitations" ? (
        <InvitationList invitations={invitations} collaborators={collaborators} onSelect={setSelectedEventId} onRespond={(event, value) => void respondToInvitation(event, value)} />
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="dtsc-card min-w-0 overflow-hidden p-4">
            <label className="relative block min-w-0">
              <span className="sr-only">Rechercher dans les événements</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par événement, statut ou collaborateur…" className="h-11 rounded-xl bg-dtsc-page pl-10" />
            </label>
            <div className="mt-4 max-h-[72dvh] min-w-0 space-y-3 overflow-y-auto pr-1">
              {visibleEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  ownerName={collaboratorName(collaborators, event.ownerCollaboratorId)}
                  selected={selectedEventId === event.id}
                  canEdit={canManageEvent(event, context)}
                  onSelect={() => setSelectedEventId(event.id)}
                  onEdit={() => setEventForm({ event })}
                  onDelete={() => setEventToDelete(event)}
                />
              ))}
              {!visibleEvents.length ? <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center text-sm text-dtsc-muted">Aucun événement ne correspond à cette vue.</p> : null}
            </div>
          </section>

          <section className="dtsc-card min-w-0 overflow-hidden p-4">
            {selectedEvent ? (
              <EventDetail
                event={selectedEvent}
                collaborators={collaborators}
                context={context}
                onEdit={() => setEventForm({ event: selectedEvent })}
                onDelete={() => setEventToDelete(selectedEvent)}
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center text-sm text-dtsc-muted">Sélectionnez un événement pour afficher ses détails.</p>
            )}
          </section>
        </div>
      )}

      {eventForm ? (
        <EventFormDialog
          event={eventForm.event}
          template={eventForm.template}
          collaborators={collaborators}
          context={context}
          onClose={() => setEventForm(null)}
          onSaved={(event) => {
            upsertEvent(event);
            setEventForm(null);
            setMessage(eventForm.event ? "Événement modifié." : "Événement créé et invitations envoyées.");
          }}
        />
      ) : null}

      {eventToDelete ? (
        <Dialog open title="Annuler l'événement" description={eventToDelete.title} onClose={() => setEventToDelete(null)} className="max-w-lg">
          <p className="text-sm leading-6 text-dtsc-muted">L’événement sera retiré des calendriers actifs. L’action reste traçable.</p>
          <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setEventToDelete(null)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">Conserver</Button>
            <Button type="button" onClick={() => void deleteEvent(eventToDelete)} className="rounded-xl bg-red-600 text-white">Annuler l'événement</Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function AvailabilityExplorer({
  records,
  collaborators,
  departments,
  statuses,
  datePreset,
  customDate,
  departmentId,
  availabilityStatus,
  view,
  range,
  byCollaborator,
  byStatus,
  onDatePreset,
  onCustomDate,
  onDepartment,
  onStatus,
  onView,
  onInvite,
  locale,
  timezone,
}: {
  records: ProfessionalAvailability[];
  collaborators: ProfessionalCalendarCollaborator[];
  departments: Array<[string, string]>;
  statuses: string[];
  datePreset: DatePreset;
  customDate: string;
  departmentId: string;
  availabilityStatus: string;
  view: AvailabilityView;
  range: { start: Date; end: Date };
  byCollaborator: Map<string, ProfessionalAvailability[]>;
  byStatus: Map<string, ProfessionalAvailability[]>;
  onDatePreset: (value: DatePreset) => void;
  onCustomDate: (value: string) => void;
  onDepartment: (value: string) => void;
  onStatus: (value: string) => void;
  onView: (value: AvailabilityView) => void;
  onInvite: (collaboratorId: string) => void;
  locale?: string | null;
  timezone?: string | null;
}) {
  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">Aperçu professionnel</p>
          <h2 className="mt-1 text-2xl font-black text-dtsc-ink">Disponibilités des collaborateurs</h2>
          <p className="mt-2 text-sm leading-6 text-dtsc-muted">Période du {formatDate(range.start, locale, timezone)} au {formatDate(range.end, locale, timezone)} · {records.length} créneau(x) correspondant(s).</p>
        </div>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1" aria-label="Types de vue des disponibilités">
          {[{ id: "list", label: "Liste" }, { id: "collaborators", label: "Par collaborateur" }, { id: "statuses", label: "Par statut" }].map((item) => (
            <button key={item.id} type="button" onClick={() => onView(item.id as AvailabilityView)} className={railClass(view === item.id)}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted"><CalendarClock className="h-4 w-4" /> Période</p>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label="Filtres de période">
            {[
              ["today", "Aujourd'hui"],
              ["week", "Cette semaine"],
              ["month", "Ce mois"],
              ["year", "Cette année"],
              ["custom", "Date précise"],
            ].map(([id, label]) => <button key={id} type="button" onClick={() => onDatePreset(id as DatePreset)} className={railClass(datePreset === id)}>{label}</button>)}
          </div>
          {datePreset === "custom" ? <Input type="date" value={customDate} onChange={(event) => onCustomDate(event.target.value)} className="mt-2 h-11 max-w-xs rounded-xl bg-dtsc-page" /> : null}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted"><Users className="h-4 w-4" /> Département</p>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label="Filtres de département">
            <button type="button" onClick={() => onDepartment("ALL")} className={railClass(departmentId === "ALL")}>Tous</button>
            {departments.map(([id, label]) => <button key={id} type="button" onClick={() => onDepartment(id)} className={railClass(departmentId === id)}>{label}</button>)}
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted"><Filter className="h-4 w-4" /> Statut</p>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label="Filtres de statut">
            <button type="button" onClick={() => onStatus("ALL")} className={railClass(availabilityStatus === "ALL")}>Tous</button>
            {statuses.map((status) => <button key={status} type="button" onClick={() => onStatus(status)} className={railClass(availabilityStatus === status)}>{status}</button>)}
          </div>
        </div>
      </div>

      <div className="mt-5 max-h-[70dvh] min-w-0 overflow-y-auto pr-1">
        {view === "list" ? (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {records.map((record) => <AvailabilityCard key={record.id} record={record} collaborator={collaborators.find((item) => item.id === record.collaboratorId)} locale={locale} timezone={timezone} onInvite={() => onInvite(record.collaboratorId)} />)}
          </div>
        ) : view === "collaborators" ? (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {[...byCollaborator.entries()].map(([collaboratorId, items]) => {
              const collaborator = collaborators.find((item) => item.id === collaboratorId);
              return (
                <article key={collaboratorId} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="break-words font-black text-dtsc-ink">{collaborator?.fullName || "Collaborateur"}</h3><p className="mt-1 text-xs font-bold text-dtsc-muted">{collaborator?.jobTitle} · {collaborator?.department}</p></div>
                    <Button type="button" variant="outline" size="icon" onClick={() => onInvite(collaboratorId)} className="shrink-0 rounded-xl border-dtsc-border text-dtsc-blue" aria-label={`Inviter ${collaborator?.fullName || "ce collaborateur"}`}><UserRoundPlus className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-black text-cyan-700">{item.availabilityStatus} · {item.startTime}-{item.endTime}</span>)}</div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...byStatus.entries()].map(([status, items]) => (
              <article key={status} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600">{status}</p><p className="mt-2 text-3xl font-black text-dtsc-ink">{items.length}</p><p className="mt-1 text-sm text-dtsc-muted">créneau(x) · {new Set(items.map((item) => item.collaboratorId)).size} collaborateur(s)</p></article>
            ))}
          </div>
        )}
        {!records.length ? <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-8 text-center text-sm text-dtsc-muted">Aucune disponibilité ne correspond à cette combinaison de filtres.</p> : null}
      </div>
    </section>
  );
}

function AvailabilityCard({ record, collaborator, locale, timezone, onInvite }: { record: ProfessionalAvailability; collaborator?: ProfessionalCalendarCollaborator; locale?: string | null; timezone?: string | null; onInvite: () => void }) {
  return (
    <article className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-black text-cyan-700">{record.availabilityStatus}</span><span className="rounded-full bg-dtsc-surface px-2.5 py-1 text-xs font-black text-dtsc-muted">{record.locationMode}</span><span className="rounded-full bg-dtsc-surface px-2.5 py-1 text-xs font-black text-dtsc-muted">{record.recurrenceType}</span></div>
          <h3 className="mt-3 break-words text-lg font-black text-dtsc-ink">{collaborator?.fullName || "Collaborateur"}</h3>
          <p className="mt-1 text-xs font-bold text-dtsc-muted">{collaborator?.jobTitle} · {collaborator?.department}</p>
          <p className="mt-3 text-sm font-bold text-dtsc-muted">{availabilityDateLabel(record, locale, timezone)} · {record.startTime}–{record.endTime}</p>
          {record.notes ? <p className="mt-2 text-sm leading-6 text-dtsc-muted">{record.notes}</p> : null}
        </div>
        <Button type="button" variant="outline" size="icon" onClick={onInvite} className="shrink-0 rounded-xl border-dtsc-border text-dtsc-blue" aria-label={`Inviter ${collaborator?.fullName || "ce collaborateur"}`}><UserRoundPlus className="h-4 w-4" /></Button>
      </div>
    </article>
  );
}

function InvitationList({ invitations, collaborators, onSelect, onRespond }: { invitations: ProfessionalCalendarEvent[]; collaborators: ProfessionalCalendarCollaborator[]; onSelect: (id: string) => void; onRespond: (event: ProfessionalCalendarEvent, value: "ACCEPT" | "DECLINE") => void }) {
  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <h2 className="text-2xl font-black text-dtsc-ink">Invitations en attente</h2>
      <p className="mt-2 text-sm leading-6 text-dtsc-muted">Tant que vous n’acceptez pas, l’événement n’est pas ajouté à votre calendrier personnel.</p>
      <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-2">
        {invitations.map((event) => (
          <article key={event.id} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <button type="button" onClick={() => onSelect(event.id)} className="block w-full text-left"><p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600">{event.eventType} · {event.priority}</p><h3 className="mt-2 break-words text-lg font-black text-dtsc-ink">{event.title}</h3><p className="mt-2 text-sm font-bold text-dtsc-muted">{formatDateTimeRange(event.startDateTime, event.endDateTime)}</p><p className="mt-1 text-xs text-dtsc-muted">Responsable : {collaboratorName(collaborators, event.ownerCollaboratorId)}</p></button>
            {event.conflicts.length ? <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">{event.conflicts.map((conflict) => <p key={conflict.id}>• {conflict.message}</p>)}</div> : null}
            <div className="mt-4 flex gap-2"><Button type="button" onClick={() => onRespond(event, "ACCEPT")} className="flex-1 rounded-xl bg-emerald-600 text-white"><Check className="h-4 w-4" /> Accepter</Button><Button type="button" variant="outline" onClick={() => onRespond(event, "DECLINE")} className="flex-1 rounded-xl border-red-500/30 text-red-700"><X className="h-4 w-4" /> Refuser</Button></div>
          </article>
        ))}
        {!invitations.length ? <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-8 text-center text-sm text-dtsc-muted lg:col-span-2">Aucune invitation en attente.</p> : null}
      </div>
    </section>
  );
}

function EventCard({ event, ownerName, selected, canEdit, onSelect, onEdit, onDelete }: { event: ProfessionalCalendarEvent; ownerName: string; selected: boolean; canEdit: boolean; onSelect: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className={`relative min-w-0 rounded-2xl border p-4 ${selected ? "border-cyan-300 bg-cyan-400/10" : "border-dtsc-border bg-dtsc-page"}`}>
      {canEdit ? <div className="absolute right-3 top-3"><ActionMenu label="Actions événement" items={[{ key: "edit", label: "Modifier", icon: Pencil, onSelect: onEdit }, { key: "delete", label: "Annuler", icon: Trash2, destructive: true, onSelect: onDelete }]} /></div> : null}
      <button type="button" onClick={onSelect} className="block w-full min-w-0 pr-12 text-left">
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-black text-cyan-700">{event.eventType}</span><span className="rounded-full bg-dtsc-surface px-2.5 py-1 text-xs font-black text-dtsc-muted">{event.status}</span>{event.conflicts.length ? <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-black text-amber-700">{event.conflicts.length} conflit(s)</span> : null}</div>
        <h3 className="mt-3 break-words text-lg font-black text-dtsc-ink">{event.title}</h3><p className="mt-2 text-sm font-bold text-dtsc-muted">{formatDateTimeRange(event.startDateTime, event.endDateTime)}</p><p className="mt-1 text-xs text-dtsc-muted">Responsable : {ownerName}</p>
      </button>
    </article>
  );
}

function EventDetail({ event, collaborators, context, onEdit, onDelete }: { event: ProfessionalCalendarEvent; collaborators: ProfessionalCalendarCollaborator[]; context: CalendarContext; onEdit: () => void; onDelete: () => void }) {
  const canEdit = canManageEvent(event, context);
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{event.eventType} · {event.status}</p><h2 className="mt-2 break-words text-2xl font-black text-dtsc-ink">{event.title}</h2><p className="mt-2 text-sm font-bold text-dtsc-muted">{formatDateTimeRange(event.startDateTime, event.endDateTime)}</p></div>
        {canEdit ? <ActionMenu label="Actions événement" items={[{ key: "edit", label: "Modifier", icon: Pencil, onSelect: onEdit }, { key: "delete", label: "Annuler", icon: Trash2, destructive: true, onSelect: onDelete }]} /> : null}
      </div>
      {event.description ? <p className="whitespace-pre-wrap text-sm leading-7 text-dtsc-muted">{event.description}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2"><Detail label="Responsable" value={collaboratorName(collaborators, event.ownerCollaboratorId)} /><Detail label="Lieu / mode" value={[event.locationMode, event.physicalLocation].filter(Boolean).join(" · ") || "Non défini"} /><Detail label="Créé le" value={new Date(event.createdAt).toLocaleString("fr-FR")} /><Detail label="Dernière modification" value={new Date(event.updatedAt).toLocaleString("fr-FR")} /></div>
      <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">Participants</h3><div className="mt-3 space-y-2">{event.participants.map((participant) => <div key={participant.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><span className="min-w-0 break-words text-sm font-bold text-dtsc-ink">{collaboratorName(collaborators, participant.collaboratorId)} · {participant.role}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${participant.responseStatus === "Accepté" ? "bg-emerald-500/10 text-emerald-700" : participant.responseStatus === "Refusé" ? "bg-red-500/10 text-red-700" : "bg-amber-500/10 text-amber-700"}`}>{participant.responseStatus}</span></div>)}</div></section>
      {event.conflicts.length ? <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"><h3 className="font-black text-amber-800 dark:text-amber-200">Conflits détectés</h3><div className="mt-2 space-y-2 text-sm leading-6 text-amber-800 dark:text-amber-200">{event.conflicts.map((conflict) => <p key={conflict.id}>• {conflict.message}</p>)}</div></section> : null}
      <OperationalChecklistPanel objectType="CALENDAR_EVENT" objectId={event.id} />
    </div>
  );
}

function EventFormDialog({ event, template, collaborators, context, onClose, onSaved }: { event?: ProfessionalCalendarEvent; template?: EventTemplate; collaborators: ProfessionalCalendarCollaborator[]; context: CalendarContext; onClose: () => void; onSaved: (event: ProfessionalCalendarEvent) => void }) {
  const [message, setMessage] = useState("");
  const [conflicts, setConflicts] = useState<Array<{ message: string; severity: string }>>([]);
  const [allowConflicts, setAllowConflicts] = useState(false);
  const selected = new Set(event?.participants.filter((participant) => participant.role !== "Organisateur" && participant.participantStatus !== "Retiré").map((participant) => participant.collaboratorId) || template?.participantIds || []);
  useToastMessage(message);

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    const participantIds = form.getAll("participantIds").map(String).filter((id) => id !== context.employeeId);
    const payload = {
      title: String(form.get("title") || ""), description: String(form.get("description") || ""), eventType: String(form.get("eventType") || "Tâche"), startDateTime: String(form.get("startDateTime") || ""), endDateTime: String(form.get("endDateTime") || ""), priority: String(form.get("priority") || "Normale"), status: event?.status || "Planifié", locationMode: String(form.get("locationMode") || "Non défini"), physicalLocation: String(form.get("physicalLocation") || ""), ownerCollaboratorId: context.employeeId, visibility: String(form.get("visibility") || "Participants"), participantIds, allowConflicts,
    };
    const endpoint = event ? `/api/calendar/events/${event.id}` : "/api/calendar";
    const response = await fetch(endpoint, { method: event ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { event?: ProfessionalCalendarEvent; message?: string; conflicts?: Array<{ message: string; severity: string }> } | null;
    if (response.status === 409 && body?.conflicts) { setConflicts(body.conflicts); setMessage(body.message || "Conflits détectés."); return; }
    if (!response.ok || !body?.event) { setMessage(body?.message || "Enregistrement impossible."); return; }
    onSaved(body.event);
  }

  return (
    <Dialog open title={event ? "Modifier l'événement" : "Nouvel événement"} description="Vous restez responsable. Les autres personnes recevront une invitation à accepter ou refuser." onClose={onClose} className="h-[94dvh] max-w-4xl">
      <form onSubmit={submit} className="grid min-h-0 min-w-0 gap-4 overflow-y-auto pr-1">
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm leading-6 text-cyan-900 dark:text-cyan-100"><strong>Responsable :</strong> {collaboratorName(collaborators, context.employeeId)}. Ce responsable ne peut pas être remplacé par un participant.</div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <FormField label="Titre" hint="Nom lisible dans les calendriers."><Input name="title" required defaultValue={event?.title || template?.title || ""} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label="Type" hint="Nature professionnelle de l'événement."><select name="eventType" defaultValue={event?.eventType || template?.eventType || "Tâche"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{["Tâche", "Réunion", "Mission", "Appel audio", "Appel vidéo", "Formation", "Blocage", "Deadline", "Autre"].map((value) => <option key={value}>{value}</option>)}</select></FormField>
          <FormField label="Début" hint="Date et heure prévues."><Input name="startDateTime" type="datetime-local" required defaultValue={toDateTimeInput(event?.startDateTime)} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label="Fin" hint="Date et heure prévues."><Input name="endDateTime" type="datetime-local" required defaultValue={toDateTimeInput(event?.endDateTime)} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label="Priorité" hint="Importance de l'événement."><select name="priority" defaultValue={event?.priority || "Normale"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{["Faible", "Normale", "Élevée", "Critique"].map((value) => <option key={value}>{value}</option>)}</select></FormField>
          <FormField label="Visibilité" hint="Les invitations restent nominatives."><select name="visibility" defaultValue={event?.visibility || "Participants"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{["Participants", "Département", "Public interne", "Privé"].map((value) => <option key={value}>{value}</option>)}</select></FormField>
          <FormField label="Mode / lieu" hint="Sur site, à distance ou externe."><select name="locationMode" defaultValue={event?.locationMode || "Non défini"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{["Non défini", "Site DTSC", "Télétravail", "Hybride", "Externe", "Mission"].map((value) => <option key={value}>{value}</option>)}</select></FormField>
          <FormField label="Précision du lieu" hint="Salle, adresse ou information utile."><Input name="physicalLocation" defaultValue={event?.physicalLocation || ""} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
        </div>
        <FormField label="Description / agenda" hint="Objectifs, consignes et résultats attendus."><textarea name="description" defaultValue={event?.description || ""} className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField>
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">Participants à inviter</h3><p className="mt-1 text-xs leading-5 text-dtsc-muted">Chaque personne devra accepter avant que l’événement apparaisse dans son calendrier personnel.</p><div className="mt-3 grid max-h-72 min-w-0 gap-2 overflow-y-auto sm:grid-cols-2">{collaborators.filter((collaborator) => collaborator.id !== context.employeeId).map((collaborator) => <label key={collaborator.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm"><input name="participantIds" value={collaborator.id} type="checkbox" defaultChecked={selected.has(collaborator.id)} className="mt-1 h-4 w-4 shrink-0 accent-cyan-500" /><span className="min-w-0"><span className="block break-words font-black text-dtsc-ink">{collaborator.fullName}</span><span className="mt-1 block break-words text-xs text-dtsc-muted">{collaborator.jobTitle} · {collaborator.department}</span></span></label>)}</div></section>
        {conflicts.length ? <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"><h3 className="font-black text-amber-800 dark:text-amber-200">Conflits du responsable ou des participants</h3><div className="mt-2 space-y-2 text-sm text-amber-800 dark:text-amber-200">{conflicts.map((conflict, index) => <p key={`${conflict.message}-${index}`}>• {conflict.message}</p>)}</div><label className="mt-3 flex items-start gap-2 text-sm font-bold text-amber-900 dark:text-amber-100"><input type="checkbox" checked={allowConflicts} onChange={(inputEvent) => setAllowConflicts(inputEvent.target.checked)} className="mt-1 h-4 w-4 accent-amber-600" />Créer malgré les avertissements autorisés. Les conflits bloquants restent interdits.</label></section> : null}
        <div className="flex flex-col justify-end gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">Annuler</Button><Button type="submit" className="rounded-xl bg-dtsc-blue text-white">Enregistrer et notifier</Button></div>
      </form>
    </Dialog>
  );
}

function ViewButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof CalendarCheck2; label: string; count: number }) { return <button type="button" onClick={onClick} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-black ${active ? "bg-cyan-400 text-[#001736]" : "border border-dtsc-border bg-dtsc-surface text-dtsc-muted"}`}><Icon className="h-4 w-4" />{label}<span className="rounded-full bg-black/10 px-2 py-0.5 text-xs">{count}</span></button>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>; }
function railClass(active: boolean) { return `shrink-0 rounded-xl px-3 py-2 text-sm font-black ${active ? "bg-cyan-400 text-[#001736]" : "border border-dtsc-border bg-dtsc-page text-dtsc-muted"}`; }
function canManageEvent(event: ProfessionalCalendarEvent, context: CalendarContext) { return event.createdBy === context.userId && event.ownerCollaboratorId === context.employeeId; }
function isMyEvent(event: ProfessionalCalendarEvent, context: CalendarContext) { return event.createdBy === context.userId || event.ownerCollaboratorId === context.employeeId || event.participants.some((participant) => participant.collaboratorId === context.employeeId && participant.participantStatus === "Actif" && participant.responseStatus === "Accepté"); }
function collaboratorName(collaborators: ProfessionalCalendarCollaborator[], collaboratorId?: string | null) { return collaborators.find((item) => item.id === collaboratorId)?.fullName || "Collaborateur"; }
function groupBy<T>(items: T[], key: (item: T) => string) { const map = new Map<string, T[]>(); for (const item of items) { const value = key(item); map.set(value, [...(map.get(value) || []), item]); } return map; }
function todayKey() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function resolveDateRange(preset: DatePreset, customDate: string) { const now = preset === "custom" ? new Date(`${customDate}T00:00:00`) : new Date(); const start = new Date(now); const end = new Date(now); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); if (preset === "week") { const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day); end.setTime(start.getTime()); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999); } if (preset === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); } if (preset === "year") { start.setMonth(0, 1); end.setMonth(11, 31); } return { start, end }; }
function availabilityIntersectsRange(record: ProfessionalAvailability, start: Date, end: Date) { const rangeStart = start.toISOString().slice(0, 10); const rangeEnd = end.toISOString().slice(0, 10); if (record.specificDate) { const date = record.specificDate.slice(0, 10); return date >= rangeStart && date <= rangeEnd; } const recurrenceStart = record.recurrenceStart?.slice(0, 10) || "0000-01-01"; const recurrenceUntil = record.recurrenceUntil?.slice(0, 10) || "9999-12-31"; if (recurrenceStart > rangeEnd || recurrenceUntil < rangeStart) return false; if (record.recurrenceType !== "Hebdomadaire" || typeof record.dayOfWeek !== "number") return true; const cursor = new Date(start); while (cursor <= end) { if (cursor.getDay() === record.dayOfWeek) return true; cursor.setDate(cursor.getDate() + 1); } return false; }
function availabilityDateLabel(record: ProfessionalAvailability, locale?: string | null, timezone?: string | null) { if (record.specificDate) return formatDate(new Date(record.specificDate), locale, timezone); if (record.recurrenceType === "Hebdomadaire" && typeof record.dayOfWeek === "number") return `${["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"][record.dayOfWeek]} · ${record.recurrenceStart ? `depuis ${formatDate(new Date(record.recurrenceStart), locale, timezone)}` : "récurrent"}${record.recurrenceUntil ? ` jusqu'au ${formatDate(new Date(record.recurrenceUntil), locale, timezone)}` : ""}`; return record.recurrenceType; }
function formatDate(date: Date, locale?: string | null, timezone?: string | null) { return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeZone: timezone || "Africa/Kinshasa" }).format(date); }
function formatDateTimeRange(start: string, end: string) { const formatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }); return `${formatter.format(new Date(start))} — ${formatter.format(new Date(end))}`; }
function toDateTimeInput(value?: string | null) { if (!value) return ""; const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
