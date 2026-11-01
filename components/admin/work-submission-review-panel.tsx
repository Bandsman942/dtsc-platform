"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Eye, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { InternalFullScreenSurface } from "@/components/admin/internal-full-screen-surface";
import { useToastMessage } from "@/components/ui/use-toast-message";
import type { ToastNotice } from "@/lib/client-toast";
import { BusinessDetail, BusinessDetailField, BusinessDetailGrid, BusinessDetailHeader, BusinessDetailSection } from "@/components/workspace/business-detail";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleHeader, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { translate } from "@/lib/i18n";

type ScheduleConflict = { workEntryId: string; workDate: string; id: string; status: string; startTime: string; endTime: string };
type ScheduleContext = {
  timezone: string;
  blocking: Array<{ id: string; status: string; startTime: string; endTime: string }>;
  warnings: Array<{ id: string; status: string; startTime: string; endTime: string }>;
  outsideAvailability: boolean;
  hasDeclaredAvailability: boolean;
};

type WorkEntry = {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workedMinutes: number;
  workType: string;
  locationMode: string | null;
  summary: string;
  details: string | null;
  sourceType: string | null;
  sourceId: string | null;
  scheduleOutsideAvailability: boolean;
  scheduleBlockingCount: number;
  scheduleWarningCount: number;
  scheduleContext?: ScheduleContext;
};

type Review = { id: string; actorEmployeeId: string; action: string; comment: string | null; createdAt: string };
type Submission = {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  declaredMinutes: number;
  validatedMinutes: number | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  revision: number;
  entries: WorkEntry[];
  reviews: Review[];
  employee: { id: string; fullName: string; jobTitle: string; positionCode: string; department: string };
  planning?: {
    timezone: string;
    entriesWithDeclaredAvailability: number;
    entriesOutsideAvailability: number;
    blockingConflicts: ScheduleConflict[];
    warningConflicts: ScheduleConflict[];
  };
};

type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

