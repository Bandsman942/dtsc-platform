"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { translate } from "@/lib/i18n";

const WORK_TYPES = ["NORMAL_WORK", "MEETING", "MISSION", "PROJECT_WORK", "SUPPORT", "TRAINING", "ADMINISTRATIVE", "OTHER"] as const;
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
};

type WorkSubmission = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  declaredMinutes: number;
  validatedMinutes: number | null;
  submittedAt: string | null;
  reviewComment: string | null;
  revision: number;
  entries: WorkEntry[];
  reviews: Array<{ id: string; action: string; comment: string | null; createdAt: string }>;
};

type WorkState = {
  timezone: string;
  today: string;
  currentPeriod: { periodStart: string; periodEnd: string };
  currentSubmission: WorkSubmission;
  submissions: WorkSubmission[];
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

export function WorkPrestationsPanel({ locale }: { locale?: string | null }) {
  const t = useCallback((key: string) => translate(locale, `workPrestations.${key}`), [locale]);
  const [state, setState] = useState<WorkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry?: WorkEntry }>({ open: false });
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useToastMessage(message);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/work/submissions", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as WorkState & { message?: string } | null;
    if (response.ok && body) setState(body);
    else setMessage(body?.message || t("loadError"));
    setLoading(false);
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const current = state?.currentSubmission;
  const editable = current?.status === "DRAFT" || current?.status === "CHANGES_REQUESTED";
  const workedDays = useMemo(() => new Set((current?.entries || []).map((entry) => entry.workDate)).size, [current?.entries]);
  const scheduleIssues = useMemo(() => (current?.entries || []).filter(hasScheduleIssue).length, [current?.entries]);

  async function removeEntry(entry: WorkEntry) {
    if (!editable) return;
    setSaving(true);
    const response = await fetch(`/api/work/entries/${entry.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? t("deleted") : body?.message || t("deleteError"));
    if (response.ok) await load();
    setSaving(false);
  }

  async function submitPeriod(confirmScheduleConflicts = false) {
    if (!current) return;
    setSaving(true);
    const response = await fetch(`/api/work/submissions/${current.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmScheduleConflicts }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (response.ok) {
      setSubmitDialogOpen(false);
      setConflictMessage("");
      setMessage(current.status === "CHANGES_REQUESTED" ? t("resubmitted") : t("submitted"));
      await load();
    } else if (body?.error === "SCHEDULE_CONFLICT_CONFIRMATION_REQUIRED") {
      setConflictMessage(body.message || t("conflictConfirmation"));
      setSubmitDialogOpen(true);
    } else {
      setMessage(body?.message || t("submitError"));
    }
    setSaving(false);
  }

  return (
    <>
      <ModuleSection
        id="work-prestations"
        title={t("title")}
        description={t("description")}
        count={current ? `${formatDate(current.periodStart, locale)} → ${formatDate(current.periodEnd, locale)}` : undefined}
        action={editable ? (
          <Button type="button" onClick={() => setEntryDialog({ open: true })} className="rounded-xl bg-dtsc-blue text-white">
            <Plus className="h-4 w-4" /> {t("add")}
          </Button>
        ) : undefined}
      >
        {loading ? <p className="py-6 text-sm text-dtsc-muted">{t("loading")}</p> : current ? (
          <div className="min-w-0 space-y-5">
            <ModuleMetrics label={t("weeklySummary")}>
              <ModuleMetric label={t("declaredTime")} value={formatMinutes(current.declaredMinutes)} />
              <ModuleMetric label={t("entries")} value={current.entries.length} />
              <ModuleMetric label={t("workedDays")} value={workedDays} />
              <ModuleMetric label={t("scheduleIssues")} value={scheduleIssues} />
            </ModuleMetrics>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-y border-dtsc-border py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusTone(current.status)}>{statusLabel(t, current.status)}</StatusBadge>
                  {current.revision > 0 ? <span className="text-xs font-bold text-dtsc-muted">{t("revision")} {current.revision}</span> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-dtsc-muted">{t("availabilityDisclaimer")}</p>
                {current.reviewComment ? <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">{t("reviewComment")}: {current.reviewComment}</p> : null}
              </div>
              {editable && current.entries.length ? (
                <Button type="button" onClick={() => setSubmitDialogOpen(true)} disabled={saving} className="rounded-xl bg-dtsc-blue text-white">
                  <Send className="h-4 w-4" /> {current.status === "CHANGES_REQUESTED" ? t("resubmit") : t("submit")}
                </Button>
              ) : null}
            </div>

            {current.entries.length ? (
              <BusinessList ariaLabel={t("entries")}>
                {current.entries.map((entry) => (
                  <BusinessListItem
                    key={entry.id}
                    title={entry.summary}
                    meta={`${formatDate(entry.workDate, locale)} · ${entry.startTime} → ${entry.endTime} · ${formatMinutes(entry.workedMinutes)}`}
                    description={`${workTypeLabel(t, entry.workType)} · ${entry.locationMode || t("locationUnknown")}${entry.breakMinutes ? ` · ${t("break")}: ${entry.breakMinutes} min` : ""}`}
                    status={entry.scheduleBlockingCount > 0
                      ? <StatusBadge tone="danger">{t("absenceConflict")}</StatusBadge>
                      : entry.scheduleOutsideAvailability
                        ? <StatusBadge tone="warning">{t("outsideSchedule")}</StatusBadge>
                        : entry.scheduleWarningCount > 0
                          ? <StatusBadge tone="info">{t("scheduleWarning")}</StatusBadge>
                          : <StatusBadge tone="success">{t("scheduleOk")}</StatusBadge>}
                    actions={editable ? (
                      <ContextActions label={t("actions")} actions={[
                        { id: "edit", label: t("edit"), icon: Pencil, onSelect: () => setEntryDialog({ open: true, entry }) },
                        { id: "delete", label: t("delete"), icon: Trash2, destructive: true, separatorBefore: true, disabled: saving, onSelect: () => void removeEntry(entry) },
                      ]} />
                    ) : undefined}
                  />
                ))}
              </BusinessList>
            ) : (
              <EmptyState compact title={t("noEntries")} description={t("noEntriesDescription")} icon={Clock3} />
            )}
          </div>
        ) : (
          <EmptyState compact title={t("unavailable")} description={t("loadError")} />
        )}
      </ModuleSection>

      {state?.submissions?.length ? (
        <ModuleSection id="work-prestations-history" title={t("history")} description={t("historyDescription")} count={String(state.submissions.length)}>
          <BusinessList ariaLabel={t("history")}>
            {state.submissions.slice(0, 8).map((submission) => (
              <BusinessListItem
                key={submission.id}
                title={`${formatDate(submission.periodStart, locale)} → ${formatDate(submission.periodEnd, locale)}`}
                meta={`${t("declaredTime")}: ${formatMinutes(submission.declaredMinutes)}${submission.validatedMinutes !== null ? ` · ${t("validatedTime")}: ${formatMinutes(submission.validatedMinutes)}` : ""}`}
                description={submission.reviewComment || t("historyItemDescription")}
                status={<StatusBadge tone={statusTone(submission.status)}>{statusLabel(t, submission.status)}</StatusBadge>}
              />
            ))}
          </BusinessList>
        </ModuleSection>
      ) : null}

      <EntryDialog
        open={entryDialog.open}
        entry={entryDialog.entry}
        defaultDate={state?.today || ""}
        locale={locale}
        onClose={() => setEntryDialog({ open: false })}
        onSaved={async (successMessage) => { setEntryDialog({ open: false }); setMessage(successMessage); await load(); }}
      />

      <Dialog
        open={submitDialogOpen}
        title={current?.status === "CHANGES_REQUESTED" ? t("resubmitTitle") : t("submitTitle")}
        description={t("submitDescription")}
        onClose={() => { setSubmitDialogOpen(false); setConflictMessage(""); }}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => { setSubmitDialogOpen(false); setConflictMessage(""); }} className="rounded-xl">{t("cancel")}</Button>
            <Button type="button" onClick={() => void submitPeriod(Boolean(conflictMessage))} disabled={saving} className="rounded-xl bg-dtsc-blue text-white">
              <Send className="h-4 w-4" /> {current?.status === "CHANGES_REQUESTED" ? t("resubmit") : t("submit")}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-dtsc-ink">{t("confirmSubmit")}</p>
          <div className="grid gap-2 border-y border-dtsc-border py-3 text-sm sm:grid-cols-2">
            <span><strong>{t("declaredTime")}:</strong> {formatMinutes(current?.declaredMinutes || 0)}</span>
            <span><strong>{t("entries")}:</strong> {current?.entries.length || 0}</span>
          </div>
          {conflictMessage ? (
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div><strong>{t("scheduleConflictTitle")}</strong><p>{conflictMessage}</p><p className="mt-1">{t("conflictConfirmation")}</p></div>
            </div>
          ) : (
            <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0" /> {t("submitChecksReady")}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

function EntryDialog({
  open,
  entry,
  defaultDate,
  locale,
  onClose,
  onSaved,
}: {
  open: boolean;
  entry?: WorkEntry;
  defaultDate: string;
  locale?: string | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const t = useCallback((key: string) => translate(locale, `workPrestations.${key}`), [locale]);
  const [form, setForm] = useState<EntryForm>(() => initialForm(entry, defaultDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (open) { setForm(initialForm(entry, defaultDate)); setError(""); } }, [defaultDate, entry, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const endpoint = entry ? `/api/work/entries/${entry.id}` : "/api/work/entries";
    const response = await fetch(endpoint, {
      method: entry ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, breakMinutes: Number(form.breakMinutes || 0) }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) await onSaved(entry ? t("updated") : t("created"));
    else setError(body?.message || t("saveError"));
    setSaving(false);
  }

  const set = (key: keyof EntryForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <Dialog
      open={open}
      title={entry ? t("editTitle") : t("addTitle")}
      description={t("entryFormDescription")}
      onClose={onClose}
      className="h-[94dvh] sm:h-auto"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">{t("cancel")}</Button>
          <Button type="submit" form="work-entry-form" disabled={saving} className="rounded-xl bg-dtsc-blue text-white">{t("save")}</Button>
        </>
      )}
    >
      <form id="work-entry-form" onSubmit={submit} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field label={t("date")}><Input type="date" value={form.workDate} onChange={(event) => set("workDate", event.target.value)} required className="w-full" /></Field>
        <Field label={t("workType")}>
          <Select value={form.workType} onValueChange={(value) => set("workType", value)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{WORK_TYPES.map((type) => <SelectItem key={type} value={type}>{workTypeLabel(t, type)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t("start")}><Input type="time" value={form.startTime} onChange={(event) => set("startTime", event.target.value)} required className="w-full" /></Field>
        <Field label={t("end")}><Input type="time" value={form.endTime} onChange={(event) => set("endTime", event.target.value)} required className="w-full" /></Field>
        <Field label={t("break")}><Input type="number" min="0" step="1" value={form.breakMinutes} onChange={(event) => set("breakMinutes", event.target.value)} className="w-full" /></Field>
        <Field label={t("location")}>
          <Select value={form.locationMode} onValueChange={(value) => set("locationMode", value)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{LOCATION_MODES.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t("summary")} wide><Input value={form.summary} onChange={(event) => set("summary", event.target.value)} minLength={3} maxLength={240} required className="w-full" /></Field>
        <Field label={t("details")} wide>
          <textarea value={form.details} onChange={(event) => set("details", event.target.value)} rows={5} maxLength={2500} className="min-h-28 w-full resize-y rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30" />
        </Field>
        {error ? <p className="sm:col-span-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      </form>
    </Dialog>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`grid min-w-0 gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted ${wide ? "sm:col-span-2" : ""}`}><span>{label}</span>{children}</label>;
}

function initialForm(entry: WorkEntry | undefined, defaultDate: string): EntryForm {
  return {
    workDate: entry?.workDate || defaultDate,
    startTime: entry?.startTime || "08:00",
    endTime: entry?.endTime || "12:00",
    breakMinutes: String(entry?.breakMinutes || 0),
    workType: entry?.workType || "NORMAL_WORK",
    locationMode: entry?.locationMode || "Non défini",
    summary: entry?.summary || "",
    details: entry?.details || "",
  };
}

function hasScheduleIssue(entry: WorkEntry) {
  return entry.scheduleOutsideAvailability || entry.scheduleBlockingCount > 0 || entry.scheduleWarningCount > 0;
}

function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

function formatDate(value: string, locale?: string | null) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function statusTone(status: string): StatusBadgeTone {
  if (status === "APPROVED") return "success";
  if (status === "SUBMITTED") return "info";
  if (status === "CHANGES_REQUESTED") return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

function statusLabel(t: (key: string) => string, status: string) {
  return t(`status_${status}`);
}

function workTypeLabel(t: (key: string) => string, type: string) {
  return t(`type_${type}`);
}
