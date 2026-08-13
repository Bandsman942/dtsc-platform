"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { collaboratorName } from "./helpers";
import { toDateTimeInput } from "./format";
import {
  calendarWorkspaceText,
  eventTypeLabel,
  persistedEventTypes,
  persistedLocationModes,
  persistedPriorities,
  persistedVisibilities,
  priorityLabel,
  serverFallback,
  visibilityLabel,
  workModeLabel,
} from "./text";
import type { CalendarContext, EventTemplate, ProfessionalCalendarCollaborator, ProfessionalCalendarEvent } from "./types";

export function EventFormDialog({ event, template, collaborators, context, locale, onClose, onSaved }: {
  event?: ProfessionalCalendarEvent;
  template?: EventTemplate;
  collaborators: ProfessionalCalendarCollaborator[];
  context: CalendarContext;
  locale?: string | null;
  onClose: () => void;
  onSaved: (event: ProfessionalCalendarEvent) => void;
}) {
  const text = calendarWorkspaceText(locale);
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
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      eventType: String(form.get("eventType") || "Tâche"),
      startDateTime: String(form.get("startDateTime") || ""),
      endDateTime: String(form.get("endDateTime") || ""),
      priority: String(form.get("priority") || "Normale"),
      status: event?.status || "Planifié",
      locationMode: String(form.get("locationMode") || "Non défini"),
      physicalLocation: String(form.get("physicalLocation") || ""),
      ownerCollaboratorId: context.employeeId,
      visibility: String(form.get("visibility") || "Participants"),
      participantIds,
      allowConflicts,
    };
    const endpoint = event ? `/api/calendar/events/${event.id}` : "/api/calendar";
    const response = await fetch(endpoint, { method: event ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { event?: ProfessionalCalendarEvent; message?: string; conflicts?: Array<{ message: string; severity: string }> } | null;
    if (response.status === 409 && body?.conflicts) {
      setConflicts(body.conflicts);
      setMessage(serverFallback(locale, body.message, text.eventSaveConflict));
      return;
    }
    if (!response.ok || !body?.event) {
      setMessage(serverFallback(locale, body?.message, text.saveFailed));
      return;
    }
    onSaved(body.event);
  }

  return (
    <Dialog open title={event ? text.editEvent : text.newEvent} description={text.eventDialogDescription} onClose={onClose} className="h-[94dvh] max-w-4xl">
      <form onSubmit={submit} className="grid min-h-0 min-w-0 gap-4 overflow-y-auto pr-1">
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm leading-6 text-cyan-900 dark:text-cyan-100">
          <strong>{text.ownerImmutablePrefix}</strong> {collaboratorName(collaborators, context.employeeId, text.collaborator)}. {text.ownerImmutableSuffix}
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <FormField label={text.eventTitle} hint={text.eventTitleHint}><Input name="title" required defaultValue={event?.title || template?.title || ""} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={text.eventType} hint={text.eventTypeHint}>
            <select name="eventType" defaultValue={event?.eventType || template?.eventType || "Tâche"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">
              {persistedEventTypes.map((value) => <option key={value} value={value}>{eventTypeLabel(value, locale)}</option>)}
            </select>
          </FormField>
          <FormField label={text.start} hint={text.dateTimeHint}><Input name="startDateTime" type="datetime-local" required defaultValue={toDateTimeInput(event?.startDateTime)} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={text.end} hint={text.dateTimeHint}><Input name="endDateTime" type="datetime-local" required defaultValue={toDateTimeInput(event?.endDateTime)} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={text.priority} hint={text.priorityHint}>
            <select name="priority" defaultValue={event?.priority || "Normale"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">
              {persistedPriorities.map((value) => <option key={value} value={value}>{priorityLabel(value, locale)}</option>)}
            </select>
          </FormField>
          <FormField label={text.visibility} hint={text.visibilityHint}>
            <select name="visibility" defaultValue={event?.visibility || "Participants"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">
              {persistedVisibilities.map((value) => <option key={value} value={value}>{visibilityLabel(value, locale)}</option>)}
            </select>
          </FormField>
          <FormField label={text.location} hint={text.locationHint}>
            <select name="locationMode" defaultValue={event?.locationMode || "Non défini"} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">
              {persistedLocationModes.map((value) => <option key={value} value={value}>{workModeLabel(value, locale)}</option>)}
            </select>
          </FormField>
          <FormField label={text.physicalLocation} hint={text.physicalLocationHint}><Input name="physicalLocation" defaultValue={event?.physicalLocation || ""} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
        </div>
        <FormField label={text.descriptionAgenda} hint={text.descriptionAgendaHint}><textarea name="description" defaultValue={event?.description || ""} className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField>
        <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <h3 className="font-black text-dtsc-ink">{text.participantsToInvite}</h3>
          <p className="mt-1 text-xs leading-5 text-dtsc-muted">{text.participantsToInviteDescription}</p>
          <div className="mt-3 grid max-h-72 min-w-0 gap-2 overflow-y-auto sm:grid-cols-2">
            {collaborators.filter((collaborator) => collaborator.id !== context.employeeId).map((collaborator) => (
              <label key={collaborator.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm">
                <input name="participantIds" value={collaborator.id} type="checkbox" defaultChecked={selected.has(collaborator.id)} className="mt-1 h-4 w-4 shrink-0 accent-cyan-500" />
                <span className="min-w-0"><span className="block break-words font-black text-dtsc-ink">{collaborator.fullName}</span><span className="mt-1 block break-words text-xs text-dtsc-muted">{collaborator.jobTitle} · {collaborator.department}</span></span>
              </label>
            ))}
          </div>
        </section>
        {conflicts.length ? (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <h3 className="font-black text-amber-800 dark:text-amber-200">{text.participantConflicts}</h3>
            <div className="mt-2 space-y-2 text-sm text-amber-800 dark:text-amber-200">{conflicts.map((conflict, index) => <p key={`${conflict.message}-${index}`}>• {serverFallback(locale, conflict.message, text.slotWarning)}</p>)}</div>
            <label className="mt-3 flex items-start gap-2 text-sm font-bold text-amber-900 dark:text-amber-100"><input type="checkbox" checked={allowConflicts} onChange={(inputEvent) => setAllowConflicts(inputEvent.target.checked)} className="mt-1 h-4 w-4 accent-amber-600" />{text.allowWarnings}</label>
          </section>
        ) : null}
        <div className="flex flex-col justify-end gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">{text.cancel}</Button><Button type="submit" className="rounded-xl bg-dtsc-blue text-white">{text.saveAndNotify}</Button></div>
      </form>
    </Dialog>
  );
}