export function WorkSubmissionReviewPanel({ reviewerRole, locale, embedded = false }: { reviewerRole: "COO" | "CEO"; locale?: string | null; embedded?: boolean }) {
  const t = useCallback((key: string) => translate(locale, `workPrestations.${key}`), [locale]);
  const endpoint = reviewerRole === "COO" ? "/api/admin/coo/work-submissions" : "/api/admin/ceo/work-submissions";
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useToastMessage(notice);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { submissions?: Submission[] } | null;
      if (!response.ok) {
        setNotice({ tone: "error", description: workReviewErrorForStatus(response.status, t, "reviewLoadError") });
      } else if (!Array.isArray(body?.submissions)) {
        setNotice({ tone: "error", description: t("reviewUnexpectedResponse") });
      } else {
        setSubmissions(body.submissions);
      }
    } catch {
      setNotice({ tone: "error", description: t("reviewNetworkError") });
    } finally {
      setLoading(false);
    }
  }, [endpoint, t]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale === "en" ? "en" : "fr");
    return submissions.filter((submission) => {
      if (status !== "ALL" && submission.status !== status) return false;
      if (dateStart && submission.periodStart < dateStart) return false;
      if (dateEnd && submission.periodEnd > dateEnd) return false;
      if (!normalizedQuery) return true;
      const haystack = [submission.employee.fullName, submission.employee.jobTitle, submission.employee.department, submission.periodStart, submission.periodEnd, submission.status].join(" ").toLocaleLowerCase(locale === "en" ? "en" : "fr");
      return haystack.includes(normalizedQuery);
    });
  }, [dateEnd, dateStart, locale, query, status, submissions]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, pageCount);
  const paginated = filtered.slice((currentPage - 1) * 12, currentPage * 12);
  const closeSelected = useCallback(() => { if (saving) return; setSelected(null); setDecision(null); setComment(""); }, [saving]);

  const pendingCount = submissions.filter((item) => item.status === "SUBMITTED").length;
  const changesCount = submissions.filter((item) => item.status === "CHANGES_REQUESTED").length;
  const approvedCount = submissions.filter((item) => item.status === "APPROVED").length;
  const rejectedCount = submissions.filter((item) => item.status === "REJECTED").length;

  const openSubmission = useCallback(async (submission: Submission) => {
    setSelected(submission);
    setDetailLoading(true);
    try {
      const response = await fetch(`${endpoint}/${submission.id}`, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { submission?: Submission } | null;
      if (!response.ok) {
        setNotice({ tone: "error", description: workReviewErrorForStatus(response.status, t, "reviewLoadError") });
      } else if (!body?.submission || body.submission.id !== submission.id) {
        setNotice({ tone: "error", description: t("reviewUnexpectedResponse") });
      } else {
        setSelected(body.submission);
      }
    } catch {
      setNotice({ tone: "error", description: t("reviewNetworkError") });
    } finally {
      setDetailLoading(false);
    }
  }, [endpoint, t]);

  async function review() {
    if (!selected || !decision || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`${endpoint}/${selected.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: decision, comment }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; submission?: Submission } | null;
      if (!response.ok) {
        setNotice({ tone: "error", description: workReviewErrorForStatus(response.status, t, "reviewError") });
        return;
      }
      if (body?.ok !== true || body.submission?.id !== selected.id) {
        setNotice({ tone: "error", description: t("reviewUnexpectedResponse") });
        return;
      }
      setNotice({
        tone: "success",
        description: decision === "APPROVED" ? t("approved") : decision === "CHANGES_REQUESTED" ? t("changesRequested") : t("rejected"),
      });
      setDecision(null);
      setComment("");
      setSelected(null);
      await load();
    } catch {
      setNotice({ tone: "error", description: t("reviewNetworkError") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModuleWorkspace>
      {!embedded ? (
      <ModuleHeader
        eyebrow={reviewerRole === "COO" ? "COO" : "CEO"}
        title={t("reviewTitle")}
        count={`${filtered.length}/${submissions.length}`}
        description={reviewerRole === "COO" ? t("reviewDescriptionCoo") : t("reviewDescriptionCeo")}
      />
      ) : null}
      <div className="flex min-w-0 flex-wrap gap-x-5 gap-y-2 border-b border-dtsc-border py-3 text-xs">{[[t("queueSubmitted"), pendingCount], [t("queueChanges"), changesCount], [t("queueApproved"), approvedCount], [t("queueRejected"), rejectedCount]].map(([label, value]) => <span key={label} className="text-dtsc-muted">{label} <strong className="ml-1 text-base font-black tabular-nums text-dtsc-ink">{value}</strong></span>)}</div>
      <div className="flex min-w-0 flex-wrap items-end gap-2 border-b border-dtsc-border py-2"><label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">Période du<Input type="date" value={dateStart} onChange={(event) => { setDateStart(event.target.value); setPage(1); }} className="h-10 rounded-lg" /></label><label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">Au<Input type="date" value={dateEnd} onChange={(event) => { setDateEnd(event.target.value); setPage(1); }} className="h-10 rounded-lg" /></label>{dateStart || dateEnd ? <Button type="button" size="sm" variant="outline" onClick={() => { setDateStart(""); setDateEnd(""); }}>Effacer</Button> : null}</div>
      <nav aria-label={t("reviewFilters")} className="flex min-w-0 gap-1.5 overflow-x-auto py-1">{["ALL", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "REJECTED"].map((value) => <button type="button" key={value} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold ${status === value ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>{value === "ALL" ? t("allStatuses") : statusLabel(t, value)} · {value === "ALL" ? submissions.length : submissions.filter((item) => item.status === value).length}</button>)}</nav>
      <ListControls query={query} onQueryChange={(value) => { setQuery(value); setPage(1); }} page={currentPage} pageCount={pageCount} totalCount={submissions.length} filteredCount={filtered.length} onPageChange={setPage} placeholder={t("searchPlaceholder")} />
      <section className="min-w-0 space-y-2" aria-label={t("reviewQueue")}>
          {loading ? <p className="py-6 text-sm text-dtsc-muted">{t("loading")}</p> : filtered.length ? (
            <BusinessList ariaLabel={t("reviewQueue")}>
              {paginated.map((submission) => (
                <BusinessListItem
                  key={submission.id}
                  title={submission.employee.fullName}
                  meta={`${submission.employee.jobTitle} · ${submission.employee.department} · ${formatDate(submission.periodStart, locale)} → ${formatDate(submission.periodEnd, locale)}`}
                  className="!py-2"
                  status={<StatusBadge tone={statusTone(submission.status)}>{statusLabel(t, submission.status)}</StatusBadge>}
                  onOpen={() => void openSubmission(submission)}
                  openLabel={`${t("review")} ${submission.employee.fullName}`}
                  actions={(
                    <ContextActions label={t("actions")} actions={[
                      { id: "review", label: t("review"), icon: Eye, onSelect: () => void openSubmission(submission) },
                    ]} />
                  )}
                />
              ))}
            </BusinessList>
          ) : <EmptyState compact title={t("noReviewItems")} description={t("noReviewItemsDescription")} icon={CheckCircle2} />}
      </section>

      <InternalFullScreenSurface
        open={Boolean(selected)}
        title={selected ? `${selected.employee.fullName} · ${formatDate(selected.periodStart, locale)} → ${formatDate(selected.periodEnd, locale)}` : t("review")}
        subtitle={t("reviewDetailDescription")}
        onClose={closeSelected}
        level={2}
      >
        {detailLoading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("loading")}</p> : selected ? <SubmissionDetail submission={selected} locale={locale} t={t} /> : null}
        {selected?.status === "SUBMITTED" && !detailLoading ? <div data-responsive-actions className="mt-4 flex flex-wrap gap-2 border-t border-dtsc-border pt-4">
            <Button type="button" variant="outline" onClick={() => setDecision("CHANGES_REQUESTED")} className="rounded-xl border-amber-500/40 text-amber-700 dark:text-amber-300"><RotateCcw className="h-4 w-4" /> {t("requestChanges")}</Button>
            <Button type="button" variant="outline" onClick={() => setDecision("REJECTED")} className="rounded-xl border-red-500/40 text-red-700 dark:text-red-300"><XCircle className="h-4 w-4" /> {t("reject")}</Button>
            <Button type="button" onClick={() => setDecision("APPROVED")} className="rounded-xl bg-dtsc-blue text-white"><CheckCircle2 className="h-4 w-4" /> {t("approve")}</Button>
        </div> : null}
      </InternalFullScreenSurface>

      <Dialog
        open={Boolean(decision)}
        title={decision === "APPROVED" ? t("approveTitle") : decision === "CHANGES_REQUESTED" ? t("changesTitle") : t("rejectTitle")}
        description={decision === "APPROVED" ? t("approveDescription") : t("reviewReasonDescription")}
        onClose={() => { if (saving) return; setDecision(null); setComment(""); }}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => { setDecision(null); setComment(""); }} disabled={saving} className="rounded-xl">{t("cancel")}</Button>
            <Button type="button" onClick={() => void review()} disabled={saving || ((decision === "CHANGES_REQUESTED" || decision === "REJECTED") && !comment.trim())} className="rounded-xl bg-dtsc-blue text-white">
              {decision === "APPROVED" ? t("approve") : decision === "CHANGES_REQUESTED" ? t("requestChanges") : t("reject")}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          {decision === "APPROVED" ? (
            <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0" /> {t("approveConfirmation")}
            </div>
          ) : (
            <label className="grid gap-2 text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">
              <span>{t("comment")}</span>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1200} rows={6} className="min-h-32 w-full resize-y rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm normal-case tracking-normal text-dtsc-ink outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30" />
            </label>
          )}
        </div>
      </Dialog>
    </ModuleWorkspace>
  );
}

function workReviewErrorForStatus(status: number, t: (key: string) => string, fallback: string): string {
  if (status === 401) return t("reviewSessionExpired");
  if (status === 403) return t("reviewForbidden");
  if (status === 409) return t("reviewConflict");
  if (status === 429) return t("reviewRateLimited");
  if (status === 400 || status === 422) return t("reviewInvalidDecision");
  if (status >= 500) return t("reviewServiceUnavailable");
  return t(fallback);
}

function SubmissionDetail({ submission, locale, t }: { submission: Submission; locale?: string | null; t: (key: string) => string }) {
  const issues = scheduleIssueCount(submission);
  const planning = submission.planning;
  const planningConflicts = planning ? [...planning.blockingConflicts, ...planning.warningConflicts] : [];
  return (
    <BusinessDetail>
      <BusinessDetailHeader
        eyebrow={t("review")}
        title={submission.employee.fullName}
        summary={`${submission.employee.jobTitle} · ${submission.employee.department}`}
        status={<StatusBadge tone={statusTone(submission.status)}>{statusLabel(t, submission.status)}</StatusBadge>}
      />
      <BusinessDetailSection title={t("weeklySummary")} description={t("reviewSummaryDescription")}>
        <BusinessDetailGrid>
          <BusinessDetailField label={t("period")} value={`${formatDate(submission.periodStart, locale)} → ${formatDate(submission.periodEnd, locale)}`} />
          <BusinessDetailField label={t("declaredTime")} value={formatMinutes(submission.declaredMinutes)} />
          <BusinessDetailField label={t("entries")} value={String(submission.entries.length)} />
          <BusinessDetailField label={t("scheduleIssues")} value={String(issues)} />
        </BusinessDetailGrid>
      </BusinessDetailSection>
      <BusinessDetailSection title={t("planningComparison")} description={t("planningComparisonDescription")}>
        {planning ? (
          <div className="space-y-4">
            <BusinessDetailGrid>
              <BusinessDetailField label={t("scheduleOk")} value={String(planning.entriesWithDeclaredAvailability)} />
              <BusinessDetailField label={t("outsideSchedule")} value={String(planning.entriesOutsideAvailability)} />
              <BusinessDetailField label={t("absenceConflict")} value={String(planning.blockingConflicts.length)} />
              <BusinessDetailField label={t("scheduleWarning")} value={String(planning.warningConflicts.length)} />
            </BusinessDetailGrid>
            {planningConflicts.length ? (
              <BusinessList ariaLabel={t("planningComparison")}>
                {planningConflicts.map((conflict, index) => (
                  <BusinessListItem
                    key={`${conflict.workEntryId}-${conflict.id}-${index}`}
                    title={planning.blockingConflicts.some((item) => item.id === conflict.id && item.workEntryId === conflict.workEntryId) ? t("absenceConflict") : t("scheduleWarning")}
                    meta={`${formatDate(conflict.workDate, locale)} · ${conflict.startTime} → ${conflict.endTime}`}
                    description={conflict.status}
                  />
                ))}
              </BusinessList>
            ) : (
              <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-5 w-5 shrink-0" /> {t("scheduleOk")}
              </div>
            )}
          </div>
        ) : issues ? (
          <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{t("planningIssuesPresent")}</span>
          </div>
        ) : (
          <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" /> {t("scheduleOk")}
          </div>
        )}
      </BusinessDetailSection>
      <BusinessDetailSection title={t("entries")} description={t("entriesDetailDescription")}>
        <BusinessList ariaLabel={t("entries")}>
          {submission.entries.map((entry) => (
            <BusinessListItem
              key={entry.id}
              title={entry.summary}
              meta={`${formatDate(entry.workDate, locale)} · ${entry.startTime} → ${entry.endTime} · ${formatMinutes(entry.workedMinutes)}`}
              description={`${workTypeLabel(t, entry.workType)} · ${entry.locationMode || t("locationUnknown")}${entry.details ? ` · ${entry.details}` : ""}`}
              status={entry.scheduleContext?.blocking.length || entry.scheduleBlockingCount > 0
                ? <StatusBadge tone="danger">{t("absenceConflict")}</StatusBadge>
                : entry.scheduleContext?.outsideAvailability || entry.scheduleOutsideAvailability
                  ? <StatusBadge tone="warning">{t("outsideSchedule")}</StatusBadge>
                  : entry.scheduleContext?.warnings.length || entry.scheduleWarningCount > 0
                    ? <StatusBadge tone="info">{t("scheduleWarning")}</StatusBadge>
                    : <StatusBadge tone="success">{t("scheduleOk")}</StatusBadge>}
            />
          ))}
        </BusinessList>
      </BusinessDetailSection>
      <BusinessDetailSection title={t("reviewHistory")} description={t("reviewHistoryDescription")}>
        {submission.reviews.length ? (
          <BusinessList ariaLabel={t("reviewHistory")}>
            {submission.reviews.map((review) => (
              <BusinessListItem
                key={review.id}
                title={reviewActionLabel(t, review.action)}
                meta={formatDateTime(review.createdAt, locale)}
                description={review.comment || t("noReviewComment")}
              />
            ))}
          </BusinessList>
        ) : <EmptyState compact title={t("noReviewHistory")} description={t("noReviewHistoryDescription")} icon={Clock3} />}
      </BusinessDetailSection>
    </BusinessDetail>
  );
}

function scheduleIssueCount(submission: Submission) {
  return submission.entries.filter((entry) => entry.scheduleOutsideAvailability || entry.scheduleBlockingCount > 0 || entry.scheduleWarningCount > 0).length;
}
function formatMinutes(minutes: number) { const safe = Math.max(0, Math.round(minutes || 0)); const hours = Math.floor(safe / 60); const rest = safe % 60; return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`; }
function formatDate(value: string, locale?: string | null) { return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`)); }
function formatDateTime(value: string, locale?: string | null) { return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function statusTone(status: string): StatusBadgeTone { if (status === "APPROVED") return "success"; if (status === "SUBMITTED") return "info"; if (status === "CHANGES_REQUESTED") return "warning"; if (status === "REJECTED") return "danger"; return "neutral"; }
function statusLabel(t: (key: string) => string, status: string) { return t(`status_${status}`); }
function workTypeLabel(t: (key: string) => string, type: string) { return t(`type_${type}`); }
function reviewActionLabel(t: (key: string) => string, action: string) { return t(`review_${action}`); }
