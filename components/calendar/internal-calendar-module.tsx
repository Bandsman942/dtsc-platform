"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Clock, Filter, Pencil, Plus, RefreshCcw, Search, Trash2, Users, type LucideIcon } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { translate } from "@/lib/i18n";
import type { UserDatePreferences } from "@/lib/user-format";

type CalendarParticipant = {
  id: string;
  collaboratorId: string;
  participantStatus: string;
  responseStatus: string;
  role: string;
};

type CalendarConflict = {
  id: string;
  collaboratorId: string;
  conflictType: string;
  severity: string;
  message: string;
  resolved: boolean;
};

export type CalendarEventItem = {
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
  participants: CalendarParticipant[];
  conflicts: CalendarConflict[];
};

export type CalendarAvailabilityItem = {
  id: string;
  collaboratorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  availabilityStatus: string;
  recurrenceType: string;
  locationMode: string;
  notes?: string | null;
};

type CollaboratorOption = {
  id: string;
  fullName: string;
  email?: string | null;
  department: string;
  departmentId?: string | null;
  jobTitle: string;
  userId?: string | null;
};

export function InternalCalendarModule({
  initialEvents,
  initialAvailabilities,
  collaborators,
  context,
  userPreferences,
}: {
  initialEvents: CalendarEventItem[];
  initialAvailabilities: CalendarAvailabilityItem[];
  collaborators: CollaboratorOption[];
  context: { employeeId?: string | null; canViewGlobal: boolean; canManagePeople: boolean; canOverrideConflicts: boolean };
  userPreferences: UserDatePreferences;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [availabilities, setAvailabilities] = useState(initialAvailabilities);
  const [activeView, setActiveView] = useState("today");
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [availabilityFormOpen, setAvailabilityFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(initialEvents[0] || null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [eventToCancel, setEventToCancel] = useState<CalendarEventItem | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const locale = userPreferences.locale || "fr";
  const visibleEvents = useMemo(() => filterEventsByView(events, activeView), [activeView, events]);
  const eventList = useSmartList({
    items: visibleEvents,
    pageSize: 8,
    getSearchText: (event) => [event.title, event.eventType, event.status, event.priority, event.locationMode, collaboratorName(collaborators, event.ownerCollaboratorId)].join(" "),
  });
  const conflicts = events.flatMap((event) => event.conflicts.map((conflict) => ({ ...conflict, eventTitle: event.title })));

  async function refreshCalendar() {
    const response = await fetch("/api/calendar", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { events?: CalendarEventItem[]; availabilities?: CalendarAvailabilityItem[]; message?: string } | null;
    if (!response.ok || !body) {
      setStatusMessage(body?.message || "Actualisation impossible.");
      return;
    }
    setEvents(body.events || []);
    setAvailabilities(body.availabilities || []);
    setStatusMessage("Calendrier actualisé.");
  }

  async function cancelEvent(event: CalendarEventItem) {
    const response = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setStatusMessage(body?.message || "Annulation impossible.");
      return;
    }
    setEvents((current) => current.filter((item) => item.id !== event.id));
    setSelectedEvent(null);
    setMobileDetailOpen(false);
    setEventToCancel(null);
    setStatusMessage("Événement annulé.");
  }

  function upsertEvent(event: CalendarEventItem) {
    setEvents((current) => {
      const exists = current.some((item) => item.id === event.id);
      return exists ? current.map((item) => item.id === event.id ? event : item) : [event, ...current];
    });
    setSelectedEvent(event);
  }

  function selectEvent(event: CalendarEventItem) {
    setSelectedEvent(event);
    setMobileDetailOpen(true);
  }

  return (
    <div className="space-y-5">
      <section className="dtsc-panel p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">{translate(locale, "calendar.eyebrow")}</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-dtsc-ink sm:text-4xl">{translate(locale, "calendar.title")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">{translate(locale, "calendar.description")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setEventFormOpen(true)} className="rounded-2xl bg-dtsc-navy text-white hover:bg-[#002b5b]">
              <Plus className="h-4 w-4" />
              {translate(locale, "calendar.newEvent")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAvailabilityFormOpen(true)} className="rounded-2xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
              <Clock className="h-4 w-4" />
              {translate(locale, "calendar.availability")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void refreshCalendar()} className="rounded-2xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
              <RefreshCcw className="h-4 w-4" />
              {translate(locale, "calendar.refresh")}
            </Button>
          </div>
        </div>
        {statusMessage && <p className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-cyan-700 dark:text-cyan-100">{statusMessage}</p>}
      </section>

      <Accordion>
        <AccordionItem title={translate(locale, "calendar.kpis")} defaultOpen>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={translate(locale, "calendar.upcoming")} value={events.filter((event) => new Date(event.startDateTime).getTime() >= Date.now()).length} onClick={() => setActiveView("week")} />
            <MetricCard label={translate(locale, "calendar.conflicts")} value={conflicts.length} tone={conflicts.length ? "warning" : "success"} onClick={() => setActiveView("conflicts")} />
            <MetricCard label={translate(locale, "calendar.availabilities")} value={availabilities.length} onClick={() => setActiveView("availability")} />
            <MetricCard label={translate(locale, "calendar.collaborators")} value={collaborators.length} onClick={() => setActiveView("collaborator")} />
          </section>
        </AccordionItem>
      </Accordion>

      <section className="dtsc-card p-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["today", "week", "month", "collaborator", "department", "conflicts", "availability"].map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-black transition ${activeView === view ? "bg-cyan-400 text-[#001736]" : "bg-dtsc-page text-dtsc-muted hover:bg-cyan-400/10"}`}
            >
              {translate(locale, `calendar.views.${view}`)}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="dtsc-card min-w-0 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-cyan-500" />
            <h2 className="font-black text-dtsc-ink">{translate(locale, "calendar.events")}</h2>
          </div>
          <ListControls
            query={eventList.query}
            onQueryChange={eventList.setQuery}
            page={eventList.page}
            pageCount={eventList.pageCount}
            totalCount={eventList.totalCount}
            filteredCount={eventList.filteredCount}
            placeholder={translate(locale, "calendar.searchPlaceholder")}
            onPageChange={eventList.setPage}
          />
          <div className="mt-4 max-h-[68dvh] space-y-3 overflow-y-auto pr-1">
            {eventList.paginatedItems.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                ownerName={collaboratorName(collaborators, event.ownerCollaboratorId)}
                selected={selectedEvent?.id === event.id}
                onSelect={() => selectEvent(event)}
                onEdit={() => setEditingEvent(event)}
                onCancel={() => setEventToCancel(event)}
              />
            ))}
            {eventList.paginatedItems.length === 0 && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">{translate(locale, "calendar.empty")}</p>}
          </div>
        </section>

        <section className="dtsc-card hidden min-w-0 p-4 xl:block">
          {activeView === "availability" ? (
            <AvailabilityList availabilities={availabilities} collaborators={collaborators} locale={locale} />
          ) : activeView === "conflicts" ? (
            <ConflictList conflicts={conflicts} collaborators={collaborators} locale={locale} />
          ) : selectedEvent ? (
            <EventDetail event={selectedEvent} collaborators={collaborators} locale={locale} onEdit={() => setEditingEvent(selectedEvent)} onCancel={() => setEventToCancel(selectedEvent)} />
          ) : (
            <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-5 text-sm text-dtsc-muted">{translate(locale, "calendar.selectEvent")}</p>
          )}
        </section>
      </div>

      {eventFormOpen && (
        <EventFormDialog
          collaborators={collaborators}
          context={context}
          locale={locale}
          onClose={() => setEventFormOpen(false)}
          onSaved={(event) => {
            upsertEvent(event);
            setEventFormOpen(false);
            setStatusMessage("Événement créé.");
          }}
        />
      )}

      {editingEvent && (
        <EventFormDialog
          event={editingEvent}
          collaborators={collaborators}
          context={context}
          locale={locale}
          onClose={() => setEditingEvent(null)}
          onSaved={(event) => {
            upsertEvent(event);
            setEditingEvent(null);
            setStatusMessage("Événement modifié.");
          }}
        />
      )}

      {availabilityFormOpen && (
        <AvailabilityFormDialog
          collaborators={collaborators}
          context={context}
          locale={locale}
          onClose={() => setAvailabilityFormOpen(false)}
          onCreated={(availability) => {
            setAvailabilities((current) => [availability, ...current]);
            setAvailabilityFormOpen(false);
            setStatusMessage("Disponibilité enregistrée.");
          }}
        />
      )}

      {eventToCancel && (
        <Dialog open title={translate(locale, "calendar.cancelEvent")} description={eventToCancel.title} onClose={() => setEventToCancel(null)} className="max-w-lg">
          <p className="text-sm leading-6 text-dtsc-muted">{translate(locale, "calendar.cancelConfirm")}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEventToCancel(null)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
              {translate(locale, "common.cancel")}
            </Button>
            <Button type="button" onClick={() => void cancelEvent(eventToCancel)} className="rounded-xl bg-red-600 text-white hover:bg-red-700">
              {translate(locale, "calendar.cancelEvent")}
            </Button>
          </div>
        </Dialog>
      )}

      {selectedEvent && mobileDetailOpen && (
        <div className="fixed inset-0 z-[90] overflow-hidden bg-dtsc-page xl:hidden">
          <div className="flex h-dvh flex-col">
            <div className="flex shrink-0 items-center gap-3 border-b border-dtsc-border bg-dtsc-surface px-4 py-3">
              <Button type="button" variant="ghost" size="icon" onClick={() => setMobileDetailOpen(false)} className="rounded-xl text-dtsc-ink">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{selectedEvent.eventType}</p>
                <h2 className="truncate text-lg font-black text-dtsc-ink">{selectedEvent.title}</h2>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <EventDetail event={selectedEvent} collaborators={collaborators} locale={locale} onEdit={() => setEditingEvent(selectedEvent)} onCancel={() => setEventToCancel(selectedEvent)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventFormDialog({
  event,
  collaborators,
  context,
  locale,
  onClose,
  onSaved,
}: {
  event?: CalendarEventItem;
  collaborators: CollaboratorOption[];
  context: { employeeId?: string | null; canManagePeople: boolean; canOverrideConflicts: boolean };
  locale: string;
  onClose: () => void;
  onSaved: (event: CalendarEventItem) => void;
}) {
  const [message, setMessage] = useState("");
  const [conflicts, setConflicts] = useState<Array<{ message: string; severity: string }>>([]);
  const [allowConflicts, setAllowConflicts] = useState(false);
  const defaultOwner = event?.ownerCollaboratorId || context.employeeId || collaborators[0]?.id || "";
  const selectedParticipants = new Set(event?.participants.map((participant) => participant.collaboratorId) || [defaultOwner]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const participantIds = formData.getAll("participantIds").map(String);
    const payload = {
      title: String(formData.get("title") || ""),
      description: String(formData.get("description") || ""),
      eventType: String(formData.get("eventType") || "Tâche"),
      startDateTime: String(formData.get("startDateTime") || ""),
      endDateTime: String(formData.get("endDateTime") || ""),
      priority: String(formData.get("priority") || "Normale"),
      status: "Planifié",
      locationMode: String(formData.get("locationMode") || "Non défini"),
      physicalLocation: String(formData.get("physicalLocation") || ""),
      ownerCollaboratorId: String(formData.get("ownerCollaboratorId") || defaultOwner),
      visibility: String(formData.get("visibility") || "Participants"),
      participantIds,
      allowConflicts,
    };
    const endpoint = event.currentTarget.dataset.eventId ? `/api/calendar/events/${event.currentTarget.dataset.eventId}` : "/api/calendar";
    const response = await fetch(endpoint, {
      method: event.currentTarget.dataset.eventId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { event?: CalendarEventItem; message?: string; conflicts?: Array<{ message: string; severity: string }> } | null;
    if (response.status === 409 && body?.conflicts) {
      setConflicts(body.conflicts);
      setMessage(body.message || "Conflit détecté.");
      return;
    }
    if (!response.ok || !body?.event) {
      setMessage(body?.message || "Création impossible.");
      return;
    }
    onSaved(body.event);
  }

  return (
    <Dialog open title={event ? translate(locale, "calendar.editEvent") : translate(locale, "calendar.newEvent")} description={translate(locale, "calendar.eventFormDescription")} onClose={onClose} className="h-[92dvh] max-w-4xl">
      <form onSubmit={submit} data-event-id={event?.id || ""} className="grid min-h-0 gap-4 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldShell label={translate(locale, "calendar.fields.title")} hint="Nom lisible de l'événement dans votre calendrier DTSC.">
            <Input name="title" required defaultValue={event?.title || ""} placeholder={translate(locale, "calendar.fields.title")} className="h-12 rounded-2xl bg-dtsc-page" />
          </FieldShell>
          <FieldShell label="Type d'événement" hint="Le type peut créer un objet lié dans COO, SCO ou Mes collaborateurs.">
          <select name="eventType" defaultValue={event?.eventType || "Tâche"} className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
            {["Tâche", "Réunion", "Mission", "Absence", "Congé", "Télétravail", "Présence sur site", "Appel audio", "Appel vidéo", "Formation", "Blocage", "Deadline", "Autre"].map((type) => <option key={type}>{type}</option>)}
          </select>
          </FieldShell>
          <FieldShell label="Début" hint="Date et heure de démarrage prévues.">
            <Input name="startDateTime" required type="datetime-local" defaultValue={toDateTimeInput(event?.startDateTime)} className="h-12 rounded-2xl bg-dtsc-page" />
          </FieldShell>
          <FieldShell label="Fin" hint="Date et heure de fin prévues.">
            <Input name="endDateTime" required type="datetime-local" defaultValue={toDateTimeInput(event?.endDateTime)} className="h-12 rounded-2xl bg-dtsc-page" />
          </FieldShell>
          <FieldShell label="Responsable" hint="Collaborateur propriétaire du planning concerné.">
          <select name="ownerCollaboratorId" defaultValue={defaultOwner} disabled={!context.canManagePeople} className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
            {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.fullName}</option>)}
          </select>
          </FieldShell>
          <FieldShell label="Priorité" hint="Importance opérationnelle de l'événement.">
          <select name="priority" defaultValue={event?.priority || "Normale"} className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
            {["Faible", "Normale", "Élevée", "Critique"].map((priority) => <option key={priority}>{priority}</option>)}
          </select>
          </FieldShell>
          <FieldShell label="Mode de lieu" hint="Site, télétravail, mission ou lieu externe.">
          <select name="locationMode" defaultValue={event?.locationMode || "Non défini"} className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
            {["Non défini", "Site DTSC", "Télétravail", "Externe", "Mission"].map((mode) => <option key={mode}>{mode}</option>)}
          </select>
          </FieldShell>
          <FieldShell label={translate(locale, "calendar.fields.location")} hint="Salle, adresse, lien interne ou précision utile.">
            <Input name="physicalLocation" defaultValue={event?.physicalLocation || ""} placeholder={translate(locale, "calendar.fields.location")} className="h-12 rounded-2xl bg-dtsc-page" />
          </FieldShell>
          <FieldShell label={translate(locale, "calendar.visibility")} hint="Privé limite l'accès au créateur/propriétaire; Participants limite aux membres sélectionnés.">
          <select name="visibility" defaultValue={event?.visibility || "Participants"} className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
            {["Participants", "Privé", "Département", "Direction", "Public interne"].map((visibility) => <option key={visibility}>{visibility}</option>)}
          </select>
          </FieldShell>
        </div>
        <FieldShell label={translate(locale, "calendar.fields.description")} hint="Contexte, ordre du jour, consignes ou détails utiles pour les participants.">
          <textarea name="description" defaultValue={event?.description || ""} placeholder={translate(locale, "calendar.fields.description")} className="min-h-28 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink outline-none focus:ring-2 focus:ring-cyan-300" />
        </FieldShell>
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{translate(locale, "calendar.participants")}</p>
          <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
            {collaborators.map((collaborator) => (
              <label key={collaborator.id} className="flex items-center gap-2 rounded-xl bg-dtsc-surface px-3 py-2 text-sm font-bold text-dtsc-ink">
                <input name="participantIds" type="checkbox" value={collaborator.id} defaultChecked={selectedParticipants.has(collaborator.id)} />
                <span className="min-w-0 truncate">{collaborator.fullName}</span>
              </label>
            ))}
          </div>
        </div>
        {conflicts.length > 0 && (
          <div className="rounded-2xl border border-amber-300/50 bg-amber-300/10 p-3 text-sm text-amber-800 dark:text-amber-100">
            <p className="font-black">{message}</p>
            <ul className="mt-2 space-y-1">
              {conflicts.map((conflict, index) => <li key={`${conflict.message}-${index}`}>{conflict.severity}: {conflict.message}</li>)}
            </ul>
            {context.canOverrideConflicts && (
              <label className="mt-3 flex items-center gap-2 font-bold">
                <input type="checkbox" checked={allowConflicts} onChange={(event) => setAllowConflicts(event.target.checked)} />
                {translate(locale, "calendar.allowConflicts")}
              </label>
            )}
          </div>
        )}
        {message && conflicts.length === 0 && <p className="rounded-2xl bg-cyan-400/10 p-3 text-sm font-bold text-cyan-700 dark:text-cyan-100">{message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">{translate(locale, "common.cancel")}</Button>
          <Button type="submit" className="rounded-xl bg-dtsc-navy text-white">{translate(locale, "common.save")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function AvailabilityFormDialog({
  collaborators,
  context,
  locale,
  onClose,
  onCreated,
}: {
  collaborators: CollaboratorOption[];
  context: { employeeId?: string | null; canManagePeople: boolean };
  locale: string;
  onClose: () => void;
  onCreated: (availability: CalendarAvailabilityItem) => void;
}) {
  const [message, setMessage] = useState("");
  const defaultOwner = context.employeeId || collaborators[0]?.id || "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      collaboratorId: String(formData.get("collaboratorId") || defaultOwner),
      dayOfWeek: Number(formData.get("dayOfWeek") || 1),
      startTime: String(formData.get("startTime") || ""),
      endTime: String(formData.get("endTime") || ""),
      availabilityStatus: String(formData.get("availabilityStatus") || "Disponible"),
      recurrenceType: String(formData.get("recurrenceType") || "Hebdomadaire"),
      locationMode: String(formData.get("locationMode") || "Non défini"),
      notes: String(formData.get("notes") || ""),
    };
    const response = await fetch("/api/calendar/availabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { availability?: CalendarAvailabilityItem; message?: string } | null;
    if (!response.ok || !body?.availability) {
      setMessage(body?.message || "Enregistrement impossible.");
      return;
    }
    onCreated(body.availability);
  }

  return (
    <Dialog open title={translate(locale, "calendar.availability")} description={translate(locale, "calendar.availabilityDescription")} onClose={onClose} className="max-w-3xl">
      <form onSubmit={submit} className="grid gap-3">
        <select name="collaboratorId" defaultValue={defaultOwner} disabled={!context.canManagePeople} className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
          {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.fullName}</option>)}
        </select>
        <div className="grid gap-3 sm:grid-cols-3">
          <select name="dayOfWeek" defaultValue={1} className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
            {weekDays.map((day, index) => <option key={day} value={index}>{translate(locale, `calendar.days.${day}`)}</option>)}
          </select>
          <Input name="startTime" required type="time" defaultValue="08:00" className="h-12 rounded-2xl bg-dtsc-page" />
          <Input name="endTime" required type="time" defaultValue="17:00" className="h-12 rounded-2xl bg-dtsc-page" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <select name="availabilityStatus" className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
            {["Disponible", "Occupé", "Absent", "Congé", "Télétravail", "Sur site", "Mission", "Formation", "Indisponible"].map((status) => <option key={status}>{status}</option>)}
          </select>
          <select name="locationMode" className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
            {["Non défini", "Site DTSC", "Télétravail", "Externe", "Mission"].map((mode) => <option key={mode}>{mode}</option>)}
          </select>
          <select name="recurrenceType" defaultValue="Hebdomadaire" className="h-12 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
            {["Aucune", "Quotidienne", "Hebdomadaire", "Mensuelle"].map((type) => <option key={type}>{type}</option>)}
          </select>
        </div>
        <textarea name="notes" placeholder={translate(locale, "calendar.fields.notes")} className="min-h-24 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink outline-none focus:ring-2 focus:ring-cyan-300" />
        {message && <p className="rounded-2xl bg-red-500/10 p-3 text-sm font-bold text-red-600">{message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">{translate(locale, "common.cancel")}</Button>
          <Button type="submit" className="rounded-xl bg-dtsc-navy text-white">{translate(locale, "common.save")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EventCard({
  event,
  ownerName,
  selected,
  onSelect,
  onEdit,
  onCancel,
}: {
  event: CalendarEventItem;
  ownerName: string;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={`relative rounded-3xl border p-4 transition ${selected ? "border-cyan-300 bg-cyan-400/10" : "border-dtsc-border bg-dtsc-page"}`}>
      <div className="absolute right-3 top-3">
        <ActionMenu
          label="Actions événement"
          items={[
            { key: "edit", label: "Modifier", icon: Pencil, onSelect: onEdit },
            { key: "cancel", label: "Annuler", icon: Trash2, destructive: true, onSelect: onCancel },
          ]}
        />
      </div>
      <button type="button" onClick={onSelect} className="block w-full pr-12 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={event.eventType} />
          <StatusBadge value={event.priority} />
          {event.conflicts.length > 0 && <StatusBadge value={`${event.conflicts.length} conflit(s)`} tone="warning" />}
        </div>
        <h3 className="mt-3 line-clamp-2 text-lg font-black text-dtsc-ink">{event.title}</h3>
        <p className="mt-2 text-sm text-dtsc-muted">{formatDateTime(event.startDateTime)} - {formatDateTime(event.endDateTime)}</p>
        <p className="mt-1 text-xs font-bold text-dtsc-muted">{ownerName}</p>
      </button>
    </div>
  );
}

function EventDetail({
  event,
  collaborators,
  locale,
  onEdit,
  onCancel,
}: {
  event: CalendarEventItem;
  collaborators: CollaboratorOption[];
  locale: string;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="min-h-0 space-y-4">
      <div className="rounded-3xl border border-dtsc-border bg-dtsc-page p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge value={event.status} />
            <StatusBadge value={event.eventType} />
            <StatusBadge value={event.locationMode} />
          </div>
          <ActionMenu
            label="Actions événement"
            items={[
              { key: "edit", label: "Modifier", icon: Pencil, onSelect: onEdit },
              { key: "cancel", label: "Annuler", icon: Trash2, destructive: true, onSelect: onCancel },
            ]}
          />
        </div>
        <h2 className="mt-3 text-2xl font-black text-dtsc-ink">{event.title}</h2>
        <p className="mt-2 text-sm text-dtsc-muted">{formatDateTime(event.startDateTime)} - {formatDateTime(event.endDateTime)}</p>
        {event.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-dtsc-muted">{event.description}</p>}
      </div>
      <Accordion>
        <AccordionItem title="Informations clés" defaultOpen>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailCard icon={Users} label={translate(locale, "calendar.participants")} value={`${event.participants.length}`} />
            <DetailCard icon={Filter} label={translate(locale, "calendar.visibility")} value={event.visibility} />
          </div>
        </AccordionItem>
        <AccordionItem title={translate(locale, "calendar.participants")}>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {event.participants.map((participant) => (
              <div key={participant.id} className="flex items-center justify-between rounded-2xl bg-dtsc-surface px-3 py-2 text-sm">
                <span className="font-bold text-dtsc-ink">{collaboratorName(collaborators, participant.collaboratorId)}</span>
                <span className="text-xs font-black text-cyan-600">{participant.responseStatus}</span>
              </div>
            ))}
            {event.participants.length === 0 && <p className="text-sm text-dtsc-muted">Aucun participant sélectionné.</p>}
          </div>
        </AccordionItem>
        <AccordionItem title={translate(locale, "calendar.conflicts")} defaultOpen={event.conflicts.length > 0}>
          <ConflictList conflicts={event.conflicts.map((conflict) => ({ ...conflict, eventTitle: event.title }))} collaborators={collaborators} locale={locale} />
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function AvailabilityList({ availabilities, collaborators, locale }: { availabilities: CalendarAvailabilityItem[]; collaborators: CollaboratorOption[]; locale: string }) {
  return (
    <div>
      <h2 className="font-black text-dtsc-ink">{translate(locale, "calendar.availabilities")}</h2>
      <div className="mt-4 max-h-[68dvh] space-y-3 overflow-y-auto pr-1">
        {availabilities.map((availability) => (
          <div key={availability.id} className="rounded-3xl border border-dtsc-border bg-dtsc-page p-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge value={availability.availabilityStatus} />
              <StatusBadge value={availability.locationMode} />
            </div>
            <p className="mt-3 font-black text-dtsc-ink">{collaboratorName(collaborators, availability.collaboratorId)}</p>
            <p className="text-sm text-dtsc-muted">{translate(locale, `calendar.days.${weekDays[availability.dayOfWeek] || "monday"}`)} · {availability.startTime} - {availability.endTime}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConflictList({
  conflicts,
  collaborators = [],
  locale,
}: {
  conflicts: Array<CalendarConflict & { eventTitle: string }>;
  collaborators?: CollaboratorOption[];
  locale: string;
}) {
  return (
    <div>
      <h2 className="font-black text-dtsc-ink">{translate(locale, "calendar.conflicts")}</h2>
      <div className="mt-4 max-h-[68dvh] space-y-3 overflow-y-auto pr-1">
        {conflicts.map((conflict) => (
          <div key={conflict.id} className="rounded-3xl border border-amber-300/40 bg-amber-300/10 p-4 text-sm">
            <p className="font-black text-dtsc-ink">{conflict.eventTitle}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-cyan-600">{collaboratorName(collaborators, conflict.collaboratorId)}</p>
            <p className="mt-1 font-bold text-amber-700 dark:text-amber-100">{conflict.severity} · {conflict.conflictType}</p>
            <p className="mt-2 text-dtsc-muted">{conflict.message}</p>
          </div>
        ))}
        {conflicts.length === 0 && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">{translate(locale, "calendar.noConflicts")}</p>}
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone = "default", onClick }: { label: string; value: number; tone?: "default" | "warning" | "success"; onClick?: () => void }) {
  const toneClass = tone === "warning" ? "text-amber-500" : tone === "success" ? "text-emerald-500" : "text-cyan-500";
  return (
    <button type="button" onClick={onClick} className="dtsc-card p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className={`mt-3 text-3xl font-black ${toneClass}`}>{value}</p>
    </button>
  );
}

function DetailCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-dtsc-border bg-dtsc-page p-4">
      <Icon className="h-5 w-5 text-cyan-500" />
      <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{label}</p>
      <p className="mt-1 font-black text-dtsc-ink">{value}</p>
    </div>
  );
}

function FieldShell({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</span>
      {children}
      <span className="text-xs leading-5 text-dtsc-muted">{hint}</span>
    </label>
  );
}

function StatusBadge({ value, tone = "default" }: { value: string; tone?: "default" | "warning" }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.08em] ${tone === "warning" ? "bg-amber-300/18 text-amber-600 dark:text-amber-100" : "bg-cyan-400/14 text-cyan-600 dark:text-cyan-200"}`}>
      {value}
    </span>
  );
}

function filterEventsByView(events: CalendarEventItem[], view: string) {
  if (view === "conflicts" || view === "availability" || view === "collaborator" || view === "department") {
    return events;
  }
  const now = new Date();
  return events.filter((event) => {
    const start = new Date(event.startDateTime);
    if (view === "today") {
      return start.toDateString() === now.toDateString();
    }
    if (view === "week") {
      return start.getTime() >= startOfDay(now).getTime() && start.getTime() <= addDays(startOfDay(now), 7).getTime();
    }
    if (view === "month") {
      return start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

function collaboratorName(collaborators: CollaboratorOption[], collaboratorId?: string | null) {
  if (!collaboratorId) {
    return "DTSC";
  }
  return collaborators.find((collaborator) => collaborator.id === collaboratorId)?.fullName || "Collaborateur DTSC";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function toDateTimeInput(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const weekDays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
