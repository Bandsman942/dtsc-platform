"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Banknote, CheckCircle2, Clock3, Eye, FileCheck2, Plus, RefreshCw, Send, UploadCloud, XCircle } from "lucide-react";
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
import type { PayrollBudgetOption, PayrollEmployeeOption, PayrollWorkflowItem } from "@/components/admin/payroll-workflow-types";
import { translate } from "@/lib/i18n";

type WorkspaceResponse = { employees?: PayrollEmployeeOption[]; budgets?: PayrollBudgetOption[]; payrolls?: PayrollWorkflowItem[]; message?: string };
type FormState = {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  budgetId: string;
  baseAmountOverride: string;
  baseAmountOverrideReason: string;
  bonusAmount: string;
  bonusReason: string;
  deductionAmount: string;
  deductionReason: string;
  workCoverageExceptionReason: string;
  adjustmentEvidenceUrl: string;
  notes: string;
};

const emptyForm: FormState = {
  employeeId: "",
  periodStart: "",
  periodEnd: "",
  budgetId: "",
  baseAmountOverride: "",
  baseAmountOverrideReason: "",
  bonusAmount: "0",
  bonusReason: "",
  deductionAmount: "0",
  deductionReason: "",
  workCoverageExceptionReason: "",
  adjustmentEvidenceUrl: "",
  notes: "",
};

