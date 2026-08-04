"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Eye, Pencil, Plus, Send, Trash2 } from "lucide-react";
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
  const english = locale === "en";
  const [state, setState] = useState<WorkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry?: WorkEntry; submission?: WorkSubmission }>({ open: false });
  const [selectedSubmission, setSelectedSubmission] = useState<WorkSubmission | null>(null);
  const [submitTarget, setSubmitTarget] = useState<WorkSubmission | null>(null);
  const [conflictMessage, setConflictMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useToastMessage(message);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/work/submissions?limit=24", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as WorkState & { message?: string } | null;
    if (response.ok && body) {
      setState(body);
      setSelectedSubmission((current) => current ? body.submissions.find((submission) => submission.id === current.id) || null : null);
    } else {
      setMessage(body?.message || (english ? "Unable to load work submissions." : "Chargement des prestations impossible."));
    }
    setLoading(false);
  }, [english]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = state?.currentSubmission;
  const currentEditable = Boolean(current && isEditable(current));
  const workedDays = useMemo(() => new Set((current?.entries || []).map((entry) => entry.workDate)).size, [current?.entries]);
  const scheduleIssues = useMemo(() => (current?.entries || []).filter(hasScheduleIssue).length, [current?.entries]);

  async function removeEntry(entry: WorkEntry, submission: WorkSubmission) {
    if (!isEditable(submission)) return;
    setSaving(true);
    const response = await fetch(`/api/work/entries/${entry.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? (english ? "Work entry deleted." : "Prestation supprimée.") : body?.message || (english ? "Unable to delete." : "Suppression impossible."));
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
      setMessage(target.status === "CHANGES_REQUESTED" ? (english ? "Submission sent again." : "Prestations resoumises.") : (english ? "Submission sent." : "Prestations soumises."));
      await load();
    } else if (body?.error === "SCHEDULE_CONFLICT_CONFIRMATION_REQUIRED") {
      setConflictMessage(body.message || (english ? "Schedule conflicts require confirmation." : "Des conflits de planning exigent une confirmation."));
      setSubmitTarget(target);
    } else {
      setMessage(body?.message || (english ? "Unable to submit." : "Soumission impossible."));
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
        title={english ? "Weekly work submissions" : "Prestations hebdomadaires"}
        description={english ? "Declare actual work, then submit the week for independent review." : "Déclarez le travail réellement effectué, puis soumettez la semaine pour validation indépendante."}
        count={current ? `${formatDate(current.periodStart, locale)} → ${formatDate(current.periodEnd, locale)}` : undefined}
        action={currentEditable ? (
          <Button type="button" onClick={() => setEntryDialog({ open: true, submission: current || undefined })} className="rounded-xl bg-dtsc-blue text-white">
            <Plus className="h-4 w-4" /> {english ? "Add" : "Ajouter"}
          </Button>
        ) : undefined}
      >
        {loading ? (
          <p className="py-6 text-sm text-dtsc-muted">{english ? "Loading…" : "Chargement…"}</p>
        ) : current ? (
          <div className="min-w-0 space-y-5">
            <ModuleMetrics label={english ? "Weekly summary" : "Synthèse hebdomadaire"}>
              <ModuleMetric label={english ? "Declared time" : "Temps déclaré"} value={formatMinutes(current.declaredMinutes)} />
              <ModuleMetric label={english ? "Entries" : "Prestations"} value={current.entries.length} />
              <ModuleMetric label={english ? "Worked days" : "Jours travaillés"} value={workedDays} />
              <ModuleMetric label={english ? "Schedule issues" : "Écarts de planning"} value={scheduleIssues} />
            </ModuleMetrics>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-y border-dtsc-border py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusTone(current.status)}>{statusLabel(current.status, english)}</StatusBadge>
                  {current.revision > 0 ? <span className="text-xs font-bold text-dtsc-muted">{english ? "Revision" : "Révision"} {current.revision}</span> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-dtsc-muted">{english ? "Availability is planning context, not proof of work or payroll calculation." : "La disponibilité est un contexte de planification, jamais une preuve de travail ni un calcul automatique de paie."}</p>
                {current.reviewComment ? <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">{english ? "Review comment" : "Commentaire de validation"}: {current.reviewComment}</p> : null}
              </div>
              {canSubmitSubmission(current) ? (
                <Button type="button" onClick={() => setSubmitTarget(current)} disabled={saving} className="rounded-xl bg-dtsc-blue text-white">
                  <Send className="h-4 w-4" /> {current.status === "CHANGES_REQUESTED" ? (english ? "Submit again" : "Resoumettre") : (english ? "Submit" : "Soumettre")}
                </Button>
              ) : null}
            </div>

            <SubmissionEntries
              submission={current}
              locale={locale}
              editable={currentEditable}
              saving={saving}
              onEdit={(entry) => setEntryDialog({ open: true, entry, submission: current })}
              onDelete={(entry) => void removeEntry(entry, current)}
            />
          </div>
        ) : (
          <EmptyState compact title={english ? "Unavailable" : "Indisponible"} description={english ? "Unable to load this week's submission." : "Impossible de charger la période courante."} />
        )}
      </ModuleSection>

      {state?.submissions?.length ? (
        <ModuleSection
          id="work-prestations-history"
          title={english ? "Submission history" : "Historique des prestations"}
          description={english ? "Open any week to review entries, revisions, review decisions and timestamps." : "Ouvrez chaque semaine pour consulter les prestations, révisions, décisions de validation et dates de traçabilité."}
          count={String(state.submissions.length)}
        >
          <BusinessList ariaLabel={english ? "Submission history" : "Historique des prestations"}>
            {state.submissions.map((submission) => {
              const isPast = submission.periodEnd < state.currentPeriod.periodEnd;
              const canSubmitPast = Boolean(state.capabilities?.canSubmitPastPeriods);
              return (
                <BusinessListItem
                  key={submission.id}
                  title={`${formatDate(submission.periodStart, locale)} → ${formatDate(submission.periodEnd, locale)}`}
                  meta={`${english ? "Declared" : "Déclaré"}: ${formatMinutes(submission.declaredMinutes)}${submission.validatedMinutes !== null ? ` · ${english ? "Validated" : "Validé"}: ${formatMinutes(submission.validatedMinutes)}` : ""}`}
                  description={submission.reviewComment || (isPast && isEditable(submission) && !canSubmitPast ? (english ? "Past-period submission requires an individual permission." : "La soumission de cette semaine passée exige une permission individuelle.") : (english ? "Open for full details." : "Ouvrez pour afficher tous les détails."))}
                  status={<StatusBadge tone={statusTone(submission.status)}>{statusLabel(submission.status, english)}</StatusBadge>}
                  actions={(
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="icon" onClick={() => setSelectedSubmission(submission)} className="rounded-xl border-dtsc-border text-dtsc-blue" aria-label={english ? "Open submission details" : "Ouvrir le détail des prestations"}><Eye className="h-4 w-4" /></Button>
                      {canSubmitSubmission(submission) ? <Button type="button" size="icon" onClick={() => setSubmitTarget(submission)} className="rounded-xl bg-dtsc-blue text-white" aria-label={english ? "Submit period" : "Soumettre la période"}><Send className="h-4 w-4" /></Button> : null}
                    </div>
                  )}
                />
              );
            })}
          </BusinessList>
        </ModuleSection>
      ) : null}

      <EntryDialog
        open={entryDialog.open}
        entry={entryDialog.entry}
        defaultDate={entryDialog.submission?.periodStart || state?.today || ""}
        locale={locale}
        onClose={() => setEntryDialog({ open: false })}
        onSaved={async (successMessage) => {
          setEntryDialog({ open: false });
          setMessage(successMessage);
          await load();
        }}
      />

      <Dialog
        open={Boolean(selectedSubmission)}
        title={selectedSubmission ? `${english ? "Work submission" : "Prestations"} · ${formatDate(selectedSubmission.periodStart, locale)} → ${formatDate(selectedSubmission.periodEnd, locale)}` : ""}
        description={english ? "Complete weekly detail and review history." : "Détail complet de la semaine et historique de validation."}
        onClose={() => setSelectedSubmission(null)}
        className="h-[94dvh] max-w-5xl"
      >
        {selectedSubmission ? (
          <div className="min-h-0 min-w-0 space-y-5 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label={english ? "Status" : "Statut"} value={statusLabel(selectedSubmission.status, english)} />
              <Detail label={english ? "Declared time" : "Temps déclaré"} value={formatMinutes(selectedSubmission.declaredMinutes)} />
              <Detail label={english ? "Created" : "Créée le"} value={formatTimestamp(selectedSubmission.createdAt, locale)} />
              <Detail label={english ? "Last update" : "Dernière modification"} value={formatTimestamp(selectedSubmission.updatedAt, locale)} />
            </div>
            <SubmissionEntries
              submission={selectedSubmission}
              locale={locale}
              editable={isEditable(selectedSubmission)}
              saving={saving}
              onEdit={(entry) => setEntryDialog({ open: true, entry, submission: selectedSubmission })}
              onDelete={(entry) => void removeEntry(entry, selectedSubmission)}
            />
            <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <h3 className="font-black text-dtsc-ink">{english ? "Review history" : "Historique de validation"}</h3>
              <div className="mt-3 space-y-2">
                {selectedSubmission.reviews.map((review) => <div key={review.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm"><p className="font-black text-dtsc-ink">{statusLabel(review.action, english)} · {formatTimestamp(review.createdAt, locale)}</p>{review.comment ? <p className="mt-1 leading-6 text-dtsc-muted">{review.comment}</p> : null}</div>)}
                {!selectedSubmission.reviews.length ? <p className="text-sm text-dtsc-muted">{english ? "No review event yet." : "Aucune décision de validation enregistrée."}</p> : null}
              </div>
            </section>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(submitTarget)}
        title={submitTarget?.status === "CHANGES_REQUESTED" ? (english ? "Submit corrected period" : "Resoumettre la période corrigée") : (english ? "Submit work period" : "Soumettre la période")}
        description={english ? "The period becomes read-only until a reviewer requests changes." : "La période devient non modifiable jusqu'à une éventuelle demande de correction."}
        onClose={() => { setSubmitTarget(null); setConflictMessage(""); }}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => { setSubmitTarget(null); setConflictMessage(""); }} className="rounded-xl">{english ? "Cancel" : "Annuler"}</Button>
            <Button type="button" onClick={() => submitTarget && void submitPeriod(submitTarget, Boolean(conflictMessage))} disabled={saving} className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" /> {english ? "Confirm" : "Confirmer"}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-dtsc-ink">{submitTarget ? `${formatDate(submitTarget.periodStart, locale)} → ${formatDate(submitTarget.periodEnd, locale)} · ${formatMinutes(submitTarget.declaredMinutes)} · ${submitTarget.entries.length} prestation(s)` : ""}</p>
          {conflictMessage ? <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>{english ? "Schedule conflict" : "Conflit de planning"}</strong><p>{conflictMessage}</p></div></div> : <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="h-5 w-5 shrink-0" /> {english ? "The submission can be sent for review." : "La période peut être envoyée au validateur."}</div>}
        </div>
      </Dialog>
    </>
  );
}

function SubmissionEntries({ submission, locale, editable, saving, onEdit, onDelete }: { submission: WorkSubmission; locale?: string | null; editable: boolean; saving: boolean; onEdit: (entry: WorkEntry) => void; onDelete: (entry: WorkEntry) => void }) {
  return submission.entries.length ? (
    <BusinessList ariaLabel="Prestations">
      {submission.entries.map((entry) => (
        <BusinessListItem
          key={entry.id}
          title={entry.summary}
          meta={`${formatDate(entry.workDate, locale)} · ${entry.startTime} → ${entry.endTime} · ${formatMinutes(entry.workedMinutes)}`}
          description={`${workTypeLabel(entry.workType)} · ${entry.locationMode || "Lieu non défini"}${entry.breakMinutes ? ` · pause ${entry.breakMinutes} min` : ""}${entry.details ? ` · ${entry.details}` : ""}`}
          status={entry.scheduleBlockingCount > 0 ? <StatusBadge tone="danger">Conflit absence</StatusBadge> : entry.scheduleOutsideAvailability ? <StatusBadge tone="warning">Hors disponibilité</StatusBadge> : entry.scheduleWarningCount > 0 ? <StatusBadge tone="info">Avertissement</StatusBadge> : <StatusBadge tone="success">Planning cohérent</StatusBadge>}
          actions={editable ? <ContextActions label="Actions prestation" actions={[{ id: "edit", label: "Modifier", icon: Pencil, onSelect: () => onEdit(entry) }, { id: "delete", label: "Supprimer", icon: Trash2, destructive: true, separatorBefore: true, disabled: saving, onSelect: () => onDelete(entry) }]} /> : undefined}
        />
      ))}
    </BusinessList>
  ) : <EmptyState compact title="Aucune prestation" description="Aucune prestation n'est enregistrée dans cette période." icon={Clock3} />;
}

function EntryDialog({ open, entry, defaultDate, locale, onClose, onSaved }: { open: boolean; entry?: WorkEntry; defaultDate: string; locale?: string | null; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const english = locale === "en";
  const [form, setForm] = useState<EntryForm>(() => initialForm(entry, defaultDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function resetFromProps() {
    setForm(initialForm(entry, defaultDate));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const endpoint = entry ? `/api/work/entries/${entry.id}` : "/api/work/entries";
    const response = await fetch(endpoint, { method: entry ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, breakMinutes: Number(form.breakMinutes || 0) }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) await onSaved(entry ? (english ? "Work entry updated." : "Prestation modifiée.") : (english ? "Work entry created." : "Prestation créée."));
    else setError(body?.message || (english ? "Unable to save." : "Enregistrement impossible."));
    setSaving(false);
  }

  const set = (key: keyof EntryForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} title={entry ? (english ? "Edit work entry" : "Modifier la prestation") : (english ? "New work entry" : "Nouvelle prestation")} description={english ? "Declare actual work for the selected week." : "Déclarez le travail réellement effectué pour la semaine sélectionnée."} onClose={() => { resetFromProps(); onClose(); }} className="h-[94dvh] max-w-3xl">
      <form onSubmit={submit} className="grid min-h-0 gap-3 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={english ? "Date" : "Date"} hint={english ? "Actual work date." : "Date réelle de la prestation."}><Input type="date" value={form.workDate} onChange={(event) => set("workDate", event.target.value)} required className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={english ? "Work type" : "Type de travail"} hint={english ? "Operational category." : "Catégorie opérationnelle."}><select value={form.workType} onChange={(event) => set("workType", event.target.value)} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{WORK_TYPES.map((value) => <option key={value} value={value}>{workTypeLabel(value)}</option>)}</select></FormField>
          <FormField label={english ? "Start" : "Début"} hint={english ? "Actual start time." : "Heure réelle de début."}><Input type="time" value={form.startTime} onChange={(event) => set("startTime", event.target.value)} required className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={english ? "End" : "Fin"} hint={english ? "Actual end time." : "Heure réelle de fin."}><Input type="time" value={form.endTime} onChange={(event) => set("endTime", event.target.value)} required className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={english ? "Break (minutes)" : "Pause (minutes)"} hint={english ? "Excluded from worked time." : "Déduite du temps travaillé."}><Input type="number" min={0} max={720} value={form.breakMinutes} onChange={(event) => set("breakMinutes", event.target.value)} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
          <FormField label={english ? "Location mode" : "Mode de travail"} hint={english ? "Site, remote or external." : "Site, télétravail ou externe."}><select value={form.locationMode} onChange={(event) => set("locationMode", event.target.value)} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{LOCATION_MODES.map((value) => <option key={value}>{value}</option>)}</select></FormField>
        </div>
        <FormField label={english ? "Summary" : "Résumé"} hint={english ? "Concrete result delivered." : "Résultat concret réalisé."}><Input value={form.summary} onChange={(event) => set("summary", event.target.value)} required minLength={3} maxLength={240} className="h-12 rounded-xl bg-dtsc-page" /></FormField>
        <FormField label={english ? "Details" : "Détails"} hint={english ? "Useful evidence and context." : "Preuves et contexte utiles."}><textarea value={form.details} onChange={(event) => set("details", event.target.value)} className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField>
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} className="rounded-xl">{english ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={saving} className="rounded-xl bg-dtsc-blue text-white">{english ? "Save" : "Enregistrer"}</Button></div>
      </form>
    </Dialog>
  );
}

function initialForm(entry: WorkEntry | undefined, defaultDate: string): EntryForm { return { workDate: entry?.workDate || defaultDate, startTime: entry?.startTime || "08:00", endTime: entry?.endTime || "17:00", breakMinutes: String(entry?.breakMinutes || 0), workType: entry?.workType || "NORMAL_WORK", locationMode: entry?.locationMode || "Non défini", summary: entry?.summary || "", details: entry?.details || "" }; }
function isEditable(submission: WorkSubmission) { return submission.status === "DRAFT" || submission.status === "CHANGES_REQUESTED"; }
function hasScheduleIssue(entry: WorkEntry) { return entry.scheduleOutsideAvailability || entry.scheduleBlockingCount > 0 || entry.scheduleWarningCount > 0; }
function formatMinutes(minutes: number) { return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`; }
function formatDate(value: string, locale?: string | null) { return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`)); }
function formatTimestamp(value: string | null | undefined, locale?: string | null) { return value ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function statusTone(status: string): StatusBadgeTone { if (["APPROVED", "COMPLETED", "VALIDATED"].includes(status)) return "success"; if (["REJECTED", "CANCELLED"].includes(status)) return "danger"; if (["CHANGES_REQUESTED", "BLOCKED"].includes(status)) return "warning"; if (["SUBMITTED", "IN_PROGRESS"].includes(status)) return "info"; return "neutral"; }
function statusLabel(status: string, english: boolean) { const labels: Record<string, string> = { DRAFT: english ? "Draft" : "Brouillon", SUBMITTED: english ? "Submitted" : "Soumise", RESUBMITTED: english ? "Submitted again" : "Resoumise", CHANGES_REQUESTED: english ? "Changes requested" : "Correction demandée", APPROVED: english ? "Approved" : "Validée", REJECTED: english ? "Rejected" : "Refusée", CANCELLED: english ? "Cancelled" : "Annulée" }; return labels[status] || status.replaceAll("_", " "); }
function workTypeLabel(value: string) { const labels: Record<string, string> = { NORMAL_WORK: "Travail normal", MEETING: "Réunion", MISSION: "Mission", PROJECT_WORK: "Travail projet", SUPPORT: "Support", TRAINING: "Formation", ADMINISTRATIVE: "Administratif", OTHER: "Autre" }; return labels[value] || value; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>; }
