"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, CheckCircle2, Eye, FileText, Plus, Send, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpMoney,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { ProfessionalReportView } from "@/components/reports/professional-report-view";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { buildPayrollProfessionalReport } from "@/lib/reporting/payroll-professional-report";

type Employee = { id: string; employeeNumber: string; displayName: string };
type Member = { id: string; label: string; role: string; positionTitle: string | null };
type PayrollPeriodLookup = { id: string; code: string; name: string; status: string; periodStart: string; periodEnd: string; payDate: string | null };
type Lookups = { employees: Employee[]; members: Member[]; payrollPeriods: PayrollPeriodLookup[] };
type PayrollPeriod = PayrollPeriodLookup & { revision: number; _count: { payrollRuns: number } };
type PayrollItem = { id: string; employeeId: string; baseGrossAmount: string | number; approvedTimeMinutes: number | null; bonusAmount: string | number; bonusReason: string | null; deductionAmount: string | number; deductionReason: string | null; grossAmount: string | number; netAmount: string | number; status: string; employee: Employee; payslip: { id: string; payslipNumber: string; status: string; generatedAt: string | null; netAmount: string | number; currency: string } | null };
type PayrollRun = { id: string; payrollPeriodId: string; reference: string; status: string; currency: string; employeeCount: number; grossAmount: string | number; bonusAmount: string | number; deductionAmount: string | number; netAmount: string | number; preparedByUserId: string; submittedByUserId: string | null; approverUserId: string | null; revision: number; payrollPeriod: PayrollPeriodLookup; items: PayrollItem[] };

const PAYROLL_STATUSES = ["OPEN", "CLOSED", "PREPARED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED", "GENERATED"];
function statusTone(status: string) { if (["APPROVED", "GENERATED", "CLOSED"].includes(status)) return "success" as const; if (["PREPARED", "PENDING_APPROVAL", "OPEN"].includes(status)) return "warning" as const; if (["REJECTED", "CANCELLED"].includes(status)) return "danger" as const; return "neutral" as const; }

