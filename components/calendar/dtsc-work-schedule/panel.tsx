"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CalendarOff, ClipboardCopy, Pencil, Plus, Trash2, Users } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { StatusBadge } from "@/components/workspace/status-badge";
import { ScheduleExceptionDialog, WeeklyAvailabilityDialog } from "@/components/calendar/dtsc-work-schedule/dialogs";
import { ScheduleExceptionList, TeamScheduleReadOnly } from "@/components/calendar/dtsc-work-schedule/lists";
import {
  absenceTypes,
  calendarWeekdays,
  currentDateKey,
  effectivePeriodLabel,
  exceptionLabel,
  locationModeLabel,
  scheduleText,
  sortWeekly,
  type CollaboratorOption,
  type DeleteTarget,
  type DtscScheduleExceptionItem,
  type DtscWeeklyAvailabilityItem,
  type ScheduleSummary,
} from "@/components/calendar/dtsc-work-schedule/model";

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
  const text = useMemo(() => scheduleText(locale), [locale]);
  const weekdays = useMemo(() => calendarWeekdays(locale), [locale]);
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
    if (deleteTarget.kind === "weekly") {
      setWeekly((current) => current.filter((item) => item.id !== deleteTarget.id));
    } else {
      setExceptions((current) => current.filter((item) => item.id !== deleteTarget.id));
    }
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
                  status={<StatusBadge tone="success">{locationModeLabel(item.locationMode, locale)}</StatusBadge>}
                  meta={effectivePeriodLabel(item, text)}
                  description={item.notes || text.availableSlot}
                  actions={(
                    <ActionMenu
                      label={text.actions}
                      items={[
                        { key: "edit", label: text.edit, icon: Pencil, onSelect: () => setWeeklyDraft(item) },
                        {
                          key: "copy",
                          label: text.copyTo,
                          icon: ClipboardCopy,
                          onSelect: () => setWeeklyDraft({
                            ...item,
                            id: "",
                            dayOfWeek: ((item.dayOfWeek ?? 0) + 1) % 7,
                            effectiveFrom: currentDateKey(timezone),
                            effectiveUntil: null,
                          }),
                        },
                        {
                          key: "delete",
                          label: text.delete,
                          icon: Trash2,
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () => setDeleteTarget({
                            kind: "weekly",
                            id: item.id,
                            label: `${weekdays[item.dayOfWeek ?? 0]} ${item.startTime}–${item.endTime}`,
                          }),
                        },
                      ]}
                    />
                  )}
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
          <ScheduleExceptionList
            items={otherExceptions}
            locale={locale}
            text={text}
            onEdit={(record) => setExceptionDraft({ mode: "exception", record })}
            onDelete={(record) => setDeleteTarget({ kind: "exception", id: record.id, label: exceptionLabel(record.type, locale) })}
          />
        </ModuleSection>

        <ModuleSection
          id="absences"
          title={text.absencesTitle}
          description={text.absencesDescription}
          count={absences.length}
          action={<Button type="button" variant="outline" onClick={() => setExceptionDraft({ mode: "absence" })} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><Plus className="h-4 w-4" />{text.addAbsence}</Button>}
        >
          {absences.length ? (
            <ScheduleExceptionList
              items={absences}
              locale={locale}
              text={text}
              onEdit={(record) => setExceptionDraft({ mode: "absence", record })}
              onDelete={(record) => setDeleteTarget({ kind: "exception", id: record.id, label: exceptionLabel(record.type, locale) })}
            />
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
            <TeamScheduleReadOnly
              weekly={selectedTeamWeekly}
              exceptions={selectedTeamExceptions}
              weekdays={weekdays}
              locale={locale}
              text={text}
            />
          </ModuleSection>
        )}
      </ModuleContent>

      {weeklyDraft && (
        <WeeklyAvailabilityDialog
          record={weeklyDraft === "new" ? undefined : weeklyDraft}
          isCopy={weeklyDraft !== "new" && !weeklyDraft.id}
          weekdays={weekdays}
          text={text}
          locale={locale}
          timezone={timezone}
          onClose={() => setWeeklyDraft(null)}
          onSaved={(saved) => {
            upsertWeekly(saved);
            setWeeklyDraft(null);
            setMessage(text.saved);
          }}
        />
      )}

      {exceptionDraft && (
        <ScheduleExceptionDialog
          mode={exceptionDraft.mode}
          record={exceptionDraft.record}
          locale={locale}
          text={text}
          timezone={timezone}
          onClose={() => setExceptionDraft(null)}
          onSaved={(saved) => {
            upsertException(saved);
            setExceptionDraft(null);
            setMessage(text.saved);
          }}
        />
      )}

      {deleteTarget && (
        <Dialog
          open
          title={text.confirmDelete}
          description={`${text.confirmDeleteDescription} ${deleteTarget.label}`}
          onClose={() => setDeleteTarget(null)}
        >
          <div className="flex flex-col justify-end gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>{text.cancel}</Button>
            <Button type="button" onClick={() => void deleteRecord()} className="bg-red-600 text-white hover:bg-red-700">{text.delete}</Button>
          </div>
        </Dialog>
      )}
    </ModuleWorkspace>
  );
}
