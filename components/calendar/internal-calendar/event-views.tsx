"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { OperationalChecklistPanel } from "@/components/operations/operational-checklist-panel";
import { canManageEvent, collaboratorName } from "./helpers";
import { formatCalendarDateTime, formatCalendarRange } from "./format";
import { calendarWorkspaceText, eventStatusLabel, eventTypeLabel, participantRoleLabel, priorityLabel, responseStatusLabel, serverFallback, workModeLabel } from "./text";
import type { CalendarContext, ProfessionalCalendarCollaborator, ProfessionalCalendarEvent } from "./types";

export function InvitationList({ invitations, collaborators, locale, timezone, onSelect, onRespond }: {
  invitations: ProfessionalCalendarEvent[];
  collaborators: ProfessionalCalendarCollaborator[];
  locale?: string | null;
  timezone?: string | null;
  onSelect: (id: string) => void;
  onRespond: (event: ProfessionalCalendarEvent, value: "ACCEPT" | "DECLINE") => void;
}) {
  const text = calendarWorkspaceText(locale);
  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <h2 className="text-2xl font-black text-dtsc-ink">{text.pendingInvitations}</h2>
      <p className="mt-2 text-sm leading-6 text-dtsc-muted">{text.pendingInvitationsDescription}</p>
      <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-2">
        {invitations.map((event) => (
          <article key={event.id} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <button type="button" onClick={() => onSelect(event.id)} className="block w-full text-left">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600">{eventTypeLabel(event.eventType, locale)} · {priorityLabel(event.priority, locale)}</p>
              <h3 className="mt-2 break-words text-lg font-black text-dtsc-ink">{event.title}</h3>
              <p className="mt-2 text-sm font-bold text-dtsc-muted">{formatCalendarRange(event.startDateTime, event.endDateTime, locale, timezone)}</p>
              <p className="mt-1 text-xs text-dtsc-muted">{text.owner} : {collaboratorName(collaborators, event.ownerCollaboratorId, text.collaborator)}</p>
            </button>
            {event.conflicts.length ? <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">{event.conflicts.map((conflict) => <p key={conflict.id}>• {serverFallback(locale, conflict.message, text.slotWarning)}</p>)}</div> : null}
            <div className="mt-4 flex gap-2"><Button type="button" onClick={() => onRespond(event, "ACCEPT")} className="flex-1 rounded-xl bg-emerald-600 text-white"><Check className="h-4 w-4" /> {text.accept}</Button><Button type="button" variant="outline" onClick={() => onRespond(event, "DECLINE")} className="flex-1 rounded-xl border-red-500/30 text-red-700"><X className="h-4 w-4" /> {text.decline}</Button></div>
          </article>
        ))}
        {!invitations.length ? <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-8 text-center text-sm text-dtsc-muted lg:col-span-2">{text.noInvitations}</p> : null}
      </div>
    </section>
  );
}

export function EventCard({ event, ownerName, selected, canEdit, locale, timezone, onSelect, onEdit, onDelete }: {
  event: ProfessionalCalendarEvent;
  ownerName: string;
  selected: boolean;
  canEdit: boolean;
  locale?: string | null;
  timezone?: string | null;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const text = calendarWorkspaceText(locale);
  return (
    <article className={`relative min-w-0 rounded-2xl border p-4 ${selected ? "border-cyan-300 bg-cyan-400/10" : "border-dtsc-border bg-dtsc-page"}`}>
      {canEdit ? <div className="absolute right-3 top-3"><ActionMenu label={text.eventActions} items={[{ key: "edit", label: text.edit, icon: Pencil, onSelect: onEdit }, { key: "delete", label: text.cancel, icon: Trash2, destructive: true, onSelect: onDelete }]} /></div> : null}
      <button type="button" onClick={onSelect} className="block w-full min-w-0 pr-12 text-left">
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-black text-cyan-700">{eventTypeLabel(event.eventType, locale)}</span><span className="rounded-full bg-dtsc-surface px-2.5 py-1 text-xs font-black text-dtsc-muted">{eventStatusLabel(event.status, locale)}</span>{event.conflicts.length ? <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-black text-amber-700">{event.conflicts.length} {text.conflicts}</span> : null}</div>
        <h3 className="mt-3 break-words text-lg font-black text-dtsc-ink">{event.title}</h3>
        <p className="mt-2 text-sm font-bold text-dtsc-muted">{formatCalendarRange(event.startDateTime, event.endDateTime, locale, timezone)}</p>
        <p className="mt-1 text-xs text-dtsc-muted">{text.owner} : {ownerName}</p>
      </button>
    </article>
  );
}

export function EventDetail({ event, collaborators, context, locale, timezone, onEdit, onDelete }: {
  event: ProfessionalCalendarEvent;
  collaborators: ProfessionalCalendarCollaborator[];
  context: CalendarContext;
  locale?: string | null;
  timezone?: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const text = calendarWorkspaceText(locale);
  const canEdit = canManageEvent(event, context);
  const location = [workModeLabel(event.locationMode, locale), event.physicalLocation].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{eventTypeLabel(event.eventType, locale)} · {eventStatusLabel(event.status, locale)}</p><h2 className="mt-2 break-words text-2xl font-black text-dtsc-ink">{event.title}</h2><p className="mt-2 text-sm font-bold text-dtsc-muted">{formatCalendarRange(event.startDateTime, event.endDateTime, locale, timezone)}</p></div>
        {canEdit ? <ActionMenu label={text.eventActions} items={[{ key: "edit", label: text.edit, icon: Pencil, onSelect: onEdit }, { key: "delete", label: text.cancel, icon: Trash2, destructive: true, onSelect: onDelete }]} /> : null}
      </div>
      {event.description ? <p className="whitespace-pre-wrap text-sm leading-7 text-dtsc-muted">{event.description}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2"><Detail label={text.owner} value={collaboratorName(collaborators, event.ownerCollaboratorId, text.collaborator)} /><Detail label={text.locationMode} value={location || workModeLabel("Non défini", locale)} /><Detail label={text.createdAt} value={formatCalendarDateTime(event.createdAt, locale, timezone)} /><Detail label={text.updatedAt} value={formatCalendarDateTime(event.updatedAt, locale, timezone)} /></div>
      <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">{text.participants}</h3><div className="mt-3 space-y-2">{event.participants.map((participant) => <div key={participant.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><span className="min-w-0 break-words text-sm font-bold text-dtsc-ink">{collaboratorName(collaborators, participant.collaboratorId, text.collaborator)} · {participantRoleLabel(participant.role, locale)}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${participant.responseStatus === "Accepté" ? "bg-emerald-500/10 text-emerald-700" : participant.responseStatus === "Refusé" ? "bg-red-500/10 text-red-700" : "bg-amber-500/10 text-amber-700"}`}>{responseStatusLabel(participant.responseStatus, locale)}</span></div>)}</div></section>
      {event.conflicts.length ? <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"><h3 className="font-black text-amber-800 dark:text-amber-200">{text.detectedConflicts}</h3><div className="mt-2 space-y-2 text-sm leading-6 text-amber-800 dark:text-amber-200">{event.conflicts.map((conflict) => <p key={conflict.id}>• {serverFallback(locale, conflict.message, text.slotWarning)}</p>)}</div></section> : null}
      <OperationalChecklistPanel objectType="CALENDAR_EVENT" objectId={event.id} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>; }