export function PayrollWorkflowPanel({ locale }: { locale?: string | null }) {
  const t = useCallback((key: string) => translate(locale, `payrollWorkflow.${key}`), [locale]);
  const [employees, setEmployees] = useState<PayrollEmployeeOption[]>([]);
  const [budgets, setBudgets] = useState<PayrollBudgetOption[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollWorkflowItem[]>([]);
  const [selected, setSelected] = useState<PayrollWorkflowItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PayrollWorkflowItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "warning" | "error">("success");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"SUBMIT" | "PAID" | "CANCEL" | null>(null);
  const [actionText, setActionText] = useState("");
  useToastMessage(message, messageTone);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/hr-cfo/payrolls", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as WorkspaceResponse | null;
    if (response.ok) {
      setEmployees(body?.employees || []);
      setBudgets(body?.budgets || []);
      setPayrolls(body?.payrolls || []);
    } else {
      setMessageTone("error");
      setMessage(body?.message || t("loadError"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale === "en" ? "en" : "fr");
    return payrolls.filter((payroll) => {
      if (status !== "ALL" && payroll.status !== status) return false;
      if (!normalized) return true;
      return [payroll.employee.fullName, payroll.employee.jobTitle, payroll.employee.department, payroll.periodStart, payroll.periodEnd, payroll.status]
        .join(" ").toLocaleLowerCase(locale === "en" ? "en" : "fr").includes(normalized);
    });
  }, [locale, payrolls, query, status]);

  const metrics = useMemo(() => ({
    draft: payrolls.filter((item) => item.status === "DRAFT" || item.status === "CHANGES_REQUESTED").length,
    pending: payrolls.filter((item) => item.status === "PENDING_APPROVAL").length,
    validated: payrolls.filter((item) => item.status === "VALIDATED").length,
    paid: payrolls.filter((item) => item.status === "PAID").length,
  }), [payrolls]);

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(payroll: PayrollWorkflowItem) {
    setEditTarget(payroll);
    setForm({
      employeeId: payroll.employeeId,
      periodStart: payroll.periodStart,
      periodEnd: payroll.periodEnd,
      budgetId: payroll.budget?.id || "",
      baseAmountOverride: payroll.baseAmountOverride == null ? "" : String(payroll.baseAmountOverride),
      baseAmountOverrideReason: payroll.baseAmountOverrideReason || "",
      bonusAmount: String(payroll.bonusAmount || 0),
      bonusReason: payroll.bonusReason || "",
      deductionAmount: String(payroll.deductionAmount || 0),
      deductionReason: payroll.deductionReason || "",
      workCoverageExceptionReason: payroll.workCoverageExceptionReason || "",
      adjustmentEvidenceUrl: payroll.adjustmentEvidenceUrl || "",
      notes: payroll.notes || "",
    });
    setFormOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      ...(editTarget ? {} : { employeeId: form.employeeId, periodStart: form.periodStart, periodEnd: form.periodEnd }),
      budgetId: form.budgetId,
      baseAmountOverride: form.baseAmountOverride || undefined,
      baseAmountOverrideReason: form.baseAmountOverrideReason,
      bonusAmount: form.bonusAmount || 0,
      bonusReason: form.bonusReason,
      deductionAmount: form.deductionAmount || 0,
      deductionReason: form.deductionReason,
      workCoverageExceptionReason: form.workCoverageExceptionReason,
      adjustmentEvidenceUrl: form.adjustmentEvidenceUrl,
      notes: form.notes,
    };
    const response = await fetch(editTarget ? `/api/admin/hr-cfo/payrolls/${editTarget.id}` : "/api/admin/hr-cfo/payrolls", {
      method: editTarget ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { payroll?: PayrollWorkflowItem; message?: string } | null;
    setSaving(false);
    if (!response.ok) {
      setMessageTone("error");
      setMessage(body?.message || t("saveError"));
      return;
    }
    setMessageTone("success");
    setMessage(editTarget ? t("updated") : t("prepared"));
    setFormOpen(false);
    setEditTarget(null);
    setSelected(null);
    await load();
  }

  async function uploadEvidence(file: File) {
    const data = new FormData();
    data.set("file", file);
    const response = await fetch("/api/admin/operation-files", { method: "POST", body: data });
    const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response.ok || !body?.url) {
      setMessageTone("error");
      setMessage(body?.error || t("uploadError"));
      return;
    }
    setForm((current) => ({ ...current, adjustmentEvidenceUrl: body.url || "" }));
    setMessageTone("success");
    setMessage(t("uploadDone"));
  }

  async function executeAction() {
    if (!selected || !confirmAction) return;
    setSaving(true);
    const endpoint = confirmAction === "SUBMIT"
      ? `/api/admin/hr-cfo/payrolls/${selected.id}/submit`
      : confirmAction === "PAID"
        ? `/api/admin/hr-cfo/payrolls/${selected.id}/mark-paid`
        : `/api/admin/hr-cfo/payrolls/${selected.id}/cancel`;
    const payload = confirmAction === "PAID" ? { paymentReference: actionText } : confirmAction === "CANCEL" ? { reason: actionText } : {};
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { payroll?: PayrollWorkflowItem; message?: string } | null;
    setSaving(false);
    if (!response.ok) {
      const errorMessage = body?.message || t("actionError");
      setMessageTone("error");
      setMessage(errorMessage);
      setActionError(errorMessage);
      return;
    }
    setMessageTone("success");
    setActionError("");
    setMessage(confirmAction === "SUBMIT" ? t("submitted") : confirmAction === "PAID" ? t("markedPaid") : t("cancelled"));
    setConfirmAction(null);
    setActionText("");
    setSelected(null);
    await load();
  }

  const selectedEmployee = employees.find((employee) => employee.id === form.employeeId);
  const selectedBudget = budgets.find((budget) => budget.id === form.budgetId);
  const fullMonth = isFullMonth(form.periodStart, form.periodEnd);
  const needsOverride = Boolean(form.periodStart && form.periodEnd && (!fullMonth || selectedEmployee?.monthlyCompensation == null));

  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow="HR & CFO" title={t("hrTitle")} count={`${filtered.length}/${payrolls.length}`} description={t("hrDescription")} />
      <ModuleMetrics label={t("metrics")}>
        <ModuleMetric label={t("metricDraft")} value={metrics.draft} />
        <ModuleMetric label={t("metricPending")} value={metrics.pending} />
        <ModuleMetric label={t("metricValidated")} value={metrics.validated} />
        <ModuleMetric label={t("metricPaid")} value={metrics.paid} />
      </ModuleMetrics>
      <ModuleToolbar
        ariaLabel={t("filters")}
        search={<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} className="h-11 min-w-0 rounded-xl bg-dtsc-surface" />}
        controls={<div className="flex min-w-0 flex-1 flex-wrap gap-2 sm:flex-none">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-11 min-w-[11rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allStatuses")}</SelectItem>
              {["DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED", "VALIDATED", "REJECTED", "PAID", "CANCELLED"].map((value) => <SelectItem key={value} value={value}>{statusLabel(t, value)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" onClick={openCreate} className="h-11 rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("prepare")}</Button>
        </div>}
        activeFilters={<span>{status === "ALL" ? t("noActiveFilter") : statusLabel(t, status)}</span>}
        summary={`${filtered.length}/${payrolls.length}`}
      />
      <ModuleContent>
        <ModuleSection title={t("payrollList")} description={t("payrollListDescription")} count={String(filtered.length)}>
          {loading ? <p className="py-6 text-sm text-dtsc-muted">{t("loading")}</p> : filtered.length ? (
            <BusinessList ariaLabel={t("payrollList")}>
              {filtered.map((payroll) => (
                <BusinessListItem
                  key={payroll.id}
                  title={payroll.employee.fullName}
                  meta={`${payroll.employee.jobTitle} · ${formatDate(payroll.periodStart, locale)} → ${formatDate(payroll.periodEnd, locale)}`}
                  description={`${t("net")}: ${formatMoney(payroll.netAmount)} · ${t("approvedTime")}: ${formatMinutes(payroll.approvedWorkMinutes || 0)} · ${coverageLabel(t, payroll.workCoverage)}`}
                  status={<StatusBadge tone={statusTone(payroll.status)}>{payroll.isLegacy ? t("legacy") : statusLabel(t, payroll.status)}</StatusBadge>}
                  onOpen={() => setSelected(payroll)}
                  openLabel={`${t("open")} ${payroll.employee.fullName}`}
                  actions={<ContextActions label={t("actions")} actions={[
                    { id: "open", label: t("open"), icon: Eye, onSelect: () => setSelected(payroll) },
                    ...(!payroll.isLegacy && (payroll.status === "DRAFT" || payroll.status === "CHANGES_REQUESTED") ? [{ id: "edit", label: t("edit"), icon: RefreshCw, onSelect: () => openEdit(payroll) }] : []),
                  ]} />}
                />
              ))}
            </BusinessList>
          ) : <EmptyState compact title={t("emptyTitle")} description={t("emptyDescription")} icon={Banknote} />}
        </ModuleSection>
      </ModuleContent>

      <Dialog open={formOpen} title={editTarget ? t("editTitle") : t("prepareTitle")} description={t("prepareDescription")} onClose={() => { setFormOpen(false); setEditTarget(null); }} className="h-[94dvh] sm:h-[92dvh]">
        <form className="grid gap-4 pb-4" onSubmit={save}>
          {!editTarget ? <>
            <FieldLabel label={t("employee")}>
              <Select value={form.employeeId} onValueChange={(value) => setForm((current) => ({ ...current, employeeId: value }))}>
                <SelectTrigger className="h-11"><SelectValue placeholder={t("employeePlaceholder")} /></SelectTrigger>
                <SelectContent>{employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.fullName} · {employee.jobTitle}</SelectItem>)}</SelectContent>
              </Select>
            </FieldLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldLabel label={t("periodStart")}><Input type="date" required value={form.periodStart} onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))} /></FieldLabel>
              <FieldLabel label={t("periodEnd")}><Input type="date" required value={form.periodEnd} onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value }))} /></FieldLabel>
            </div>
          </> : null}
          <FieldLabel label={t("budget")}>
            <Select value={form.budgetId} onValueChange={(value) => setForm((current) => ({ ...current, budgetId: value }))}>
              <SelectTrigger className="h-11"><SelectValue placeholder={t("budgetPlaceholder")} /></SelectTrigger>
              <SelectContent>{budgets.map((budget) => <SelectItem key={budget.id} value={budget.id}>{budget.name} · {budget.accountName || t("accountMissing")}</SelectItem>)}</SelectContent>
            </Select>
          </FieldLabel>
          {selectedBudget ? <p className="text-xs text-dtsc-muted">{t("budgetAccount")}: {selectedBudget.accountName || t("accountMissing")}</p> : null}
          {selectedEmployee && !needsOverride ? <div className="rounded-xl border border-dtsc-border bg-dtsc-soft p-3 text-sm"><strong>{t("baseSalary")}:</strong> {formatMoney(selectedEmployee.monthlyCompensation || 0)} · {t("fromHrRecord")}</div> : null}
          {needsOverride || editTarget?.baseAmountSource === "EXPLICIT_OVERRIDE" ? <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label={t("baseOverride")}><Input type="number" min="0" step="0.01" value={form.baseAmountOverride} onChange={(event) => setForm((current) => ({ ...current, baseAmountOverride: event.target.value }))} /></FieldLabel>
            <FieldLabel label={t("baseOverrideReason")}><Input value={form.baseAmountOverrideReason} onChange={(event) => setForm((current) => ({ ...current, baseAmountOverrideReason: event.target.value }))} /></FieldLabel>
          </div> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label={t("bonus")}><Input type="number" min="0" step="0.01" value={form.bonusAmount} onChange={(event) => setForm((current) => ({ ...current, bonusAmount: event.target.value }))} /></FieldLabel>
            <FieldLabel label={t("bonusReason")}><Input value={form.bonusReason} onChange={(event) => setForm((current) => ({ ...current, bonusReason: event.target.value }))} /></FieldLabel>
            <FieldLabel label={t("deduction")}><Input type="number" min="0" step="0.01" value={form.deductionAmount} onChange={(event) => setForm((current) => ({ ...current, deductionAmount: event.target.value }))} /></FieldLabel>
            <FieldLabel label={t("deductionReason")}><Input value={form.deductionReason} onChange={(event) => setForm((current) => ({ ...current, deductionReason: event.target.value }))} /></FieldLabel>
          </div>
          <FieldLabel label={t("coverageException")}><textarea rows={3} value={form.workCoverageExceptionReason} onChange={(event) => setForm((current) => ({ ...current, workCoverageExceptionReason: event.target.value }))} className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm" /></FieldLabel>
          <FieldLabel label={t("adjustmentEvidence")}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-dtsc-border bg-dtsc-soft px-3 py-2 text-sm font-bold text-dtsc-blue">
              <UploadCloud className="h-4 w-4" />{form.adjustmentEvidenceUrl ? t("replaceEvidence") : t("uploadEvidence")}
              <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(file); }} />
            </label>
          </FieldLabel>
          <FieldLabel label={t("notes")}><textarea rows={4} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm" /></FieldLabel>
          <Button type="submit" disabled={saving || (!editTarget && (!form.employeeId || !form.periodStart || !form.periodEnd)) || !form.budgetId} className="rounded-xl bg-dtsc-blue text-white">{saving ? t("saving") : editTarget ? t("save") : t("prepare")}</Button>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(selected)}
        title={selected ? `${selected.employee.fullName} · ${formatDate(selected.periodStart, locale)} → ${formatDate(selected.periodEnd, locale)}` : t("detailTitle")}
        description={t("detailDescription")}
        onClose={() => { setSelected(null); setConfirmAction(null); setActionText(""); }}
        className="h-[94dvh] sm:h-[92dvh]"
        footer={selected && !selected.isLegacy ? <>
          {(selected.status === "DRAFT" || selected.status === "CHANGES_REQUESTED") ? <Button type="button" disabled={selected.submissionReadiness?.ready === false} title={selected.submissionReadiness?.blockers[0]?.message} onClick={() => { setActionError(""); setConfirmAction("SUBMIT"); }} className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" />{t("submit")}</Button> : null}
          {selected.status === "DRAFT" ? <Button type="button" variant="outline" onClick={() => { setActionError(""); setConfirmAction("CANCEL"); }} className="rounded-xl border-red-500/40 text-red-700"><XCircle className="h-4 w-4" />{t("cancelPayroll")}</Button> : null}
          {selected.status === "VALIDATED" ? <Button type="button" onClick={() => { setActionError(""); setConfirmAction("PAID"); }} className="rounded-xl bg-emerald-700 text-white"><CheckCircle2 className="h-4 w-4" />{t("markPaid")}</Button> : null}
        </> : undefined}
      >
        {selected ? <PayrollDetail payroll={selected} locale={locale} t={t} /> : null}
      </Dialog>

      <Dialog open={Boolean(confirmAction)} title={confirmAction === "SUBMIT" ? t("submitTitle") : confirmAction === "PAID" ? t("paidTitle") : t("cancelTitle")} description={confirmAction === "SUBMIT" ? t("submitConfirm") : confirmAction === "PAID" ? t("paidConfirm") : t("cancelConfirm")} onClose={() => { setConfirmAction(null); setActionText(""); setActionError(""); }} footer={<>
        <Button type="button" variant="outline" onClick={() => { setConfirmAction(null); setActionText(""); }} className="rounded-xl">{t("close")}</Button>
        <Button type="button" onClick={() => void executeAction()} disabled={saving || (confirmAction === "CANCEL" && actionText.trim().length < 3)} className="rounded-xl bg-dtsc-blue text-white">{t("confirm")}</Button>
      </>}>
        {actionError ? <div role="alert" className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-sm font-semibold text-red-700">{actionError}</div> : null}
        {confirmAction === "CANCEL" || confirmAction === "PAID" ? <FieldLabel label={confirmAction === "CANCEL" ? t("cancelReason") : t("paymentReference")}><Input value={actionText} onChange={(event) => setActionText(event.target.value)} /></FieldLabel> : <div className="flex gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-sm"><FileCheck2 className="h-5 w-5 shrink-0" />{t("submitEvidenceFrozen")}</div>}
      </Dialog>
    </ModuleWorkspace>
  );
}

