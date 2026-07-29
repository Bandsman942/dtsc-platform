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
import type { PayrollWorkflowItem } from "@/components/admin/payroll-workflow-types";
import { translate } from "@/lib/i18n";

type Decision = "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

export function PayrollApprovalPanel({ approverRole, locale }: { approverRole: "CEO" | "COO"; locale?: string | null }) {
  const t = useCallback((key: string) => translate(locale, `payrollWorkflow.${key}`), [locale]);
  const endpoint = approverRole === "CEO" ? "/api/admin/ceo/payroll-approvals" : "/api/admin/coo/payroll-approvals";
  const [payrolls, setPayrolls] = useState<PayrollWorkflowItem[]>([]);
  const [selected, setSelected] = useState<PayrollWorkflowItem | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comment, setComment] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("PENDING_APPROVAL");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useToastMessage(message);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { payrolls?: PayrollWorkflowItem[]; message?: string } | null;
    if (response.ok) setPayrolls(body?.payrolls || []);
    else setMessage(body?.message || t("approvalLoadError"));
    setLoading(false);
  }, [endpoint, t]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale === "en" ? "en" : "fr");
    return payrolls.filter((payroll) => {
      if (status !== "ALL" && payroll.status !== status) return false;
      if (!normalized) return true;
      return [payroll.employee.fullName, payroll.employee.jobTitle, payroll.employee.department, payroll.periodStart, payroll.periodEnd]
        .join(" ").toLocaleLowerCase(locale === "en" ? "en" : "fr").includes(normalized);
    });
  }, [locale, payrolls, query, status]);

  async function review() {
    if (!selected || !decision) return;
    setSaving(true);
    const response = await fetch(`${endpoint}/${selected.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: decision, comment }),
    });
    const body = (await response.json().catch(() => null)) as { payroll?: PayrollWorkflowItem; message?: string } | null;
    setSaving(false);
    if (!response.ok) {
      setMessage(body?.message || t("reviewError"));
      return;
    }
    setMessage(decision === "APPROVED" ? t("approved") : decision === "CHANGES_REQUESTED" ? t("changesRequested") : t("rejected"));
    setDecision(null);
    setComment("");
    setSelected(null);
    await load();
  }

  const pending = payrolls.filter((item) => item.status === "PENDING_APPROVAL").length;
  const validated = payrolls.filter((item) => item.status === "VALIDATED" || item.status === "PAID").length;
  const changes = payrolls.filter((item) => item.status === "CHANGES_REQUESTED").length;
  const rejected = payrolls.filter((item) => item.status === "REJECTED").length;

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={approverRole} title={t("approvalTitle")} count={`${filtered.length}/${payrolls.length}`} description={approverRole === "CEO" ? t("approvalDescriptionCeo") : t("approvalDescriptionCoo")} />
    <ModuleMetrics label={t("approvalMetrics")}>
      <ModuleMetric label={t("metricPending")} value={pending} />
      <ModuleMetric label={t("metricValidated")} value={validated} />
      <ModuleMetric label={t("metricChanges")} value={changes} />
      <ModuleMetric label={t("metricRejected")} value={rejected} />
    </ModuleMetrics>
    <ModuleToolbar
      ariaLabel={t("filters")}
      search={<label className="relative block min-w-0"><span className="sr-only">{t("search")}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} className="h-11 rounded-xl bg-dtsc-surface pl-10" /></label>}
      controls={<Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 min-w-[12rem]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t("allStatuses")}</SelectItem>{["PENDING_APPROVAL", "CHANGES_REQUESTED", "VALIDATED", "PAID", "REJECTED"].map((value) => <SelectItem key={value} value={value}>{statusLabel(t, value)}</SelectItem>)}</SelectContent></Select>}
      activeFilters={<span>{status === "ALL" ? t("noActiveFilter") : statusLabel(t, status)}</span>}
      summary={`${filtered.length}/${payrolls.length}`}
    />
    <ModuleContent>
      <ModuleSection title={t("approvalQueue")} description={t("approvalQueueDescription")} count={String(filtered.length)}>
        {loading ? <p className="py-6 text-sm text-dtsc-muted">{t("loading")}</p> : filtered.length ? <BusinessList ariaLabel={t("approvalQueue")}>
          {filtered.map((payroll) => <BusinessListItem
            key={payroll.id}
            title={payroll.employee.fullName}
            meta={`${payroll.employee.jobTitle} · ${formatDate(payroll.periodStart, locale)} → ${formatDate(payroll.periodEnd, locale)}`}
            description={`${t("net")}: ${formatMoney(payroll.netAmount)} · ${t("approvedTime")}: ${formatMinutes(payroll.approvedWorkMinutes || 0)} · ${coverageLabel(t, payroll.workCoverage)}`}
            status={<StatusBadge tone={statusTone(payroll.status)}>{statusLabel(t, payroll.status)}</StatusBadge>}
            onOpen={() => setSelected(payroll)}
            openLabel={`${t("review")} ${payroll.employee.fullName}`}
            actions={<ContextActions label={t("actions")} actions={[{ id: "review", label: t("review"), icon: Eye, onSelect: () => setSelected(payroll) }]} />}
          />)}
        </BusinessList> : <EmptyState compact title={t("approvalEmpty")} description={t("approvalEmptyDescription")} icon={CheckCircle2} />}
      </ModuleSection>
    </ModuleContent>

    <Dialog
      open={Boolean(selected)}
      title={selected ? `${selected.employee.fullName} · ${formatDate(selected.periodStart, locale)} → ${formatDate(selected.periodEnd, locale)}` : t("review")}
      description={t("approvalDetailDescription")}
      onClose={() => { setSelected(null); setDecision(null); setComment(""); }}
      className="h-[94dvh] sm:h-[92dvh]"
      footer={selected?.status === "PENDING_APPROVAL" ? <>
        <Button type="button" variant="outline" onClick={() => setDecision("CHANGES_REQUESTED")} className="rounded-xl border-amber-500/40 text-amber-700"><RotateCcw className="h-4 w-4" />{t("requestChanges")}</Button>
        <Button type="button" variant="outline" onClick={() => setDecision("REJECTED")} className="rounded-xl border-red-500/40 text-red-700"><XCircle className="h-4 w-4" />{t("reject")}</Button>
        <Button type="button" onClick={() => setDecision("APPROVED")} className="rounded-xl bg-dtsc-blue text-white"><CheckCircle2 className="h-4 w-4" />{t("approve")}</Button>
      </> : undefined}
    >
      {selected ? <ApprovalDetail payroll={selected} locale={locale} t={t} /> : null}
    </Dialog>

    <Dialog open={Boolean(decision)} title={decision === "APPROVED" ? t("approveTitle") : decision === "CHANGES_REQUESTED" ? t("changesTitle") : t("rejectTitle")} description={decision === "APPROVED" ? t("approveDescription") : t("reviewReasonDescription")} onClose={() => { setDecision(null); setComment(""); }} footer={<>
      <Button type="button" variant="outline" onClick={() => { setDecision(null); setComment(""); }} className="rounded-xl">{t("close")}</Button>
      <Button type="button" onClick={() => void review()} disabled={saving || ((decision === "CHANGES_REQUESTED" || decision === "REJECTED") && !comment.trim())} className="rounded-xl bg-dtsc-blue text-white">{decision === "APPROVED" ? t("approve") : decision === "CHANGES_REQUESTED" ? t("requestChanges") : t("reject")}</Button>
    </>}>
      {decision === "APPROVED" ? <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="h-5 w-5 shrink-0" />{t("approveFinancialConfirmation")}</div> : <label className="grid gap-2 text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted"><span>{t("comment")}</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1800} rows={6} className="min-h-32 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm normal-case tracking-normal text-dtsc-ink" /></label>}
    </Dialog>
  </ModuleWorkspace>;
}

function ApprovalDetail({ payroll, locale, t }: { payroll: PayrollWorkflowItem; locale?: string | null; t: (key: string) => string }) {
  const incompleteCoverage = payroll.workCoverage !== "COMPLETE";
  return <BusinessDetail>
    <BusinessDetailHeader eyebrow={t("financialApproval")} title={payroll.employee.fullName} summary={`${payroll.employee.jobTitle} · ${payroll.employee.department}`} status={<StatusBadge tone={statusTone(payroll.status)}>{statusLabel(t, payroll.status)}</StatusBadge>} />
    <BusinessDetailSection title={t("financialSummary")} description={t("approvalFinancialDescription")}>
      <BusinessDetailGrid>
        <BusinessDetailField label={t("period")} value={`${formatDate(payroll.periodStart, locale)} → ${formatDate(payroll.periodEnd, locale)}`} />
        <BusinessDetailField label={t("baseSalary")} value={formatMoney(payroll.grossAmount)} />
        <BusinessDetailField label={t("bonus")} value={formatMoney(payroll.bonusAmount)} />
        <BusinessDetailField label={t("deduction")} value={formatMoney(payroll.deductionAmount)} />
        <BusinessDetailField label={t("net")} value={formatMoney(payroll.netAmount)} />
        <BusinessDetailField label={t("budget")} value={payroll.budget?.name || t("notAvailable")} />
        <BusinessDetailField label={t("account")} value={payroll.account?.name || t("notAvailable")} />
        <BusinessDetailField label={t("preparedBy")} value={payroll.preparedBy?.fullName || t("notAvailable")} />
      </BusinessDetailGrid>
      {payroll.bonusReason ? <p className="mt-3 text-sm"><strong>{t("bonusReason")}:</strong> {payroll.bonusReason}</p> : null}
      {payroll.deductionReason ? <p className="mt-2 text-sm"><strong>{t("deductionReason")}:</strong> {payroll.deductionReason}</p> : null}
      {payroll.baseAmountOverrideReason ? <p className="mt-2 text-sm"><strong>{t("baseOverrideReason")}:</strong> {payroll.baseAmountOverrideReason}</p> : null}
    </BusinessDetailSection>
    <BusinessDetailSection title={t("workEvidence")} description={t("approvalEvidenceDescription")}>
      <BusinessDetailGrid>
        <BusinessDetailField label={t("approvedTime")} value={formatMinutes(payroll.approvedWorkMinutes || 0)} />
        <BusinessDetailField label={t("approvedEntries")} value={String(payroll.approvedWorkEntryCount || 0)} />
        <BusinessDetailField label={t("approvedSubmissions")} value={String(payroll.approvedSubmissionCount || 0)} />
        <BusinessDetailField label={t("coverage")} value={coverageLabel(t, payroll.workCoverage)} />
      </BusinessDetailGrid>
      {incompleteCoverage ? <div className="mt-3 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="h-5 w-5 shrink-0" /><span>{payroll.workCoverageExceptionReason || t("coverageExceptionMissing")}</span></div> : null}
      {payroll.workEntries.length ? <BusinessList ariaLabel={t("workEvidence")}>{payroll.workEntries.map((entry) => <BusinessListItem key={entry.id} title={entry.summary} meta={`${formatDate(entry.workDate, locale)} · ${formatMinutes(entry.approvedMinutes)}`} description={workTypeLabel(t, entry.workType)} />)}</BusinessList> : <EmptyState compact title={t("noWorkEvidence")} description={t("noWorkEvidenceDescription")} icon={Clock3} />}
    </BusinessDetailSection>
    <BusinessDetailSection title={t("history")} description={t("historyDescription")}>
      {payroll.reviewHistory.length ? <BusinessList ariaLabel={t("history")}>{payroll.reviewHistory.map((item) => <BusinessListItem key={item.id} title={reviewActionLabel(t, item.action)} meta={`${item.actorName} · ${formatDateTime(item.createdAt, locale)}`} description={item.comment || t("noComment")} />)}</BusinessList> : <EmptyState compact title={t("noHistory")} description={t("noHistoryDescription")} icon={Clock3} />}
    </BusinessDetailSection>
  </BusinessDetail>;
}

function formatMoney(value: number) { return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " USD"; }
function formatMinutes(minutes: number) { const safe = Math.max(0, Math.round(minutes || 0)); const hours = Math.floor(safe / 60); const rest = safe % 60; return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`; }
function formatDate(value: string, locale?: string | null) { return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`)); }
function formatDateTime(value: string, locale?: string | null) { return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function statusTone(status: string): StatusBadgeTone { if (status === "PAID" || status === "VALIDATED") return "success"; if (status === "PENDING_APPROVAL") return "info"; if (status === "CHANGES_REQUESTED") return "warning"; if (status === "REJECTED" || status === "CANCELLED") return "danger"; return "neutral"; }
function statusLabel(t: (key: string) => string, status: string) { return t(`status_${status}`); }
function coverageLabel(t: (key: string) => string, coverage: string | null) { return coverage ? t(`coverage_${coverage}`) : t("coverageLegacy"); }
function workTypeLabel(t: (key: string) => string, workType: string) { return t(`workType_${workType}`); }
function reviewActionLabel(t: (key: string) => string, action: string) { return t(`review_${action}`); }