export function EnterprisePayrollOperationsWorkspace({ organizationId, organizationName, organizationLogoUrl, definition }: { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; locale?: string | null; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const suffix = (count: number) => count === 1 ? "" : "s";
  const memberLabel = (member: Member) => member.positionTitle ? `${member.label} · ${member.positionTitle}` : member.label;
  const minutesLabel = (value: number | null) => !value ? t("payroll.noApprovedTime") : t("payroll.approvedMinutes", { hours: Math.floor(value / 60), minutes: (value % 60).toString().padStart(2, "0") });
  const [tab, setTab] = useState("RUNS");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], members: [], payrollPeriods: [] });
  const [periodOpen, setPeriodOpen] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [detail, setDetail] = useState<PayrollRun | null>(null);
  const [submitTarget, setSubmitTarget] = useState<PayrollRun | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/operational-lookups?module=PAYROLL_OPERATIONS`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json().catch(() => null) as Lookups & { message?: string } | null; if (!response.ok || !body) throw new Error(body?.message || professionalErpT(locale, "payroll.dataUnavailable")); if (active) setLookups({ employees: body.employees || [], members: body.members || [], payrollPeriods: body.payrollPeriods || [] }); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : professionalErpT(locale, "payroll.dataUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (status) value.set("status", status); return value; }, [page, status]);
  const periods = useProfessionalCollection<PayrollPeriod>({ endpoint: `/api/enterprise/${organizationId}/payroll-periods`, params, refreshKey });
  const runs = useProfessionalCollection<PayrollRun>({ endpoint: `/api/enterprise/${organizationId}/payroll-runs`, params, refreshKey });
  const activeCollection = tab === "RUNS" ? runs : periods;
  const previousPayrollRun = useMemo(() => { if (!detail) return null; const currentStart = Date.parse(detail.payrollPeriod.periodStart); return runs.items.filter((run) => run.id !== detail.id && run.currency === detail.currency && Date.parse(run.payrollPeriod.periodStart) < currentStart).sort((left, right) => Date.parse(right.payrollPeriod.periodStart) - Date.parse(left.payrollPeriod.periodStart))[0] || null; }, [detail, runs.items]);
  const payrollReportModel = useMemo(() => detail ? buildPayrollProfessionalReport({ organizationName, locale, run: detail, previousRun: previousPayrollRun }) : null, [detail, locale, organizationName, previousPayrollRun]);

  async function createPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-periods`, { code: String(form.get("code") || ""), name: String(form.get("name") || ""), periodStart: String(form.get("periodStart") || ""), periodEnd: String(form.get("periodEnd") || ""), payDate: String(form.get("payDate") || "") || null }); setPeriodOpen(false); setTab("PERIODS"); setRefreshKey((value) => value + 1); setMessage(t("payroll.periodOpened")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("payroll.periodCreateFailed")); }
  }

  async function prepareRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-runs`, { payrollPeriodId: String(form.get("payrollPeriodId") || ""), currency: String(form.get("currency") || "USD"), employeeIds: selectedEmployees, adjustments: selectedEmployees.map((employeeId) => ({ employeeId, bonusAmount: Number(form.get(`bonus_${employeeId}`) || 0), bonusReason: String(form.get(`bonusReason_${employeeId}`) || "") || null, deductionAmount: Number(form.get(`deduction_${employeeId}`) || 0), deductionReason: String(form.get(`deductionReason_${employeeId}`) || "") || null })) }); setPrepareOpen(false); setSelectedEmployees([]); setTab("RUNS"); setRefreshKey((value) => value + 1); setMessage(t("payroll.runPrepared")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("payroll.runPrepareFailed")); }
  }

  async function submitRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitTarget) return;
    const form = new FormData(event.currentTarget);
    const approverUserId = String(form.get("approverUserId") || "");
    if (!approverUserId) return;
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-runs/${submitTarget.id}/submit`, { approverUserId, revision: submitTarget.revision }); setSubmitTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("payroll.runSubmitted")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("payroll.runSubmitFailed")); }
  }

  async function decide(run: PayrollRun, decision: "APPROVE" | "REJECT") {
    const comment = decision === "REJECT" ? window.prompt(t("payroll.rejectPrompt")) || "Paie rejetée" : "Paie contrôlée";
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-runs/${run.id}/decision`, { decision, revision: run.revision, comment }); setDetail(null); setRefreshKey((value) => value + 1); setMessage(decision === "APPROVE" ? t("payroll.runApproved") : t("payroll.runRejected")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("payroll.decisionFailed")); }
  }

  async function cancel(run: PayrollRun) {
    const reason = window.prompt(t("payroll.cancelPrompt")); if (!reason || reason.trim().length < 3) return;
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-runs/${run.id}/cancel`, { revision: run.revision, reason }); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("payroll.runCancelled")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("payroll.cancelFailed")); }
  }

  function actionsFor(run: PayrollRun): BusinessContextAction[] { return [{ id: "open", label: t("people.open"), icon: Eye, onSelect: () => setDetail(run) }, ...(run.status === "PREPARED" ? [{ id: "submit", label: t("payroll.submit"), icon: Send, onSelect: () => setSubmitTarget(run) }, { id: "cancel", label: t("payroll.cancel"), icon: Ban, destructive: true, onSelect: () => void cancel(run) }] : []), ...(run.status === "PENDING_APPROVAL" ? [{ id: "approve", label: t("people.approve"), icon: CheckCircle2, onSelect: () => void decide(run, "APPROVE") }, { id: "reject", label: t("people.reject"), icon: XCircle, destructive: true, onSelect: () => void decide(run, "REJECT") }] : []), ...(run.status === "REJECTED" ? [{ id: "cancel", label: t("payroll.cancelPermanently"), icon: Ban, destructive: true, onSelect: () => void cancel(run) }] : [])]; }
  const statusItems = [{ id: "", label: t("people.allStatuses") }, ...PAYROLL_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "payrollStatus", id) }))];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("payroll.eyebrow", { organization: organizationName })} title={t("payroll.title")} description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("payroll.descriptionSuffix")}`} count={t("payroll.count", { count: runs.pagination.total, suffix: suffix(runs.pagination.total) })} primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => setPeriodOpen(true)}><Plus className="h-4 w-4" />{t("payroll.newPeriod")}</Button><Button onClick={() => setPrepareOpen(true)}><FileText className="h-4 w-4" />{t("payroll.prepareRun")}</Button></div>} />
    <ModuleMetrics label={t("payroll.metrics")}><ModuleMetric label={t("payroll.openPeriods")} value={periods.metrics.open || 0} /><ModuleMetric label={t("payroll.toApprove")} value={runs.metrics.pendingApproval || 0} /><ModuleMetric label={t("payroll.approvedRuns")} value={runs.metrics.approved || 0} /><ModuleMetric label={t("payroll.activePopulation")} value={lookups.employees.length} /></ModuleMetrics>
    <ModuleToolbar controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "RUNS", label: t("payroll.runsTab"), count: runs.pagination.total }, { id: "PERIODS", label: t("payroll.periodsTab"), count: periods.pagination.total }]} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={statusItems} /></>} summary={t("payroll.toolbarSummary")} />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={tab === "RUNS" ? t("payroll.runsSection") : t("payroll.periodsSection")} description={tab === "RUNS" ? t("payroll.runsDescription") : t("payroll.periodsDescription")}>
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "RUNS" ? (runs.items.length ? <BusinessList ariaLabel={t("payroll.runsSection")}>{runs.items.map((run) => <BusinessListItem key={run.id} title={`${run.reference} · ${run.payrollPeriod.name}`} status={<StatusBadge tone={statusTone(run.status)}>{professionalErpEnumLabel(locale, "payrollStatus", run.status)}</StatusBadge>} meta={t("payroll.employeeCountNet", { count: run.employeeCount, suffix: suffix(run.employeeCount), amount: professionalErpMoney(run.netAmount, run.currency, locale) })} description={t("payroll.amountSummary", { gross: professionalErpMoney(run.grossAmount, run.currency, locale), bonus: professionalErpMoney(run.bonusAmount, run.currency, locale), deduction: professionalErpMoney(run.deductionAmount, run.currency, locale) })} onOpen={() => setDetail(run)} actions={<ContextActions label={t("payroll.actions")} actions={actionsFor(run)} />} />)}</BusinessList> : <EmptyState compact title={t("payroll.noRun")} description={t("payroll.noRunDescription")} />) : periods.items.length ? <BusinessList ariaLabel={t("payroll.periodsSection")}>{periods.items.map((period) => <BusinessListItem key={period.id} title={`${period.code} · ${period.name}`} status={<StatusBadge tone={statusTone(period.status)}>{professionalErpEnumLabel(locale, "payrollStatus", period.status)}</StatusBadge>} meta={`${professionalErpDate(period.periodStart, locale)} – ${professionalErpDate(period.periodEnd, locale)}`} description={`${t("payroll.runCount", { count: period._count.payrollRuns, suffix: suffix(period._count.payrollRuns) })}${period.payDate ? t("payroll.paymentPlanned", { date: professionalErpDate(period.payDate, locale) }) : ""}`} />)}</BusinessList> : <EmptyState compact title={t("payroll.noPeriod")} description={t("payroll.noPeriodDescription")} />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="PAYROLL_OPERATIONS" />
    </ModuleContent>

    <Dialog open={periodOpen} onClose={() => setPeriodOpen(false)} title={t("payroll.newPeriodDialog")} className="h-[88dvh] max-w-3xl"><form onSubmit={createPeriod} className="grid gap-5"><ProfessionalFormSection title={t("payroll.period")}><Field label={t("payroll.code")}><Input name="code" placeholder="2026-08" required /></Field><Field label={t("payroll.name")}><Input name="name" placeholder={locale === "en" ? "August 2026 payroll" : "Paie août 2026"} required /></Field><Field label={t("payroll.start")}><Input name="periodStart" type="date" required /></Field><Field label={t("payroll.end")}><Input name="periodEnd" type="date" required /></Field><Field label={t("payroll.payDate")}><Input name="payDate" type="date" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setPeriodOpen(false)}>{t("people.cancel")}</Button><Button type="submit">{t("payroll.openPeriod")}</Button></div></form></Dialog>

    <Dialog open={prepareOpen} onClose={() => setPrepareOpen(false)} title={t("payroll.prepareAssistant")} description={t("payroll.prepareAssistantDescription")} className="h-[96dvh] max-w-5xl"><form onSubmit={prepareRun} className="grid gap-5"><ProfessionalFormSection title={t("payroll.stepPeriodCurrency")}><Field label={t("payroll.openPeriodField")}><NativeSelect name="payrollPeriodId" required items={[{ id: "", label: t("people.select") }, ...lookups.payrollPeriods.filter((period) => period.status === "OPEN").map((period) => ({ id: period.id, label: `${period.code} · ${period.name}` }))]} /></Field><Field label={t("payroll.currency")}><Input name="currency" defaultValue="USD" maxLength={3} required /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("payroll.stepPopulation")} description={t("payroll.populationDescription")}><div className="md:col-span-2 grid gap-3">{lookups.employees.map((employee) => { const selected = selectedEmployees.includes(employee.id); return <div key={employee.id} className="grid gap-3 rounded-xl border border-dtsc-border p-3 md:grid-cols-5"><label className="md:col-span-2 flex min-h-11 items-center gap-3 font-black"><input type="checkbox" checked={selected} onChange={(event) => setSelectedEmployees((current) => event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id))} />{employee.employeeNumber} · {employee.displayName}</label><Field label={t("payroll.bonus")}><Input name={`bonus_${employee.id}`} type="number" min="0" step="0.01" defaultValue="0" disabled={!selected} /></Field><Field label={t("payroll.deduction")}><Input name={`deduction_${employee.id}`} type="number" min="0" step="0.01" defaultValue="0" disabled={!selected} /></Field><Field label={t("payroll.reason")}><Input name={`bonusReason_${employee.id}`} disabled={!selected} placeholder={t("payroll.adjustmentPlaceholder")} /><input name={`deductionReason_${employee.id}`} type="hidden" value="Variable de paie" /></Field></div>; })}</div></ProfessionalFormSection><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6">{t("payroll.serverControls")}</div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setPrepareOpen(false)}>{t("people.cancel")}</Button><Button type="submit" disabled={selectedEmployees.length === 0}>{t("payroll.calculatePrepare")}</Button></div></form></Dialog>

    <Dialog open={Boolean(submitTarget)} onClose={() => setSubmitTarget(null)} title={t("payroll.selectApproverTitle")} description={t("payroll.selectApproverDescription")} className="max-w-xl"><form onSubmit={submitRun} className="grid gap-5"><Field label={t("payroll.approver")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("people.selectAnother") }, ...lookups.members.map((member) => ({ id: member.id, label: memberLabel(member) }))]} /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSubmitTarget(null)}>{t("people.cancel")}</Button><Button type="submit">{t("payroll.submit")}</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.reference} · ${detail.payrollPeriod.name}` : t("payroll.detail")} className="h-[96dvh] max-w-6xl">{detail && payrollReportModel ? <div className="grid gap-5"><ProfessionalReportView model={payrollReportModel} locale={locale} logoUrl={organizationLogoUrl} /><section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">{t("payroll.payslipsControls")}</h3><div className="mt-3"><BusinessList ariaLabel={t("payroll.employees")}>{detail.items.map((item) => <BusinessListItem key={item.id} title={`${item.employee.employeeNumber} · ${item.employee.displayName}`} status={<StatusBadge tone={item.payslip ? "success" : "neutral"}>{item.payslip ? `${item.payslip.payslipNumber} · ${professionalErpEnumLabel(locale, "payrollStatus", item.payslip.status)}` : t("payroll.payslipNotGenerated")}</StatusBadge>} meta={t("payroll.netApprovedTime", { amount: professionalErpMoney(item.netAmount, detail.currency, locale), time: minutesLabel(item.approvedTimeMinutes) })} description={t("payroll.itemAmounts", { base: professionalErpMoney(item.baseGrossAmount, detail.currency, locale), bonus: professionalErpMoney(item.bonusAmount, detail.currency, locale), deduction: professionalErpMoney(item.deductionAmount, detail.currency, locale) })} />)}</BusinessList></div></section><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}</Dialog>
  </ModuleWorkspace>;
}