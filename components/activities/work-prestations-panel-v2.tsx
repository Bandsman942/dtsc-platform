"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Columns3, Eye, List, Pencil, Plus, Search, Send, SlidersHorizontal, Trash2 } from "lucide-react";
import { EntityCommentsThread } from "@/components/activities/entity-comments-thread";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { translateActivities, type ActivitiesKey } from "@/lib/i18n";
import { formatEnumLabelForLocale } from "@/lib/labels-i18n";
import { userLocale } from "@/lib/user-format";

const WORK_TYPES = ["NORMAL_WORK", "MEETING", "MISSION", "PROJECT_WORK", "SUPPORT", "TRAINING", "ADMINISTRATIVE", "OTHER"] as const;
// Persisted historical values: display labels are localized, payload values stay unchanged.
const LOCATION_MODES = ["Site DTSC", "Télétravail", "Hybride", "Externe", "Mission", "Non défini"] as const;

type WorkEntry = {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workedMinutes: number;
  locationMode: string | null;
  workType: string;
  summary: string;
  details: string | null;
  scheduleOutsideAvailability: boolean;
  scheduleBlockingCount: number;
  scheduleWarningCount: number;
  createdAt?: string;
  updatedAt?: string;
};

type WorkSubmission = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  declaredMinutes: number;
  validatedMinutes: number | null;
  submittedAt: string | null;
  reviewedAt?: string | null;
  reviewComment: string | null;
  revision: number;
  createdAt?: string;
  updatedAt?: string;
  entries: WorkEntry[];
  reviews: Array<{ id: string; action: string; comment: string | null; createdAt: string }>;
};

type WorkState = {
  timezone: string;
  today: string;
  currentPeriod: { periodStart: string; periodEnd: string };
  currentSubmission: WorkSubmission;
  submissions: WorkSubmission[];
  capabilities?: { canSubmitPastPeriods?: boolean };
  viewer?: { id: string; role: string };
};

type EntryForm = {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  workType: string;
  locationMode: string;
  summary: string;
  details: string;
};

