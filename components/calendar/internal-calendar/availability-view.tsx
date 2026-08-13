"use client";

import { CalendarClock, Filter, UserRoundPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { availabilityDateLabel, formatCalendarDate } from "./format";
import { availabilityStatusLabel, calendarWorkspaceText, recurrenceLabel, workModeLabel } from "./text";
import type { AvailabilityView, DatePreset, ProfessionalAvailability, ProfessionalCalendarCollaborator } from "./types";

export function AvailabilityExplorer({ records, collaborators, departments, statuses, datePreset, customDate, departmentId, availabilityStatus, view, range, byCollaborator, byStatus, onDatePreset, onCustomDate, onDepartment, onStatus, onView, onInvite, locale, timezone }: {
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
  const text = calendarWorkspaceText(locale);
  const views: Array<{ id: AvailabilityView; label: string }> = [
    { id: "list", label: text.viewList },
    { id: "collaborators", label: text.viewByCollaborator },
    { id: "statuses", label: text.viewByStatus },
  ];
  const periods: Array<{ id: DatePreset; label: string }> = [
    { id: "today", label: text.today },
    { id: "week", label: text.thisWeek },
    { id: "month", label: text.thisMonth },
    { id: "year", label: text.thisYear },
    { id: "custom", label: text.specificDate },
  ];

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{text.availabilityEyebrow}</p>
          <h2 className="mt-1 text-2xl font-black text-dtsc-ink">{text.availabilityTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-dtsc-muted">{text.periodFrom} {formatCalendarDate(range.start, locale, timezone)} {text.periodTo} {formatCalendarDate(range.end, locale, timezone)} · {records.length} {text.matchingSlots}</p>
        </div>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1" aria-label={text.availabilityViewsAria}>
          {views.map((item) => <button key={item.id} type="button" onClick={() => onView(item.id)} className={railClass(view === item.id)}>{item.label}</button>)}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted"><CalendarClock className="h-4 w-4" /> {text.period}</p>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label={text.periodFiltersAria}>
            {periods.map((item) => <button key={item.id} type="button" onClick={() => onDatePreset(item.id)} className={railClass(datePreset === item.id)}>{item.label}</button>)}
          </div>
          {datePreset === "custom" ? <Input type="date" value={customDate} onChange={(event) => onCustomDate(event.target.value)} className="mt-2 h-11 max-w-xs rounded-xl bg-dtsc-page" /> : null}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted"><Users className="h-4 w-4" /> {text.department}</p>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label={text.departmentFiltersAria}>
            <button type="button" onClick={() => onDepartment("ALL")} className={railClass(departmentId === "ALL")}>{text.all}</button>
            {departments.map(([id, label]) => <button key={id} type="button" onClick={() => onDepartment(id)} className={railClass(departmentId === id)}>{label}</button>)}
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted"><Filter className="h-4 w-4" /> {text.status}</p>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label={text.statusFiltersAria}>
            <button type="button" onClick={() => onStatus("ALL")} className={railClass(availabilityStatus === "ALL")}>{text.all}</button>
            {statuses.map((status) => <button key={status} type="button" onClick={() => onStatus(status)} className={railClass(availabilityStatus === status)}>{availabilityStatusLabel(status, locale)}</button>)}
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
                    <div className="min-w-0"><h3 className="break-words font-black text-dtsc-ink">{collaborator?.fullName || text.collaborator}</h3><p className="mt-1 text-xs font-bold text-dtsc-muted">{collaborator?.jobTitle} · {collaborator?.department}</p></div>
                    <Button type="button" variant="outline" size="icon" onClick={() => onInvite(collaboratorId)} className="shrink-0 rounded-xl border-dtsc-border text-dtsc-blue" aria-label={`${text.inviteCollaborator} ${collaborator?.fullName || text.collaborator}`}><UserRoundPlus className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-black text-cyan-700">{availabilityStatusLabel(item.availabilityStatus, locale)} · {item.startTime}-{item.endTime}</span>)}</div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...byStatus.entries()].map(([status, items]) => (
              <article key={status} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600">{availabilityStatusLabel(status, locale)}</p><p className="mt-2 text-3xl font-black text-dtsc-ink">{items.length}</p><p className="mt-1 text-sm text-dtsc-muted">{text.slots} · {new Set(items.map((item) => item.collaboratorId)).size} {text.collaborators}</p></article>
            ))}
          </div>
        )}
        {!records.length ? <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-8 text-center text-sm text-dtsc-muted">{text.noAvailability}</p> : null}
      </div>
    </section>
  );
}

function AvailabilityCard({ record, collaborator, locale, timezone, onInvite }: { record: ProfessionalAvailability; collaborator?: ProfessionalCalendarCollaborator; locale?: string | null; timezone?: string | null; onInvite: () => void }) {
  const text = calendarWorkspaceText(locale);
  return (
    <article className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-black text-cyan-700">{availabilityStatusLabel(record.availabilityStatus, locale)}</span><span className="rounded-full bg-dtsc-surface px-2.5 py-1 text-xs font-black text-dtsc-muted">{workModeLabel(record.locationMode, locale)}</span><span className="rounded-full bg-dtsc-surface px-2.5 py-1 text-xs font-black text-dtsc-muted">{recurrenceLabel(record.recurrenceType, locale)}</span></div>
          <h3 className="mt-3 break-words text-lg font-black text-dtsc-ink">{collaborator?.fullName || text.collaborator}</h3>
          <p className="mt-1 text-xs font-bold text-dtsc-muted">{collaborator?.jobTitle} · {collaborator?.department}</p>
          <p className="mt-3 text-sm font-bold text-dtsc-muted">{availabilityDateLabel(record, locale, timezone, text)} · {record.startTime}–{record.endTime}</p>
          {record.notes ? <p className="mt-2 text-sm leading-6 text-dtsc-muted">{record.notes}</p> : null}
        </div>
        <Button type="button" variant="outline" size="icon" onClick={onInvite} className="shrink-0 rounded-xl border-dtsc-border text-dtsc-blue" aria-label={`${text.inviteCollaborator} ${collaborator?.fullName || text.collaborator}`}><UserRoundPlus className="h-4 w-4" /></Button>
      </div>
    </article>
  );
}

function railClass(active: boolean) { return `shrink-0 rounded-xl px-3 py-2 text-sm font-black ${active ? "bg-cyan-400 text-[#001736]" : "border border-dtsc-border bg-dtsc-page text-dtsc-muted"}`; }
