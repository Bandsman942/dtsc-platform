"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Eye, RotateCcw, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessDetail, BusinessDetailField, BusinessDetailGrid, BusinessDetailHeader, BusinessDetailSection } from "@/components/workspace/business-detail";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
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

export function WorkSubmissionReviewPanel({ reviewerRole, locale }: { reviewerRole: "COO" | "CEO"; locale?: string | null }) {
  const t = useCallback((key: string) => translate(locale, `workPrestations.${key}`), [locale]);
  const endpoint = reviewerRole === "COO" ? "/api/admin/coo/work-submissions" : "/api/admin/ceo/work-submissions";
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useToastMessage(message);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { submissions?: Submission[]; message?: string } | null;
    if (response.ok) setSubmissions(body?.submissions || []);
    else setMessage(body?.message || t("reviewLoadError"));
    setLoading(false);
  }, [endpoint, t]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale === "en" ? "en" : "fr");
    return submissions.filter((submission) => {
      if (status !== "ALL" && submission.status !== status) return false;
      if (!normalizedQuery) return true;
      const haystack = [submission.employee.fullName, submission.employee.jobTitle, submission.employee.department, submission.periodStart, submission.periodEnd, submission.status].join(" ").toLocaleLowerCase(locale === "en" ? "en" : "fr");
      return haystack.includes(normalizedQuery);
    });
  }, [locale, query, status, submissions]);

  const pendingCount = submissions.filter((item) => item.status === "SUBMITTED").length;
  const changesCount = submissions.filter((item) => item.status === "CHANGES_REQUESTED").length;
  const approvedCount = submissions.filter((item) => item.status === "APPROVED").length;
  const rejectedCount = submissions.filter((item) => item.status === "REJECTED").length;

  const openSubmission = useCallback(async (submission: Submission) => {
    setSelected(submission);
    setDetailLoading(true);
    const response = await fetch(`${endpoint}/${submission.id}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { submission?: Submission; message?: string } | null;
    if (response.ok && body?.submission) setSelected(body.submission);
    else setMessage(body?.message || t("reviewLoadError"));
    setDetailLoading(false);
  }, [endpoint, t]);

  async function review() {
    if (!selected || !decision) return;
    setSaving(true);
    const response = await fetch(`${endpoint}/${selected.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: decision, comment }),
    });
    const body = (await response.json().catch(() => null)) as { submission?: Submission; message?: string } | null;
    if (response.ok) {
      setMessage(decision === "APPROVED" ? t("approved") : decision === "CHANGES_REQUESTED" ? t("changesRequested") : t("rejected"));
      setDecision(null);
      setComment("");
      setSelected(null);
      await load();
    } else {
      setMessage(body?.message || t("reviewError"));
    }
    setSaving(false);
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={reviewerRole === "COO" ? "COO" : "CEO"}
        title={t("reviewTitle")}
        count={`${filtered.length}/${submissions.length}`}
        description={reviewerRole === "COO" ? t("reviewDescriptionCoo") : t("reviewDescriptionCeo")}
      />
      <ModuleMetrics label={t("reviewMetrics")}>
        <ModuleMetric label={t("queueSubmitted")} value={pendingCount} />
        <ModuleMetric label={t("queueChanges")} value={changesCount} />
        <ModuleMetric label={t("queueApproved")} value={approvedCount} />
        <ModuleMetric label={t("queueRejected")} value={rejectedCount} />
      </ModuleMetrics>
      <ModuleToolbar
        ariaLabel={t("reviewFilters")}
        search={(
          <label className="relative block min-w-0">
            <span className="sr-only">{t("search")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" aria-hidden="true" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} className="h-11 w-full min-w-0 rounded-xl bg-dtsc-surface pl-10" />
          </label>
        )}
        controls={(
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full min-w-[12rem] sm:w-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allStatuses")}</SelectItem>
              <SelectItem value="SUBMITTED">{statusLabel(t, "SUBMITTED")}</SelectItem>
              <SelectItem value="CHANGES_REQUESTED">{statusLabel(t, "CHANGES_REQUESTED")}</SelectItem>
              <SelectItem value="APPROVED">{statusLabel(t, "APPROVED")}</SelectItem>
              <SelectItem value="REJECTED">{statusLabel(t, "REJECTED")}</SelectItem>
            </SelectContent>
          </Select>
        )}
        activeFilters={<span>{status === "ALL" ? t("noActiveFilter") : statusLabel(t, status)}</span>}
        summary={`${filtered.length}/${submissions.length}`}
      />
      <ModuleContent>
        <ModuleSection title={t("reviewQueue")} description={t("reviewQueueDescription")} count={String(filtered.length)}>
          {loading ? <p className="py-6 text-sm text-dtsc-muted">{t("loading")}</p> : filtered.length ? (
            <BusinessList ariaLabel={t("reviewQueue")}>
              {filtered.map((submission) => (
                <BusinessListItem
                  key={submission.id}
                  title={submission.employee.fullName}
                  meta={`${submission.employee.jobTitle} · ${submission.employee.department} · ${formatDate(submission.periodStart, locale)} → ${formatDate(submission.periodEnd, locale)}`}
                  description={`${t("declaredTime")}: ${formatMinutes(submission.declaredMinutes)} · ${t("entries")}: ${submission.entries.length}${scheduleIssueCount(submission) ? ` · ${t("scheduleIssues")}: ${scheduleIssueCount(submission)}` : ""}`}
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
        </ModuleSection>
      </ModuleContent>

      <Dialog
        open={Boolean(selected)}
        title={selected ? `${selected.employee.fullName} · ${formatDate(selected.periodStart, locale)} → ${formatDate(selected.periodEnd, locale)}` : t("review")}
        description={t("reviewDetailDescription")}
        onClose={() => { setSelected(null); setDecision(null); setComment(""); }}
        className="h-[94dvh] sm:h-[92dvh]"
        footer={selected?.status === "SUBMITTED" && !detailLoading ? (
          <>
            <Button type="button" variant="outline" onClick={() => setDecision("CHANGES_REQUESTED")} className="rounded-xl border-amber-500/40 text-amber-700 dark:text-amber-300"><RotateCcw className="h-4 w-4" /> {t("requestChanges")}</Button>
            <Button type="button" variant="outline" onClick={() => setDecision("REJECTED")} className="rounded-xl border-red-500/40 text-red-700 dark:text-red-300"><XCircle className="h-4 w-4" /> {t("reject")}</Button>
            <Button type="button" onClick={() => setDecision("APPROVED")} className="rounded-xl bg-dtsc-blue text-white"><CheckCircle2 className="h-4 w-4" /> {t("approve")}</Button>
          </>
        ) : undefined}
      >
        {detailLoading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("loading")}</p> : selected ? <SubmissionDetail submission={selected} locale={locale} t={t} /> : null}
      </Dialog>

      <Dialog
        open={Boolean(decision)}
        title={decision === "APPROVED" ? t("approveTitle") : decision === "CHANGES_REQUESTED" ? t("changesTitle") : t("rejectTitle")}
        description={decision === "APPROVED" ? t("approveDescription") : t("reviewReasonDescription")}
        onClose={() => { setDecision(null); setComment(""); }}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => { setDecision(null); setComment(""); }} className="rounded-xl">{t("cancel")}</Button>
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