export function WorkPrestationsPanelV2({ locale }: { locale?: string | null }) {
  const t = useCallback((key: ActivitiesKey) => translateActivities(locale, key), [locale]);
  const [state, setState] = useState<WorkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry?: WorkEntry; submission?: WorkSubmission }>({ open: false });
  const [selectedSubmission, setSelectedSubmission] = useState<WorkSubmission | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<{ entry: WorkEntry; submission: WorkSubmission } | null>(null);
  const [submitTarget, setSubmitTarget] = useState<WorkSubmission | null>(null);
  const [conflictMessage, setConflictMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [weeklyView, setWeeklyView] = useState<"list" | "kanban">("kanban");
  const [weeklyGrouping, setWeeklyGrouping] = useState<"locationMode" | "workType">("locationMode");
  const [historyView, setHistoryView] = useState<"list" | "kanban">("kanban");
  const [historyStatus, setHistoryStatus] = useState("ALL");
  const [historyQuery, setHistoryQuery] = useState("");
  useToastMessage(message);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/work/submissions?limit=24", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as WorkState & { message?: string } | null;
    if (response.ok && body) {
      setState(body);
      setSelectedSubmission((current) => current ? body.submissions.find((submission) => submission.id === current.id) || null : null);
    } else {
      setMessage(body?.message || t("work.loadError"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const current = state?.currentSubmission;
  const currentEditable = Boolean(current && isEditable(current));
  const workedDays = useMemo(() => new Set((current?.entries || []).map((entry) => entry.workDate)).size, [current?.entries]);
  const scheduleIssues = useMemo(() => (current?.entries || []).filter(hasScheduleIssue).length, [current?.entries]);
  const weeklyColumns = useMemo(() => groupEntries(current?.entries || [], weeklyGrouping, locale), [current?.entries, locale, weeklyGrouping]);
  const filteredHistory = useMemo(() => {
    const language = userLocale({ locale });
    const query = historyQuery.trim().toLocaleLowerCase(language);
    return (state?.submissions || []).filter((submission) => {
      if (historyStatus !== "ALL" && submission.status !== historyStatus) return false;
      if (!query) return true;
      return [submission.status, submission.reviewComment, submission.periodStart, submission.periodEnd, ...submission.entries.map((entry) => `${entry.summary} ${entry.details || ""} ${entry.locationMode || ""}`)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase(language)
        .includes(query);
    });
  }, [historyQuery, historyStatus, locale, state?.submissions]);
  const historyColumns = useMemo(() => groupSubmissionsByStatus(filteredHistory, locale), [filteredHistory, locale]);

  async function removeEntry(entry: WorkEntry, submission: WorkSubmission) {
    if (!isEditable(submission)) return;
    setSaving(true);
    const response = await fetch(`/api/work/entries/${entry.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? t("work.deleted") : body?.message || t("work.deleteError"));
    if (response.ok) await load();
    setSaving(false);
  }

  async function submitPeriod(target: WorkSubmission, confirmScheduleConflicts = false) {
    setSaving(true);
    const response = await fetch(`/api/work/submissions/${target.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmScheduleConflicts }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (response.ok) {
      setSubmitTarget(null);
      setConflictMessage("");
      setMessage(target.status === "CHANGES_REQUESTED" ? t("work.resubmitted") : t("work.submitted"));
      await load();
    } else if (body?.error === "SCHEDULE_CONFLICT_CONFIRMATION_REQUIRED") {
      setConflictMessage(body.message || t("work.scheduleConfirm"));
      setSubmitTarget(target);
    } else {
      setMessage(body?.message || t("work.submitError"));
    }
    setSaving(false);
  }

  function canSubmitSubmission(submission: WorkSubmission) {
    if (!isEditable(submission) || !submission.entries.length || submission.id.startsWith("unsaved-")) return false;
    const isPast = Boolean(state && submission.periodEnd < state.currentPeriod.periodEnd);
    return !isPast || Boolean(state?.capabilities?.canSubmitPastPeriods);
  }

  return (
    <>
      <ModuleSection
        id="work-prestations"
        title={t("work.weeklyTitle")}
        description={t("work.weeklyDescription")}
        count={current ? `${formatDate(current.periodStart, locale)} → ${formatDate(current.periodEnd, locale)}` : undefined}
        action={currentEditable ? (
          <Button type="button" onClick={() => setEntryDialog({ open: true, submission: current || undefined })} className="rounded-xl bg-dtsc-blue text-white">
            <Plus className="h-4 w-4" /> {t("work.add")}
          </Button>
        ) : undefined}
      >
        {loading ? (
          <p className="py-6 text-sm text-dtsc-muted">{t("work.loading")}</p>
        ) : current ? (
          <div className="min-w-0 space-y-5">
            <ModuleMetrics label={t("work.weeklySummary")}>
              <ModuleMetric label={t("work.declaredTime")} value={formatMinutes(current.declaredMinutes)} />
              <ModuleMetric label={t("work.entries")} value={current.entries.length} />
              <ModuleMetric label={t("work.workedDays")} value={workedDays} />
              <ModuleMetric label={t("work.scheduleIssues")} value={scheduleIssues} />
            </ModuleMetrics>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-y border-dtsc-border py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusTone(current.status)}>{submissionStatusLabel(current.status, locale)}</StatusBadge>
                  {current.revision > 0 ? <span className="text-xs font-bold text-dtsc-muted">{t("work.revision")} {current.revision}</span> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-dtsc-muted">{t("work.availabilityDisclaimer")}</p>
                {current.reviewComment ? <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">{t("work.reviewComment")}: {current.reviewComment}</p> : null}
              </div>
              {canSubmitSubmission(current) ? (
                <Button type="button" onClick={() => setSubmitTarget(current)} disabled={saving} className="rounded-xl bg-dtsc-blue text-white">
                  <Send className="h-4 w-4" /> {current.status === "CHANGES_REQUESTED" ? t("work.submitAgain") : t("work.submit")}
                </Button>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
              <div className="flex gap-2">
                <ViewToggle active={weeklyView === "list"} onClick={() => setWeeklyView("list")} icon={List} label={t("compactList")} />
                <ViewToggle active={weeklyView === "kanban"} onClick={() => setWeeklyView("kanban")} icon={Columns3} label={t("kanban")} />
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-dtsc-muted">
                <SlidersHorizontal className="h-4 w-4" />
                <span>{t("work.kanbanGrouping")}</span>
                <select value={weeklyGrouping} onChange={(event) => setWeeklyGrouping(event.target.value as "locationMode" | "workType")} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-xs font-black text-dtsc-ink" aria-label={t("work.groupWeeklyEntries")}>
                  <option value="locationMode">{t("work.workMode")}</option>
                  <option value="workType">{t("work.workType")}</option>
                </select>
              </label>
            </div>

            {weeklyView === "list" ? (
              <SubmissionEntries submission={current} locale={locale} editable={currentEditable} saving={saving} onOpen={(entry) => setSelectedEntry({ entry, submission: current })} onEdit={(entry) => setEntryDialog({ open: true, entry, submission: current })} onDelete={(entry) => void removeEntry(entry, current)} />
            ) : (
              <WorkEntryKanban columns={weeklyColumns} locale={locale} editable={currentEditable} saving={saving} onOpen={(entry) => setSelectedEntry({ entry, submission: current })} onEdit={(entry) => setEntryDialog({ open: true, entry, submission: current })} onDelete={(entry) => void removeEntry(entry, current)} />
            )}
            {!current.id.startsWith("unsaved-") && state.viewer ? <EntityCommentsThread entityType="WORK_SUBMISSION" entityId={current.id} currentUserId={state.viewer.id} currentUserRole={state.viewer.role} locale={locale} title={t("work.globalComments")} /> : null}
          </div>
        ) : (
          <EmptyState compact title={t("work.unavailable")} description={t("work.currentUnavailable")} />
        )}
      </ModuleSection>

      {state?.submissions?.length ? (
        <ModuleSection id="work-prestations-history" title={t("work.historyTitle")} description={t("work.historyDescription")} count={String(state.submissions.length)}>
          <div className="min-w-0 space-y-4">
            <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
              <div className="flex flex-wrap gap-2">
                <ViewToggle active={historyView === "list"} onClick={() => setHistoryView("list")} icon={List} label={t("compactList")} />
                <ViewToggle active={historyView === "kanban"} onClick={() => setHistoryView("kanban")} icon={Columns3} label={t("kanban")} />
              </div>
              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(12rem,1fr)_11rem]">
                <label className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-dtsc-muted" /><Input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder={t("work.searchHistory")} className="h-11 rounded-xl bg-dtsc-surface pl-9" /></label>
                <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink" aria-label={t("work.filterHistoryStatus")}>
                  <option value="ALL">{t("work.allStatuses")}</option>
                  {[...new Set(state.submissions.map((submission) => submission.status))].map((status) => <option key={status} value={status}>{submissionStatusLabel(status, locale)}</option>)}
                </select>
              </div>
            </div>
            {historyView === "list" ? (
              <BusinessList ariaLabel={t("work.historyTitle")}>
                {filteredHistory.map((submission) => <SubmissionHistoryItem key={submission.id} submission={submission} currentPeriodEnd={state.currentPeriod.periodEnd} canSubmitPast={Boolean(state.capabilities?.canSubmitPastPeriods)} locale={locale} canSubmit={canSubmitSubmission(submission)} onOpen={() => setSelectedSubmission(submission)} onSubmit={() => setSubmitTarget(submission)} />)}
              </BusinessList>
            ) : (
              <SubmissionHistoryKanban columns={historyColumns} locale={locale} canSubmitSubmission={canSubmitSubmission} onOpen={setSelectedSubmission} onSubmit={setSubmitTarget} />
            )}
            {!filteredHistory.length ? <EmptyState compact title={t("work.noMatchingSubmission")} description={t("work.changeFilters")} /> : null}
          </div>
        </ModuleSection>
      ) : null}

      <EntryDialog open={entryDialog.open} entry={entryDialog.entry} defaultDate={entryDialog.submission?.periodStart || state?.today || ""} locale={locale} onClose={() => setEntryDialog({ open: false })} onSaved={async (successMessage) => { setEntryDialog({ open: false }); setMessage(successMessage); await load(); }} />

      <Dialog
        open={Boolean(selectedSubmission)}
        title={selectedSubmission ? `${t("work.submission")} · ${formatDate(selectedSubmission.periodStart, locale)} → ${formatDate(selectedSubmission.periodEnd, locale)}` : ""}
        description={t("work.submissionDescription")}
        onClose={() => setSelectedSubmission(null)}
        className="h-[94dvh] max-w-5xl"
      >
        {selectedSubmission ? (
          <div className="min-h-0 min-w-0 space-y-5 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label={t("work.status")} value={submissionStatusLabel(selectedSubmission.status, locale)} />
              <Detail label={t("work.declaredTime")} value={formatMinutes(selectedSubmission.declaredMinutes)} />
              <Detail label={t("work.createdAt")} value={formatTimestamp(selectedSubmission.createdAt, locale)} />
              <Detail label={t("work.updatedAt")} value={formatTimestamp(selectedSubmission.updatedAt, locale)} />
            </div>
            <SubmissionEntries submission={selectedSubmission} locale={locale} editable={isEditable(selectedSubmission)} saving={saving} onOpen={(entry) => setSelectedEntry({ entry, submission: selectedSubmission })} onEdit={(entry) => setEntryDialog({ open: true, entry, submission: selectedSubmission })} onDelete={(entry) => void removeEntry(entry, selectedSubmission)} />
            <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <h3 className="font-black text-dtsc-ink">{t("work.reviewHistory")}</h3>
              <div className="mt-3 space-y-2">
                {selectedSubmission.reviews.map((review) => <div key={review.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm"><p className="font-black text-dtsc-ink">{formatEnumLabelForLocale(review.action, locale)} · {formatTimestamp(review.createdAt, locale)}</p>{review.comment ? <p className="mt-1 leading-6 text-dtsc-muted">{review.comment}</p> : null}</div>)}
                {!selectedSubmission.reviews.length ? <p className="text-sm text-dtsc-muted">{t("work.noReview")}</p> : null}
              </div>
            </section>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(selectedEntry)} title={selectedEntry?.entry.summary || t("work.entry")} description={selectedEntry ? `${formatDate(selectedEntry.entry.workDate, locale)} · ${selectedEntry.entry.startTime} → ${selectedEntry.entry.endTime}` : ""} onClose={() => setSelectedEntry(null)} className="h-[96dvh] max-w-5xl">
        {selectedEntry ? <div className="min-w-0 space-y-5"><div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3"><Detail label={t("work.workType")} value={formatEnumLabelForLocale(selectedEntry.entry.workType, locale)} /><Detail label={t("work.workMode")} value={locationModeLabel(selectedEntry.entry.locationMode, locale)} /><Detail label={t("work.workedTime")} value={formatMinutes(selectedEntry.entry.workedMinutes)} /><Detail label={t("work.break")} value={`${selectedEntry.entry.breakMinutes} min`} /><Detail label={t("work.createdAt")} value={formatTimestamp(selectedEntry.entry.createdAt, locale)} /><Detail label={t("work.updatedAt")} value={formatTimestamp(selectedEntry.entry.updatedAt, locale)} /></div><section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">{t("work.summary")}</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-dtsc-muted">{selectedEntry.entry.details || t("work.noDetails")}</p></section>{state?.viewer ? <EntityCommentsThread entityType="WORK_ENTRY" entityId={selectedEntry.entry.id} currentUserId={state.viewer.id} currentUserRole={state.viewer.role} locale={locale} title={t("work.submitterValidatorDiscussion")} /> : null}{isEditable(selectedEntry.submission) ? <div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setSelectedEntry(null); setEntryDialog({ open: true, entry: selectedEntry.entry, submission: selectedEntry.submission }); }} className="rounded-xl"><Pencil className="h-4 w-4" />{t("work.edit")}</Button></div> : null}</div> : null}
      </Dialog>

      <Dialog
        open={Boolean(submitTarget)}
        title={submitTarget?.status === "CHANGES_REQUESTED" ? t("work.submitCorrectedPeriod") : t("work.submitPeriod")}
        description={t("work.submitReadOnlyDescription")}
        onClose={() => { setSubmitTarget(null); setConflictMessage(""); }}
        footer={<><Button type="button" variant="outline" onClick={() => { setSubmitTarget(null); setConflictMessage(""); }} className="rounded-xl">{t("work.cancel")}</Button><Button type="button" onClick={() => submitTarget && void submitPeriod(submitTarget, Boolean(conflictMessage))} disabled={saving} className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" /> {t("work.confirm")}</Button></>}
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-dtsc-ink">{submitTarget ? `${formatDate(submitTarget.periodStart, locale)} → ${formatDate(submitTarget.periodEnd, locale)} · ${formatMinutes(submitTarget.declaredMinutes)} · ${submitTarget.entries.length} ${t("work.entryCount")}` : ""}</p>
          {conflictMessage ? <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>{t("work.scheduleConflict")}</strong><p>{conflictMessage}</p></div></div> : <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="h-5 w-5 shrink-0" /> {t("work.readyForReview")}</div>}
        </div>
      </Dialog>
    </>
  );
}

function WorkEntryKanban({ columns, locale, editable, saving, onOpen, onEdit, onDelete }: { columns: Array<{ id: string; label: string; entries: WorkEntry[] }>; locale?: string | null; editable: boolean; saving: boolean; onOpen: (entry: WorkEntry) => void; onEdit: (entry: WorkEntry) => void; onDelete: (entry: WorkEntry) => void }) {
  const t = (key: ActivitiesKey) => translateActivities(locale, key);
  return columns.length ? (
    <div className="flex min-w-0 gap-4 overflow-x-auto pb-3" aria-label={t("work.kanbanAria")}>
      {columns.map((column) => (
        <section key={column.id} className="w-[min(86vw,22rem)] shrink-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
          <div className="flex items-center justify-between gap-3"><h3 className="font-black text-dtsc-ink">{column.label}</h3><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-black text-cyan-700 dark:text-cyan-200">{column.entries.length}</span></div>
          <div className="mt-3 max-h-[62dvh] space-y-3 overflow-y-auto pr-1">
            {column.entries.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
                <button type="button" onClick={() => onOpen(entry)} className="block w-full min-w-0 text-left">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge>{formatEnumLabelForLocale(entry.workType, locale)}</StatusBadge>{entry.scheduleBlockingCount > 0 ? <StatusBadge tone="danger">{t("work.absenceConflict")}</StatusBadge> : entry.scheduleOutsideAvailability ? <StatusBadge tone="warning">{t("work.outsideAvailability")}</StatusBadge> : <StatusBadge tone="success">{t("work.consistent")}</StatusBadge>}</div>
                  <h4 className="mt-3 break-words font-black text-dtsc-ink">{entry.summary}</h4>
                  <p className="mt-1 text-xs font-bold text-dtsc-muted">{formatDate(entry.workDate, locale)} · {entry.startTime} → {entry.endTime} · {formatMinutes(entry.workedMinutes)}</p>
                  {entry.details ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-dtsc-muted">{entry.details}</p> : null}
                </button>
                {editable ? <div className="mt-3 border-t border-dtsc-border pt-3"><ContextActions label={t("work.actions")} actions={[{ id: "edit", label: t("work.edit"), icon: Pencil, onSelect: () => onEdit(entry) }, { id: "delete", label: t("work.delete"), icon: Trash2, destructive: true, separatorBefore: true, disabled: saving, onSelect: () => onDelete(entry) }]} /></div> : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  ) : <EmptyState compact title={t("work.none")} description={t("work.noneDescription")} icon={Clock3} />;
}

function SubmissionHistoryItem({ submission, currentPeriodEnd, canSubmitPast, locale, canSubmit, onOpen, onSubmit }: { submission: WorkSubmission; currentPeriodEnd: string; canSubmitPast: boolean; locale?: string | null; canSubmit: boolean; onOpen: () => void; onSubmit: () => void }) {
  const t = (key: ActivitiesKey) => translateActivities(locale, key);
  const isPast = submission.periodEnd < currentPeriodEnd;
  return <BusinessListItem title={`${formatDate(submission.periodStart, locale)} → ${formatDate(submission.periodEnd, locale)}`} meta={`${t("work.declared")}: ${formatMinutes(submission.declaredMinutes)}${submission.validatedMinutes !== null ? ` · ${t("work.validated")}: ${formatMinutes(submission.validatedMinutes)}` : ""}`} description={submission.reviewComment || (isPast && isEditable(submission) && !canSubmitPast ? t("work.pastPermission") : t("work.openDetails"))} status={<StatusBadge tone={statusTone(submission.status)}>{submissionStatusLabel(submission.status, locale)}</StatusBadge>} actions={<div className="flex items-center gap-2"><Button type="button" variant="outline" size="icon" onClick={onOpen} className="rounded-xl border-dtsc-border text-dtsc-blue" aria-label={t("work.openSubmissionDetails")}><Eye className="h-4 w-4" /></Button>{canSubmit ? <Button type="button" size="icon" onClick={onSubmit} className="rounded-xl bg-dtsc-blue text-white" aria-label={t("work.submitPeriodAria")}><Send className="h-4 w-4" /></Button> : null}</div>} />;
}

function SubmissionHistoryKanban({ columns, locale, canSubmitSubmission, onOpen, onSubmit }: { columns: Array<{ id: string; label: string; submissions: WorkSubmission[] }>; locale?: string | null; canSubmitSubmission: (submission: WorkSubmission) => boolean; onOpen: (submission: WorkSubmission) => void; onSubmit: (submission: WorkSubmission) => void }) {
  const t = (key: ActivitiesKey) => translateActivities(locale, key);
  return <div className="flex min-w-0 gap-4 overflow-x-auto pb-3" aria-label={t("work.historyKanbanAria")}>{columns.map((column) => <section key={column.id} className="w-[min(86vw,22rem)] shrink-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3"><div className="flex items-center justify-between gap-3"><h3 className="font-black text-dtsc-ink">{column.label}</h3><span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-black text-cyan-700 dark:text-cyan-200">{column.submissions.length}</span></div><div className="mt-3 max-h-[62dvh] space-y-3 overflow-y-auto pr-1">{column.submissions.map((submission) => <article key={submission.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><button type="button" onClick={() => onOpen(submission)} className="block w-full text-left"><p className="font-black text-dtsc-ink">{formatDate(submission.periodStart, locale)} → {formatDate(submission.periodEnd, locale)}</p><p className="mt-2 text-xs font-bold text-dtsc-muted">{formatMinutes(submission.declaredMinutes)} · {submission.entries.length} {t("work.entryCount")} · {t("work.revision").toLocaleLowerCase(userLocale({ locale }))} {submission.revision}</p>{submission.reviewComment ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-amber-700 dark:text-amber-300">{submission.reviewComment}</p> : null}</button><div className="mt-3 flex gap-2 border-t border-dtsc-border pt-3"><Button type="button" size="sm" variant="outline" onClick={() => onOpen(submission)} className="rounded-xl"><Eye className="h-4 w-4" /> {t("work.open")}</Button>{canSubmitSubmission(submission) ? <Button type="button" size="sm" onClick={() => onSubmit(submission)} className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" /> {t("work.submit")}</Button> : null}</div></article>)}</div></section>)}</div>;
}

function groupEntries(entries: WorkEntry[], grouping: "locationMode" | "workType", locale?: string | null) {
  const map = new Map<string, WorkEntry[]>();
  for (const entry of entries) {
    const key = grouping === "workType" ? entry.workType : entry.locationMode?.trim() || "UNDEFINED";
    map.set(key, [...(map.get(key) || []), entry]);
  }
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right, userLocale({ locale }))).map(([id, grouped]) => ({ id, label: grouping === "workType" ? formatEnumLabelForLocale(id, locale) : locationModeLabel(id, locale), entries: grouped }));
}

function groupSubmissionsByStatus(submissions: WorkSubmission[], locale?: string | null) {
  const map = new Map<string, WorkSubmission[]>();
  for (const submission of submissions) map.set(submission.status, [...(map.get(submission.status) || []), submission]);
  const order = ["DRAFT", "SUBMITTED", "RESUBMITTED", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "CANCELLED"];
  return [...map.entries()].sort(([left], [right]) => order.indexOf(left) - order.indexOf(right)).map(([id, grouped]) => ({ id, label: submissionStatusLabel(id, locale), submissions: grouped }));
}

function SubmissionEntries({ submission, locale, editable, saving, onOpen, onEdit, onDelete }: { submission: WorkSubmission; locale?: string | null; editable: boolean; saving: boolean; onOpen: (entry: WorkEntry) => void; onEdit: (entry: WorkEntry) => void; onDelete: (entry: WorkEntry) => void }) {
  const t = (key: ActivitiesKey) => translateActivities(locale, key);
  return submission.entries.length ? (
    <BusinessList ariaLabel={t("work.entries")}>
      {submission.entries.map((entry) => (
        <BusinessListItem
          key={entry.id}
          title={entry.summary}
          onOpen={() => onOpen(entry)}
          openLabel={`${t("work.open")} ${entry.summary}`}
          meta={`${formatDate(entry.workDate, locale)} · ${entry.startTime} → ${entry.endTime} · ${formatMinutes(entry.workedMinutes)}`}
          description={`${formatEnumLabelForLocale(entry.workType, locale)} · ${locationModeLabel(entry.locationMode, locale)}${entry.breakMinutes ? ` · ${t("work.break").toLocaleLowerCase(userLocale({ locale }))} ${entry.breakMinutes} min` : ""}${entry.details ? ` · ${entry.details}` : ""}`}
          status={entry.scheduleBlockingCount > 0 ? <StatusBadge tone="danger">{t("work.absenceConflict")}</StatusBadge> : entry.scheduleOutsideAvailability ? <StatusBadge tone="warning">{t("work.outsideAvailability")}</StatusBadge> : entry.scheduleWarningCount > 0 ? <StatusBadge tone="info">{t("work.warning")}</StatusBadge> : <StatusBadge tone="success">{t("work.scheduleConsistent")}</StatusBadge>}
          actions={editable ? <ContextActions label={t("work.actions")} actions={[{ id: "edit", label: t("work.edit"), icon: Pencil, onSelect: () => onEdit(entry) }, { id: "delete", label: t("work.delete"), icon: Trash2, destructive: true, separatorBefore: true, disabled: saving, onSelect: () => onDelete(entry) }]} /> : undefined}
        />
      ))}
    </BusinessList>
  ) : <EmptyState compact title={t("work.none")} description={t("work.noneDescription")} icon={Clock3} />;
}

function EntryDialog({ open, entry, defaultDate, locale, onClose, onSaved }: { open: boolean; entry?: WorkEntry; defaultDate: string; locale?: string | null; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const t = useCallback((key: ActivitiesKey) => translateActivities(locale, key), [locale]);
  const [form, setForm] = useState<EntryForm>(() => initialForm(entry, defaultDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function resetFromProps() { setForm(initialForm(entry, defaultDate)); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const endpoint = entry ? `/api/work/entries/${entry.id}` : "/api/work/entries";
    const response = await fetch(endpoint, { method: entry ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, breakMinutes: Number(form.breakMinutes || 0) }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) await onSaved(entry ? t("work.entryUpdated") : t("work.entryCreated"));
    else setError(body?.message || t("work.saveError"));
    setSaving(false);
  }
  const set = (key: keyof EntryForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} title={entry ? t("work.editEntry") : t("work.newEntry")} description={t("work.entryDialogDescription")} onClose={() => { resetFromProps(); onClose(); }} className="h-[94dvh] max-w-3xl">
      <form onSubmit={submit} className="grid min-h-0 gap-3 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("work.date")} hint={t("work.dateHint")}><Input type="date" value={form.workDate} onChange={(event) => set("workDate", event.target.value)} required className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={t("work.workType")} hint={t("work.workTypeHint")}><select value={form.workType} onChange={(event) => set("workType", event.target.value)} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{WORK_TYPES.map((value) => <option key={value} value={value}>{formatEnumLabelForLocale(value, locale)}</option>)}</select></FormField>
          <FormField label={t("start")} hint={t("work.startHint")}><Input type="time" value={form.startTime} onChange={(event) => set("startTime", event.target.value)} required className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={t("end")} hint={t("work.endHint")}><Input type="time" value={form.endTime} onChange={(event) => set("endTime", event.target.value)} required className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={t("work.breakMinutes")} hint={t("work.breakHint")}><Input type="number" min={0} max={720} value={form.breakMinutes} onChange={(event) => set("breakMinutes", event.target.value)} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={t("work.locationMode")} hint={t("work.locationHint")}><select value={form.locationMode} onChange={(event) => set("locationMode", event.target.value)} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{LOCATION_MODES.map((value) => <option key={value} value={value}>{locationModeLabel(value, locale)}</option>)}</select></FormField>
        </div>
        <FormField label={t("work.summaryField")} hint={t("work.summaryHint")}><Input value={form.summary} onChange={(event) => set("summary", event.target.value)} required minLength={3} maxLength={240} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
        <FormField label={t("work.details")} hint={t("work.detailsHint")}><textarea value={form.details} onChange={(event) => set("details", event.target.value)} className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField>
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} className="rounded-xl">{t("work.cancel")}</Button><Button type="submit" disabled={saving} className="rounded-xl bg-dtsc-blue text-white">{t("work.save")}</Button></div>
      </form>
    </Dialog>
  );
}

function ViewToggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof List; label: string }) { return <button type="button" onClick={onClick} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${active ? "border-cyan-400 bg-cyan-400/15 text-cyan-800 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted"}`}><Icon className="h-4 w-4" /> {label}</button>; }
function initialForm(entry: WorkEntry | undefined, defaultDate: string): EntryForm { return { workDate: entry?.workDate || defaultDate, startTime: entry?.startTime || "08:00", endTime: entry?.endTime || "17:00", breakMinutes: String(entry?.breakMinutes || 0), workType: entry?.workType || "NORMAL_WORK", locationMode: entry?.locationMode || "Non défini", summary: entry?.summary || "", details: entry?.details || "" }; }
function isEditable(submission: WorkSubmission) { return submission.status === "DRAFT" || submission.status === "CHANGES_REQUESTED"; }
function hasScheduleIssue(entry: WorkEntry) { return entry.scheduleOutsideAvailability || entry.scheduleBlockingCount > 0 || entry.scheduleWarningCount > 0; }
function formatMinutes(minutes: number) { return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`; }
function formatDate(value: string, locale?: string | null) { return new Intl.DateTimeFormat(userLocale({ locale }), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function formatTimestamp(value: string | null | undefined, locale?: string | null) { return value ? new Intl.DateTimeFormat(userLocale({ locale }), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function statusTone(status: string): StatusBadgeTone { if (["APPROVED", "COMPLETED", "VALIDATED"].includes(status)) return "success"; if (["REJECTED", "CANCELLED"].includes(status)) return "danger"; if (["CHANGES_REQUESTED", "BLOCKED"].includes(status)) return "warning"; if (["SUBMITTED", "IN_PROGRESS"].includes(status)) return "info"; return "neutral"; }
function submissionStatusLabel(status: string, locale?: string | null) { return formatEnumLabelForLocale(status, locale); }
function locationModeLabel(value: string | null | undefined, locale?: string | null) { const key: Record<string, ActivitiesKey> = { "Site DTSC": "work.location.site", "Télétravail": "work.location.remote", "Hybride": "work.location.hybrid", "Externe": "work.location.external", "Mission": "work.location.mission", "Non défini": "work.location.undefined", UNDEFINED: "work.location.undefined" }; return value ? translateActivities(locale, key[value] || "work.location.undefined") : translateActivities(locale, "work.location.undefined"); }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>; }
