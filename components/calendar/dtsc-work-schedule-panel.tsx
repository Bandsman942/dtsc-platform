"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarClock, CalendarOff, ClipboardCopy, Pencil, Plus, Trash2, Users } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { StatusBadge } from "@/components/workspace/status-badge";

export type DtscWeeklyAvailabilityItem = {
  id: string;
  collaboratorId: string;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  locationMode: string;
  notes?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DtscScheduleExceptionItem = {
  id: string;
  collaboratorId: string;
  type: string;
  statusLabel: string;
  startDate?: string | null;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  locationMode: string;
  reason?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type CollaboratorOption = {
  id: string;
  fullName: string;
  email?: string | null;
  department: string;
  jobTitle: string;
};

type ScheduleSummary = {
  hoursAvailableThisWeek: number;
  availableDays: number;
  configuredSlots: number;
  overlapConflicts: number;
};

type DeleteTarget = { kind: "weekly" | "exception"; id: string; label: string } | null;

const absenceTypes = new Set(["ABSENCE", "ADMINISTRATIVE_ABSENCE", "OTHER_ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE"]);
const exceptionTypes = ["MISSION", "TRAINING", "REMOTE_WORK", "EXTRA_AVAILABILITY", "OTHER"];
const absenceTypeOptions = ["ABSENCE", "ADMINISTRATIVE_ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE", "OTHER_ABSENCE"];
const weekdaysFr = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const weekdaysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const exceptionLabels: Record<string, { fr: string; en: string }> = {
  ABSENCE: { fr: "Absence personnelle", en: "Personal absence" },
  ADMINISTRATIVE_ABSENCE: { fr: "Absence administrative", en: "Administrative absence" },
  OTHER_ABSENCE: { fr: "Autre absence", en: "Other absence" },
  LEAVE: { fr: "Congé", en: "Leave" },
  SICKNESS: { fr: "Maladie", en: "Sickness" },
  MISSION: { fr: "Mission", en: "Mission" },
  TRAINING: { fr: "Formation", en: "Training" },
  REMOTE_WORK: { fr: "Télétravail exceptionnel", en: "Exceptional remote work" },
  EXTRA_AVAILABILITY: { fr: "Disponibilité exceptionnelle", en: "Extra availability" },
  UNAVAILABLE: { fr: "Indisponibilité", en: "Unavailable" },
  OTHER: { fr: "Autre", en: "Other" },
};

export function DtscWorkSchedulePanel({
  initialWeeklyAvailabilities,
  initialExceptions,
  teamWeeklyAvailabilities,
  teamExceptions,
  collaborators,
  employeeId,
  canViewOrganizationAvailability,
  summary,
  locale,
  timezone,
}: {
  initialWeeklyAvailabilities: DtscWeeklyAvailabilityItem[];
  initialExceptions: DtscScheduleExceptionItem[];
  teamWeeklyAvailabilities: DtscWeeklyAvailabilityItem[];
  teamExceptions: DtscScheduleExceptionItem[];
  collaborators: CollaboratorOption[];
  employeeId: string;
  canViewOrganizationAvailability: boolean;
  summary: ScheduleSummary;
  locale: string;
  timezone: string;
}) {
  const lang = locale === "en" ? "en" : "fr";
  const text = copy[lang];
  const weekdays = lang === "en" ? weekdaysEn : weekdaysFr;
  const [weekly, setWeekly] = useState(initialWeeklyAvailabilities);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [weeklyDraft, setWeeklyDraft] = useState<DtscWeeklyAvailabilityItem | "new" | null>(null);
  const [exceptionDraft, setExceptionDraft] = useState<{ mode: "exception" | "absence"; record?: DtscScheduleExceptionItem } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [teamCollaboratorId, setTeamCollaboratorId] = useState(employeeId);
  const [message, setMessage] = useState("");
  useToastMessage(message);

  const absences = useMemo(() => exceptions.filter((item) => absenceTypes.has(item.type)), [exceptions]);
  const otherExceptions = useMemo(() => exceptions.filter((item) => !absenceTypes.has(item.type)), [exceptions]);
  const selectedCollaborator = collaborators.find((item) => item.id === teamCollaboratorId);
  const selectedTeamWeekly = teamWeeklyAvailabilities.filter((item) => item.collaboratorId === teamCollaboratorId);
  const selectedTeamExceptions = teamExceptions.filter((item) => item.collaboratorId === teamCollaboratorId);

  function upsertWeekly(saved: DtscWeeklyAvailabilityItem) {
    setWeekly((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [...current, saved].sort(sortWeekly));
  }

  function upsertException(saved: DtscScheduleExceptionItem) {
    setExceptions((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [saved, ...current]);
  }

  async function deleteRecord() {
    if (!deleteTarget) return;
    const endpoint = deleteTarget.kind === "weekly"
      ? `/api/calendar/availabilities/${deleteTarget.id}`
      : `/api/calendar/exceptions/${deleteTarget.id}`;
    const response = await fetch(endpoint, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setMessage(body?.message || text.deleteFailed);
      return;
    }
    if (deleteTarget.kind === "weekly") setWeekly((current) => current.filter((item) => item.id !== deleteTarget.id));
    else setExceptions((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    setMessage(text.deleted);
  }

  return (
    <ModuleWorkspace className="rounded-[1.75rem] border border-dtsc-border bg-dtsc-surface p-4 sm:p-6">
      <ModuleHeader
        eyebrow={text.eyebrow}
        title={text.title}
        description={text.description}
        secondaryActions={<StatusBadge tone="info">{timezone}</StatusBadge>}
      />

      <ModuleMetrics label={text.metrics}>
        <ModuleMetric label={text.hours} value={`${summary.hoursAvailableThisWeek} h`} hint={text.hoursHint} />
        <ModuleMetric label={text.days} value={summary.availableDays} />
        <ModuleMetric label={text.slots} value={summary.configuredSlots} />
        <ModuleMetric label={text.conflicts} value={summary.overlapConflicts} hint={summary.overlapConflicts ? text.conflictsHint : text.noConflicts} />
      </ModuleMetrics>

      <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 text-sm font-semibold leading-6 text-dtsc-ink">
        <strong>{text.important}</strong> {text.notWorkedTime}
      </div>

      <ModuleContent>
        <ModuleSection
          id="weekly-availability"
          title={text.weeklyTitle}
          description={text.weeklyDescription}
          count={weekly.length}
          action={<Button type="button" onClick={() => setWeeklyDraft("new")} className="rounded-xl bg-dtsc-navy text-white"><Plus className="h-4 w-4" />{text.addSlot}</Button>}
        >
          {weekly.length ? (
            <BusinessList ariaLabel={text.weeklyTitle}>
              {[...weekly].sort(sortWeekly).map((item) => (
                <BusinessListItem
                  key={item.id}
                  title={`${weekdays[item.dayOfWeek ?? 0]} · ${item.startTime}–${item.endTime}`}
                  status={<StatusBadge tone="success">{item.locationMode}</StatusBadge>}
                  meta={effectivePeriodLabel(item, text)}
                  description={item.notes || text.availableSlot}
                  actions={
                    <ActionMenu
                      label={text.actions}
                      items={[
                        { key: "edit", label: text.edit, icon: Pencil, onSelect: () => setWeeklyDraft(item) },
                        { key: "copy", label: text.copyTo, icon: ClipboardCopy, onSelect: () => setWeeklyDraft({ ...item, id: "", dayOfWeek: ((item.dayOfWeek ?? 0) + 1) % 7, effectiveFrom: currentDateKey(timezone), effectiveUntil: null }) },
                        { key: "delete", label: text.delete, icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setDeleteTarget({ kind: "weekly", id: item.id, label: `${weekdays[item.dayOfWeek ?? 0]} ${item.startTime}–${item.endTime}` }) },
                      ]}
                    />
                  }
                />
              ))}
            </BusinessList>
          ) : <EmptyState icon={CalendarClock} title={text.noWeekly} description={text.noWeeklyDescription} compact />}
        </ModuleSection>

        <ModuleSection
          id="exceptions"
          title={text.exceptionsTitle}
          description={text.exceptionsDescription}
          count={otherExceptions.length}
          action={<Button type="button" variant="outline" onClick={() => setExceptionDraft({ mode: "exception" })} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><Plus className="h-4 w-4" />{text.addException}</Button>}
        >
          <ScheduleExceptionList items={otherExceptions} lang={lang} text={text} onEdit={(record) => setExceptionDraft({ mode: "exception", record })} onDelete={(record) => setDeleteTarget({ kind: "exception", id: record.id, label: exceptionLabel(record.type, lang) })} />
        </ModuleSection>

        <ModuleSection
          id="absences"
          title={text.absencesTitle}
          description={text.absencesDescription}
          count={absences.length}
          action={<Button type="button" variant="outline" onClick={() => setExceptionDraft({ mode: "absence" })} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><Plus className="h-4 w-4" />{text.addAbsence}</Button>}
        >
          {absences.length ? (
            <ScheduleExceptionList items={absences} lang={lang} text={text} onEdit={(record) => setExceptionDraft({ mode: "absence", record })} onDelete={(record) => setDeleteTarget({ kind: "exception", id: record.id, label: exceptionLabel(record.type, lang) })} />
          ) : <EmptyState icon={CalendarOff} title={text.noAbsences} description={text.noAbsencesDescription} compact />}
        </ModuleSection>

        {canViewOrganizationAvailability && (
          <ModuleSection id="team-availability" title={text.teamTitle} description={text.teamDescription} count={collaborators.length}>
            <div className="mb-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,22rem)_1fr] md:items-end">
              <FormField label={text.collaborator} hint={text.readOnlyHint}>
                <select value={teamCollaboratorId} onChange={(event) => setTeamCollaboratorId(event.target.value)} className="h-12 w-full min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink">
                  {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.fullName} · {collaborator.jobTitle}</option>)}
                </select>
              </FormField>
              <div className="rounded-2xl border border-dtsc-border bg-dtsc-page/60 px-4 py-3 text-sm text-dtsc-muted">
                <Users className="mr-2 inline h-4 w-4" />
                <strong className="text-dtsc-ink">{selectedCollaborator?.fullName || text.collaborator}</strong> · {text.readOnly}
              </div>
            </div>
            <TeamScheduleReadOnly weekly={selectedTeamWeekly} exceptions={selectedTeamExceptions} weekdays={weekdays} lang={lang} text={text} />
          </ModuleSection>
        )}
      </ModuleContent>

      {weeklyDraft && (
        <WeeklyAvailabilityDialog
          record={weeklyDraft === "new" ? undefined : weeklyDraft}
          isCopy={weeklyDraft !== "new" && !weeklyDraft.id}
          weekdays={weekdays}
          text={text}
          timezone={timezone}
          onClose={() => setWeeklyDraft(null)}
          onSaved={(saved) => { upsertWeekly(saved); setWeeklyDraft(null); setMessage(text.saved); }}
        />
      )}
      {exceptionDraft && (
        <ScheduleExceptionDialog
          mode={exceptionDraft.mode}
          record={exceptionDraft.record}
          lang={lang}
          text={text}
          timezone={timezone}
          onClose={() => setExceptionDraft(null)}
          onSaved={(saved) => { upsertException(saved); setExceptionDraft(null); setMessage(text.saved); }}
        />
      )}
      {deleteTarget && (
        <Dialog open title={text.confirmDelete} description={`${text.confirmDeleteDescription} ${deleteTarget.label}`} onClose={() => setDeleteTarget(null)}>
          <div className="flex flex-col justify-end gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>{text.cancel}</Button>
            <Button type="button" onClick={() => void deleteRecord()} className="bg-red-600 text-white hover:bg-red-700">{text.delete}</Button>
          </div>
        </Dialog>
      )}
    </ModuleWorkspace>
  );
}

function ScheduleExceptionList({ items, lang, text, onEdit, onDelete }: { items: DtscScheduleExceptionItem[]; lang: "fr" | "en"; text: typeof copy.fr; onEdit: (item: DtscScheduleExceptionItem) => void; onDelete: (item: DtscScheduleExceptionItem) => void }) {
  if (!items.length) return <EmptyState icon={CalendarOff} title={text.noExceptions} description={text.noExceptionsDescription} compact />;
  return (
    <BusinessList>
      {items.map((item) => (
        <BusinessListItem
          key={item.id}
          title={exceptionLabel(item.type, lang)}
          status={<StatusBadge tone={absenceTypes.has(item.type) ? "warning" : "info"}>{item.statusLabel}</StatusBadge>}
          meta={`${dateRangeLabel(item)} · ${item.allDay ? text.allDay : `${item.startTime}–${item.endTime}`} · ${item.locationMode}`}
          description={item.reason || text.privateReason}
          actions={<ActionMenu label={text.actions} items={[
            { key: "edit", label: text.edit, icon: Pencil, onSelect: () => onEdit(item) },
            { key: "delete", label: text.delete, icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => onDelete(item) },
          ]} />}
        />
      ))}
    </BusinessList>
  );
}

function TeamScheduleReadOnly({ weekly, exceptions, weekdays, lang, text }: { weekly: DtscWeeklyAvailabilityItem[]; exceptions: DtscScheduleExceptionItem[]; weekdays: string[]; lang: "fr" | "en"; text: typeof copy.fr }) {
  if (!weekly.length && !exceptions.length) return <EmptyState title={text.noTeamData} description={text.noTeamDataDescription} compact />;
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-dtsc-blue">{text.weeklyTitle}</h3>
        <BusinessList>
          {weekly.map((item) => <BusinessListItem key={item.id} title={`${weekdays[item.dayOfWeek ?? 0]} · ${item.startTime}–${item.endTime}`} meta={item.locationMode} description={effectivePeriodLabel(item, text)} />)}
          {!weekly.length && <div className="py-4 text-sm text-dtsc-muted">{text.noWeekly}</div>}
        </BusinessList>
      </div>
      <div className="min-w-0">
        <h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-dtsc-blue">{text.exceptionsAndAbsences}</h3>
        <BusinessList>
          {exceptions.map((item) => <BusinessListItem key={item.id} title={exceptionLabel(item.type, lang)} status={<StatusBadge tone={absenceTypes.has(item.type) ? "warning" : "info"}>{item.statusLabel}</StatusBadge>} meta={`${dateRangeLabel(item)} · ${item.allDay ? text.allDay : `${item.startTime}–${item.endTime}`}`} description={text.reasonProtected} />)}
          {!exceptions.length && <div className="py-4 text-sm text-dtsc-muted">{text.noExceptions}</div>}
        </BusinessList>
      </div>
    </div>
  );
}

function WeeklyAvailabilityDialog({ record, isCopy, weekdays, text, timezone, onClose, onSaved }: { record?: DtscWeeklyAvailabilityItem; isCopy: boolean; weekdays: string[]; text: typeof copy.fr; timezone: string; onClose: () => void; onSaved: (item: DtscWeeklyAvailabilityItem) => void }) {
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const today = currentDateKey(timezone);
  const effectiveFrom = !record?.effectiveFrom || record.effectiveFrom < today ? today : record.effectiveFrom;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      dayOfWeek: Number(form.get("dayOfWeek")),
      startTime: String(form.get("startTime") || ""),
      endTime: String(form.get("endTime") || ""),
      locationMode: String(form.get("locationMode") || "Non défini"),
      notes: String(form.get("notes") || ""),
      effectiveFrom: String(form.get("effectiveFrom") || today),
      effectiveUntil: String(form.get("effectiveUntil") || ""),
    };
    const endpoint = record?.id && !isCopy ? `/api/calendar/availabilities/${record.id}` : "/api/calendar/availabilities";
    const response = await fetch(endpoint, { method: record?.id && !isCopy ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { availability?: DtscWeeklyAvailabilityItem; message?: string } | null;
    if (!response.ok || !body?.availability) { setMessage(body?.message || text.saveFailed); return; }
    onSaved(body.availability);
  }

  return (
    <Dialog open title={isCopy ? text.copyTitle : record ? text.editSlot : text.newSlot} description={text.weeklyFormDescription} onClose={onClose} className="h-[92dvh] max-w-2xl">
      <form onSubmit={submit} className="grid min-w-0 gap-4">
        <FormField label={text.dayOfWeek} hint={text.dayHint}>
          <select name="dayOfWeek" defaultValue={record?.dayOfWeek ?? 1} className="h-12 w-full rounded-2xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">
            {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
          </select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={text.startTime}><Input name="startTime" required type="time" defaultValue={record?.startTime || "08:00"} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
          <FormField label={text.endTime}><Input name="endTime" required type="time" defaultValue={record?.endTime || "17:00"} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
        </div>
        <FormField label={text.locationMode} hint={text.locationHint}>
          <select name="locationMode" defaultValue={record?.locationMode || "Non défini"} className="h-12 w-full rounded-2xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">
            {["Non défini", "Site DTSC", "Télétravail", "Hybride", "Externe"].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={text.effectiveFrom} hint={text.historyHint}><Input name="effectiveFrom" required type="date" min={today} defaultValue={effectiveFrom} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
          <FormField label={text.effectiveUntil}><Input name="effectiveUntil" type="date" min={effectiveFrom} defaultValue={record?.effectiveUntil || ""} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
        </div>
        <FormField label={text.notes}><textarea name="notes" defaultValue={record?.notes || ""} maxLength={800} className="min-h-24 w-full rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField>
        <div className="flex flex-col justify-end gap-2 border-t border-dtsc-border pt-4 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>{text.cancel}</Button>
          <Button type="submit" className="bg-dtsc-navy text-white">{text.save}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ScheduleExceptionDialog({ mode, record, lang, text, timezone, onClose, onSaved }: { mode: "exception" | "absence"; record?: DtscScheduleExceptionItem; lang: "fr" | "en"; text: typeof copy.fr; timezone: string; onClose: () => void; onSaved: (item: DtscScheduleExceptionItem) => void }) {
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const options = mode === "absence" ? absenceTypeOptions : exceptionTypes;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      type: String(form.get("type") || options[0]),
      startDate: String(form.get("startDate") || ""),
      endDate: String(form.get("endDate") || ""),
      startTime: String(form.get("startTime") || "00:00"),
      endTime: String(form.get("endTime") || "23:59"),
      allDay: form.get("allDay") === "on",
      locationMode: String(form.get("locationMode") || "Non défini"),
      reason: String(form.get("reason") || ""),
    };
    const endpoint = record ? `/api/calendar/exceptions/${record.id}` : "/api/calendar/exceptions";
    const response = await fetch(endpoint, { method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { exception?: DtscScheduleExceptionItem; message?: string } | null;
    if (!response.ok || !body?.exception) { setMessage(body?.message || text.saveFailed); return; }
    onSaved(body.exception);
  }
  const startDate = record?.startDate || currentDateKey(timezone);
  return (
    <Dialog open title={record ? text.editException : mode === "absence" ? text.newAbsence : text.newException} description={mode === "absence" ? text.absenceFormDescription : text.exceptionFormDescription} onClose={onClose} className="h-[92dvh] max-w-2xl">
      <form onSubmit={submit} className="grid min-w-0 gap-4">
        <FormField label={text.type}>
          <select name="type" defaultValue={record?.type || options[0]} className="h-12 w-full rounded-2xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">
            {options.map((value) => <option key={value} value={value}>{exceptionLabel(value, lang)}</option>)}
          </select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={text.startDate}><Input name="startDate" required type="date" defaultValue={startDate} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
          <FormField label={text.endDate}><Input name="endDate" required type="date" defaultValue={record?.endDate || startDate} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
        </div>
        <label className="flex items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink"><input name="allDay" type="checkbox" defaultChecked={record?.allDay ?? true} className="h-4 w-4" />{text.allDay}</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={text.startTime}><Input name="startTime" required type="time" defaultValue={record?.startTime || "08:00"} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
          <FormField label={text.endTime}><Input name="endTime" required type="time" defaultValue={record?.endTime || "17:00"} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
        </div>
        <FormField label={text.locationMode}>
          <select name="locationMode" defaultValue={record?.locationMode || "Non défini"} className="h-12 w-full rounded-2xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">
            {["Non défini", "Site DTSC", "Télétravail", "Hybride", "Externe", "Mission"].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </FormField>
        <FormField label={text.reason} hint={text.reasonHint}><textarea name="reason" defaultValue={record?.reason || ""} maxLength={800} className="min-h-24 w-full rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField>
        <div className="flex flex-col justify-end gap-2 border-t border-dtsc-border pt-4 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>{text.cancel}</Button>
          <Button type="submit" className="bg-dtsc-navy text-white">{text.save}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function exceptionLabel(type: string, lang: "fr" | "en") { return exceptionLabels[type]?.[lang] || type; }
function dateRangeLabel(item: DtscScheduleExceptionItem) { return item.startDate === item.endDate ? item.startDate || "—" : `${item.startDate || "—"} → ${item.endDate || "—"}`; }
function effectivePeriodLabel(item: DtscWeeklyAvailabilityItem, text: typeof copy.fr) { return `${text.from} ${item.effectiveFrom || text.now} · ${text.until} ${item.effectiveUntil || text.noEnd}`; }
function sortWeekly(left: DtscWeeklyAvailabilityItem, right: DtscWeeklyAvailabilityItem) { return (left.dayOfWeek ?? 0) - (right.dayOfWeek ?? 0) || left.startTime.localeCompare(right.startTime); }
function currentDateKey(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const copy = {
  fr: {
    eyebrow: "Planification personnelle", title: "Mon planning", description: "Déclarez votre disponibilité habituelle, vos exceptions et vos absences. Vous restez propriétaire de vos propres données de planning.", metrics: "Résumé du planning",
    hours: "Heures disponibles", hoursHint: "Sur la semaine habituelle active", days: "Jours disponibles", slots: "Plages configurées", conflicts: "Chevauchements", conflictsHint: "À corriger avant enregistrement", noConflicts: "Aucun chevauchement enregistré",
    important: "Important :", notWorkedTime: "une disponibilité indique quand vous pouvez travailler. Elle ne constitue ni une prestation réalisée, ni du temps travaillé, ni une donnée de paie.",
    weeklyTitle: "Disponibilités habituelles", weeklyDescription: "Votre semaine type. Les modifications prennent effet à une date donnée afin de préserver l'historique.", addSlot: "Ajouter une plage", availableSlot: "Plage de disponibilité habituelle.", noWeekly: "Aucune disponibilité habituelle", noWeeklyDescription: "Ajoutez vos plages de travail habituelles pour aider la planification opérationnelle.",
    exceptionsTitle: "Exceptions", exceptionsDescription: "Mission, formation, télétravail exceptionnel, disponibilité supplémentaire ou autre changement ponctuel.", addException: "Ajouter une exception", noExceptions: "Aucune exception", noExceptionsDescription: "Les changements ponctuels apparaîtront ici.",
    absencesTitle: "Absences", absencesDescription: "Congé, maladie, absence personnelle ou indisponibilité ponctuelle, sur une partie de journée ou plusieurs jours.", addAbsence: "Déclarer une absence", noAbsences: "Aucune absence", noAbsencesDescription: "Les absences déclarées apparaîtront ici sans exposer de motif sensible aux vues opérationnelles.",
    teamTitle: "Disponibilités de l'équipe", teamDescription: "Vue opérationnelle en lecture seule. Les responsables ne deviennent jamais propriétaires du planning d'un autre collaborateur.", collaborator: "Collaborateur", readOnlyHint: "Sélectionnez un collaborateur à consulter.", readOnly: "lecture seule", noTeamData: "Aucune donnée de planning", noTeamDataDescription: "Ce collaborateur n'a pas encore de planning visible sur la période chargée.", exceptionsAndAbsences: "Exceptions & absences",
    actions: "Actions", edit: "Modifier", copyTo: "Copier vers…", delete: "Supprimer", confirmDelete: "Confirmer la suppression", confirmDeleteDescription: "Cette action concerne :", cancel: "Annuler", save: "Enregistrer", saved: "Planning enregistré.", deleted: "Donnée de planning supprimée.", saveFailed: "Enregistrement impossible.", deleteFailed: "Suppression impossible.",
    newSlot: "Nouvelle disponibilité", editSlot: "Modifier la disponibilité", copyTitle: "Copier cette plage vers un autre jour", weeklyFormDescription: "Configurez uniquement votre propre disponibilité habituelle. Les plages qui se chevauchent sont refusées.", dayOfWeek: "Jour de la semaine", dayHint: "Jour auquel cette plage habituelle s'applique.", startTime: "Heure de début", endTime: "Heure de fin", locationMode: "Mode de travail", locationHint: "Le mode indique où/comment, pas si vous êtes disponible.", effectiveFrom: "Prend effet le", effectiveUntil: "Valable jusqu'au", historyHint: "Une nouvelle date d'effet protège l'historique déjà écoulé.", notes: "Notes", from: "Du", until: "au", now: "maintenant", noEnd: "sans date de fin",
    newException: "Nouvelle exception", newAbsence: "Déclarer une absence", editException: "Modifier l'exception", exceptionFormDescription: "Ajoutez un changement ponctuel à votre planning habituel.", absenceFormDescription: "Déclarez une absence totale ou partielle. Le motif reste privé et n'est pas diffusé dans les notifications.", type: "Type", startDate: "Date de début", endDate: "Date de fin", allDay: "Toute la journée", reason: "Motif / note privée", reasonHint: "Facultatif. N'inscrivez pas de détail médical inutile ; cette note n'est pas affichée dans la vue opérationnelle collective.", privateReason: "Motif facultatif et privé.", reasonProtected: "Détail privé masqué dans la vue collective.",
  },
  en: {
    eyebrow: "Personal planning", title: "My schedule", description: "Declare your usual availability, exceptions and absences. You remain the owner of your own planning data.", metrics: "Schedule summary",
    hours: "Available hours", hoursHint: "For the active usual week", days: "Available days", slots: "Configured slots", conflicts: "Overlaps", conflictsHint: "Fix before saving", noConflicts: "No saved overlap",
    important: "Important:", notWorkedTime: "availability shows when you can work. It is not completed work, worked time or payroll data.",
    weeklyTitle: "Usual availability", weeklyDescription: "Your typical week. Changes take effect on a defined date so history is preserved.", addSlot: "Add slot", availableSlot: "Usual availability slot.", noWeekly: "No usual availability", noWeeklyDescription: "Add your usual working availability to support operational planning.",
    exceptionsTitle: "Exceptions", exceptionsDescription: "Mission, training, exceptional remote work, extra availability or another one-off change.", addException: "Add exception", noExceptions: "No exception", noExceptionsDescription: "One-off changes will appear here.",
    absencesTitle: "Absences", absencesDescription: "Leave, sickness, personal absence or one-off unavailability, partial day or multi-day.", addAbsence: "Declare absence", noAbsences: "No absence", noAbsencesDescription: "Declared absences will appear here without exposing sensitive reasons to operational views.",
    teamTitle: "Team availability", teamDescription: "Read-only operational view. Managers never become owners of another collaborator's schedule.", collaborator: "Collaborator", readOnlyHint: "Select a collaborator to view.", readOnly: "read only", noTeamData: "No schedule data", noTeamDataDescription: "This collaborator has no visible schedule data in the loaded range.", exceptionsAndAbsences: "Exceptions & absences",
    actions: "Actions", edit: "Edit", copyTo: "Copy to…", delete: "Delete", confirmDelete: "Confirm deletion", confirmDeleteDescription: "This action concerns:", cancel: "Cancel", save: "Save", saved: "Schedule saved.", deleted: "Schedule data deleted.", saveFailed: "Unable to save.", deleteFailed: "Unable to delete.",
    newSlot: "New availability", editSlot: "Edit availability", copyTitle: "Copy this slot to another day", weeklyFormDescription: "Configure only your own usual availability. Overlapping slots are rejected.", dayOfWeek: "Day of week", dayHint: "Day this usual slot applies to.", startTime: "Start time", endTime: "End time", locationMode: "Work mode", locationHint: "Work mode indicates where/how, not whether you are available.", effectiveFrom: "Effective from", effectiveUntil: "Effective until", historyHint: "A new effective date preserves elapsed history.", notes: "Notes", from: "From", until: "until", now: "now", noEnd: "no end date",
    newException: "New exception", newAbsence: "Declare absence", editException: "Edit exception", exceptionFormDescription: "Add a one-off change to your usual schedule.", absenceFormDescription: "Declare a full or partial absence. The reason remains private and is not exposed in notifications.", type: "Type", startDate: "Start date", endDate: "End date", allDay: "All day", reason: "Reason / private note", reasonHint: "Optional. Avoid unnecessary medical details; this note is not shown in the collective operational view.", privateReason: "Optional private reason.", reasonProtected: "Private detail hidden in the collective view.",
  },
};