function PayrollDetail({ payroll, locale, t }: { payroll: PayrollWorkflowItem; locale?: string | null; t: (key: string) => string }) {
  return <BusinessDetail>
    <BusinessDetailHeader eyebrow={payroll.isLegacy ? t("legacy") : t("payroll")} title={payroll.employee.fullName} summary={`${payroll.employee.jobTitle} · ${payroll.employee.department}`} status={<StatusBadge tone={statusTone(payroll.status)}>{payroll.isLegacy ? t("legacy") : statusLabel(t, payroll.status)}</StatusBadge>} />
    <BusinessDetailSection title={t("financialSummary")} description={t("financialSummaryDescription")}>
      <BusinessDetailGrid>
        <BusinessDetailField label={t("period")} value={`${formatDate(payroll.periodStart, locale)} → ${formatDate(payroll.periodEnd, locale)}`} />
        <BusinessDetailField label={t("baseSalary")} value={formatMoney(payroll.grossAmount)} />
        <BusinessDetailField label={t("bonus")} value={formatMoney(payroll.bonusAmount)} />
        <BusinessDetailField label={t("deduction")} value={formatMoney(payroll.deductionAmount)} />
        <BusinessDetailField label={t("net")} value={formatMoney(payroll.netAmount)} />
        <BusinessDetailField label={t("budget")} value={payroll.budget?.name || t("notAvailable")} />
        <BusinessDetailField label={t("account")} value={payroll.account?.name || t("notAvailable")} />
        <BusinessDetailField label={t("approver")} value={payroll.approver?.fullName || payroll.requiredApproverCode || t("notAvailable")} />
      </BusinessDetailGrid>
      {payroll.bonusReason ? <p className="mt-3 text-sm"><strong>{t("bonusReason")}:</strong> {payroll.bonusReason}</p> : null}
      {payroll.deductionReason ? <p className="mt-2 text-sm"><strong>{t("deductionReason")}:</strong> {payroll.deductionReason}</p> : null}
      {payroll.baseAmountOverrideReason ? <p className="mt-2 text-sm"><strong>{t("baseOverrideReason")}:</strong> {payroll.baseAmountOverrideReason}</p> : null}
      {payroll.adjustmentEvidenceUrl ? <a href={payroll.adjustmentEvidenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-bold text-dtsc-blue underline underline-offset-4">{t("openAdjustmentEvidence")}</a> : null}
    </BusinessDetailSection>
    <BusinessDetailSection title={t("workEvidence")} description={t("workEvidenceDescription")}>
      <BusinessDetailGrid>
        <BusinessDetailField label={t("approvedTime")} value={formatMinutes(payroll.approvedWorkMinutes || 0)} />
        <BusinessDetailField label={t("approvedEntries")} value={String(payroll.approvedWorkEntryCount || 0)} />
        <BusinessDetailField label={t("approvedSubmissions")} value={String(payroll.approvedSubmissionCount || 0)} />
        <BusinessDetailField label={t("coverage")} value={coverageLabel(t, payroll.workCoverage)} />
      </BusinessDetailGrid>
      {payroll.workCoverageExceptionReason ? <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><strong>{t("coverageException")}:</strong> {payroll.workCoverageExceptionReason}</p> : null}
      {payroll.workEntries.length ? <BusinessList ariaLabel={t("workEvidence")}>
        {payroll.workEntries.map((entry) => <BusinessListItem key={entry.id} title={entry.summary} meta={`${formatDate(entry.workDate, locale)} · ${formatMinutes(entry.approvedMinutes)}`} description={workTypeLabel(t, entry.workType)} />)}
      </BusinessList> : <EmptyState compact title={t("noWorkEvidence")} description={t("noWorkEvidenceDescription")} icon={Clock3} />}
    </BusinessDetailSection>
    {(payroll.status === "DRAFT" || payroll.status === "CHANGES_REQUESTED") && payroll.submissionReadiness ? <BusinessDetailSection title={t("submissionReadiness")} description={t("submissionReadinessDescription")}>
      <BusinessDetailGrid>
        <BusinessDetailField label={t("submissionState")} value={payroll.submissionReadiness.ready ? t("submissionReady") : t("submissionBlocked")} />
        <BusinessDetailField label={t("requiredApprover")} value={payroll.submissionReadiness.approverName ? `${payroll.submissionReadiness.requiredApproverCode} · ${payroll.submissionReadiness.approverName}` : payroll.submissionReadiness.requiredApproverCode} />
      </BusinessDetailGrid>
      {payroll.submissionReadiness.blockers.length ? <div role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800">
        <p className="font-black">{t("submissionBlockers")}</p>
        <div className="mt-2 grid gap-1">{payroll.submissionReadiness.blockers.map((blocker) => <p key={blocker.code}>• {blocker.message}</p>)}</div>
      </div> : <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-800">{t("submissionReadyHelp")}</p>}
    </BusinessDetailSection> : null}
    <BusinessDetailSection title={t("history")} description={t("historyDescription")}>
      {payroll.reviewHistory.length ? <BusinessList ariaLabel={t("history")}>{payroll.reviewHistory.map((item) => <BusinessListItem key={item.id} title={reviewActionLabel(t, item.action)} meta={`${item.actorName} · ${formatDateTime(item.createdAt, locale)}`} description={item.comment || t("noComment")} />)}</BusinessList> : <EmptyState compact title={t("noHistory")} description={t("noHistoryDescription")} icon={Clock3} />}
    </BusinessDetailSection>
  </BusinessDetail>;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted"><span>{label}</span>{children}</label>; }
function formatMoney(value: number) { return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " USD"; }
function formatMinutes(minutes: number) { const safe = Math.max(0, Math.round(minutes || 0)); const hours = Math.floor(safe / 60); const rest = safe % 60; return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`; }
function formatDate(value: string, locale?: string | null) { return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`)); }
function formatDateTime(value: string, locale?: string | null) { return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function statusTone(status: string): StatusBadgeTone { if (status === "PAID" || status === "VALIDATED") return "success"; if (status === "PENDING_APPROVAL") return "info"; if (status === "CHANGES_REQUESTED") return "warning"; if (status === "REJECTED" || status === "CANCELLED" || status === "CANCELED") return "danger"; return "neutral"; }
function statusLabel(t: (key: string) => string, status: string) { return t(`status_${status}`); }
function coverageLabel(t: (key: string) => string, coverage: string | null) { return coverage ? t(`coverage_${coverage}`) : t("coverageLegacy"); }
function workTypeLabel(t: (key: string) => string, workType: string) { return t(`workType_${workType}`); }
function reviewActionLabel(t: (key: string) => string, action: string) { return t(`review_${action}`); }
function isFullMonth(start: string, end: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false; const startDate = new Date(`${start}T00:00:00.000Z`); const endDate = new Date(`${end}T00:00:00.000Z`); return startDate.getUTCDate() === 1 && startDate.getUTCFullYear() === endDate.getUTCFullYear() && startDate.getUTCMonth() === endDate.getUTCMonth() && endDate.getUTCDate() === new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0)).getUTCDate(); }
