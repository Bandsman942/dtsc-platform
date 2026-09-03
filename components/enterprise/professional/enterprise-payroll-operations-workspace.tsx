"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, CheckCircle2, Eye, FileText, Landmark, Plus, Send, XCircle } from "lucide-react";
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
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { ProfessionalReportView } from "@/components/reports/professional-report-view";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { buildPayrollProfessionalReport } from "@/lib/reporting/payroll-professional-report";

type Employee = {
  id: string;
  employeeNumber: string;
  displayName: string;
  departmentId?: string | null;
  positionId?: string | null;
  siteId?: string | null;
};
type Member = { userId: string; name: string; email: string; role: string; positionTitle: string | null };
type PayrollPeriodLookup = { id: string; code: string; name: string; status: string; periodStart: string; periodEnd: string; payDate: string | null };
type Lookups = { employees: Employee[]; approvers: Member[]; payrollPeriods: PayrollPeriodLookup[]; currencies: string[] };
type PayrollPeriod = PayrollPeriodLookup & { revision: number; _count: { payrollRuns: number } };
type PayrollItem = { id: string; employeeId: string; baseGrossAmount: string | number; approvedTimeMinutes: number | null; bonusAmount: string | number; bonusReason: string | null; deductionAmount: string | number; deductionReason: string | null; grossAmount: string | number; netAmount: string | number; status: string; employee: Employee; payslip: { id: string; payslipNumber: string; status: string; generatedAt: string | null; netAmount: string | number; currency: string } | null };
type PayrollRun = { id: string; payrollPeriodId: string; reference: string; status: string; currency: string; employeeCount: number; grossAmount: string | number; bonusAmount: string | number; deductionAmount: string | number; netAmount: string | number; preparedByUserId: string; submittedByUserId: string | null; approverUserId: string | null; revision: number; canDecide: boolean; payrollPeriod: PayrollPeriodLookup; items: PayrollItem[] };
type PayrollTab = "RUNS" | "PERIODS";
type DecisionTarget = { run: PayrollRun; decision: "APPROVE" | "REJECT" };

const PAYROLL_STATUSES = ["OPEN", "CLOSED", "PREPARED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED", "GENERATED"];
const DEFAULT_PAYROLL_REJECTION_AUDIT_COMMENT = "Paie rejetée";
const DEFAULT_PAYROLL_APPROVAL_AUDIT_COMMENT = "Paie contrôlée";

const copyByLocale = {
  fr: {
    reviewVariables: "Revue des variables de paie",
    reviewVariablesDescription: "Chaque prime et retenue non nulle doit être justifiée. Le temps approuvé reste une preuve de couverture et ne proratise pas automatiquement la rémunération contractuelle.",
    bonusReason: "Motif de la prime",
    deductionReason: "Motif de la retenue",
    noBonus: "Aucune prime",
    noDeduction: "Aucune retenue",
    evidenceOnly: "Temps approuvé : preuve de couverture uniquement",
    financeBoundary: "Paie approuvée ≠ paiement effectué. Le décaissement se poursuit explicitement dans Finance.",
    continueFinance: "Continuer dans Paiements",
    decisionReview: "Revue de validation de la paie",
    decisionComment: "Commentaire de contrôle",
    rejectionReason: "Motif obligatoire du rejet",
    rejectionHelp: "Un rejet sans motif n’est pas accepté. Indiquez ce qui doit être corrigé avant une nouvelle soumission.",
    cancellationReview: "Annulation contrôlée",
    cancellationReason: "Motif obligatoire d’annulation",
    cancellationHelp: "L’annulation conserve la paie et son audit ; elle ne supprime aucun historique.",
    page: "Page", previous: "Précédent", next: "Suivant",
    noApprover: "Aucun validateur indépendant n’est disponible. Un autre membre actif doit recevoir le droit d’approuver Paie opérationnelle.",
    noEmployee: "Aucun dossier collaborateur RH actif n’est disponible. Créez d’abord les dossiers dans Ressources humaines.",
    noOpenPeriod: "Aucune période de paie ouverte n’est disponible. Ouvrez d’abord une période.",
    population: "Population de paie",
    populationDescription: "Sélectionnez uniquement les collaborateurs à inclure dans ce cycle. Chaque personne doit posséder un contrat actif compatible avec la devise choisie.",
    selectAll: "Tout sélectionner", clearAll: "Tout désélectionner",
    preparationFailed: "La préparation de la paie a échoué.", submitFailed: "La soumission de la paie a échoué.", decisionFailed: "La décision de paie a échoué.", cancelFailed: "L’annulation de la paie a échoué.", periodFailed: "La création de la période a échoué.",
    periodCurrency: "Période et devise", contractualBase: "Base contractuelle", approvedTimeEvidence: "Temps approuvé rattaché", notAvailable: "Non disponible",
  },
  en: {
    reviewVariables: "Payroll variable review",
    reviewVariablesDescription: "Every non-zero bonus and deduction must be justified. Approved time remains coverage evidence and does not automatically prorate contractual compensation.",
    bonusReason: "Bonus reason", deductionReason: "Deduction reason", noBonus: "No bonus", noDeduction: "No deduction",
    evidenceOnly: "Approved time: coverage evidence only", financeBoundary: "Approved payroll ≠ completed payment. Disbursement continues explicitly in Finance.", continueFinance: "Continue to Payments",
    decisionReview: "Payroll approval review", decisionComment: "Review comment", rejectionReason: "Required rejection reason", rejectionHelp: "A rejection without a reason is not accepted. Explain what must be corrected before resubmission.",
    cancellationReview: "Controlled cancellation", cancellationReason: "Required cancellation reason", cancellationHelp: "Cancellation preserves payroll and its audit trail; it deletes no history.",
    page: "Page", previous: "Previous", next: "Next",
    noApprover: "No independent approver is available. Another active member must receive approval rights for Operational payroll.",
    noEmployee: "No active HR employee record is available. Create the employee records in Human Resources first.", noOpenPeriod: "No open payroll period is available. Open a period first.",
    population: "Payroll population", populationDescription: "Select only the employees to include in this cycle. Each person must have an active contract compatible with the selected currency.", selectAll: "Select all", clearAll: "Clear all",
    preparationFailed: "Payroll preparation failed.", submitFailed: "Payroll submission failed.", decisionFailed: "Payroll decision failed.", cancelFailed: "Payroll cancellation failed.", periodFailed: "Payroll period creation failed.",
    periodCurrency: "Period and currency", contractualBase: "Contractual base", approvedTimeEvidence: "Linked approved time", notAvailable: "Not available",
  },
} as const;

function statusTone(status: string) {
  if (["APPROVED", "GENERATED", "CLOSED"].includes(status)) return "success" as const;
  if (["PREPARED", "PENDING_APPROVAL", "OPEN"].includes(status)) return "warning" as const;
  if (["REJECTED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function PaginationControls({ page, pageCount, onChange, copy }: { page: number; pageCount: number; onChange: (page: number) => void; copy: (typeof copyByLocale)["fr"] | (typeof copyByLocale)["en"] }) {
  if (pageCount <= 1) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dtsc-border pt-4"><span className="text-sm font-semibold text-dtsc-muted">{copy.page} {page}/{pageCount}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>{copy.previous}</Button><Button type="button" variant="outline" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>{copy.next}</Button></div></div>;
}

export function EnterprisePayrollOperationsWorkspace({ organizationId, organizationName, organizationLogoUrl, definition }: { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; locale?: string | null; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const copy = copyByLocale[locale === "en" ? "en" : "fr"];
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const suffix = (count: number) => count === 1 ? "" : "s";
  const memberLabel = (member: Member) => `${member.name || member.email} · ${member.positionTitle || professionalErpEnumLabel(locale, "role", member.role)}`;
  const minutesLabel = (value: number | null) => !value ? t("payroll.noApprovedTime") : t("payroll.approvedMinutes", { hours: Math.floor(value / 60), minutes: (value % 60).toString().padStart(2, "0") });

  const [tab, setTab] = useState<PayrollTab>("RUNS");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], approvers: [], payrollPeriods: [], currencies: [] });
  const [periodOpen, setPeriodOpen] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [detail, setDetail] = useState<PayrollRun | null>(null);
  const [submitTarget, setSubmitTarget] = useState<PayrollRun | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PayrollRun | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useToastMessage(notice, "success");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/hr-payroll-lookups?module=PAYROLL_OPERATIONS`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Partial<Lookups> & { message?: string; error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || t("payroll.dataUnavailable"));
        if (active) setLookups({ employees: body.employees || [], approvers: body.approvers || [], payrollPeriods: body.payrollPeriods || [], currencies: body.currencies || [] });
      })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : t("payroll.dataUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (status) value.set("status", status);
    return value;
  }, [page, status]);
  const periods = useProfessionalCollection<PayrollPeriod>({ endpoint: `/api/enterprise/${organizationId}/payroll-periods`, params, refreshKey });
  const runs = useProfessionalCollection<PayrollRun>({ endpoint: `/api/enterprise/${organizationId}/payroll-runs`, params, refreshKey });
  const activeCollection = tab === "RUNS" ? runs : periods;
  const previousPayrollRun = useMemo(() => {
    if (!detail) return null;
    const currentStart = Date.parse(detail.payrollPeriod.periodStart);
    return runs.items.filter((run) => run.id !== detail.id && run.currency === detail.currency && Date.parse(run.payrollPeriod.periodStart) < currentStart).sort((left, right) => Date.parse(right.payrollPeriod.periodStart) - Date.parse(left.payrollPeriod.periodStart))[0] || null;
  }, [detail, runs.items]);
  const payrollReportModel = useMemo(() => detail ? buildPayrollProfessionalReport({ organizationName, locale, run: detail, previousRun: previousPayrollRun }) : null, [detail, locale, organizationName, previousPayrollRun]);

  const statusItems = [{ id: "", label: t("people.allStatuses") }, ...PAYROLL_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "payrollStatus", id) }))];
  const openPeriods = lookups.payrollPeriods.filter((period) => period.status === "OPEN");
  const currencyItems = (lookups.currencies.length ? lookups.currencies : ["USD"]).map((id) => ({ id, label: id }));
  const approverItems = [{ id: "", label: lookups.approvers.length ? (locale === "en" ? "Select an authorized approver" : "Choisir un validateur autorisé") : copy.noApprover }, ...lookups.approvers.map((member) => ({ id: member.userId, label: memberLabel(member) }))];

  async function mutate(action: string, endpoint: string, payload: unknown, success: string, fallback: string) {
    if (busyAction) return false;
    setBusyAction(action);
    setError("");
    setNotice("");
    try {
      await professionalMutation(endpoint, payload);
      setRefreshKey((value) => value + 1);
      setNotice(success);
      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : fallback);
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function createPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") || "").trim();
    const name = String(form.get("name") || "").trim();
    const periodStart = String(form.get("periodStart") || "");
    const periodEnd = String(form.get("periodEnd") || "");
    const payDate = String(form.get("payDate") || "");
    if (!code || !name) return setError(locale === "en" ? "Enter a code and a name for the payroll period." : "Renseignez le code et le nom de la période de paie.");
    if (!periodStart || !periodEnd) return setError(locale === "en" ? "Enter both period dates." : "Renseignez les deux dates de la période.");
    if (periodEnd < periodStart) return setError(locale === "en" ? "Payroll period end cannot be before its start." : "La fin de la période de paie ne peut pas précéder son début.");
    if (payDate && payDate < periodStart) return setError(locale === "en" ? "The planned payment date cannot be before the payroll period starts." : "La date de paiement prévue ne peut pas précéder le début de la période.");
    const ok = await mutate("period-create", `/api/enterprise/${organizationId}/payroll-periods`, { code, name, periodStart, periodEnd, payDate: payDate || null }, t("payroll.periodOpened"), copy.periodFailed);
    if (ok) { setPeriodOpen(false); setTab("PERIODS"); }
  }

  async function prepareRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payrollPeriodId = String(form.get("payrollPeriodId") || "");
    const currency = String(form.get("currency") || "");
    if (!payrollPeriodId) return setError(copy.noOpenPeriod);
    if (!currency) return setError(locale === "en" ? "Choose the payroll currency." : "Choisissez la devise de la paie.");
    if (!selectedEmployees.length) return setError(locale === "en" ? "Select at least one employee for this payroll run." : "Sélectionnez au moins un collaborateur pour cette paie.");
    const adjustments = selectedEmployees.map((employeeId) => ({
      employeeId,
      bonusAmount: Number(form.get(`bonus_${employeeId}`) || 0),
      bonusReason: String(form.get(`bonusReason_${employeeId}`) || "").trim() || null,
      deductionAmount: Number(form.get(`deduction_${employeeId}`) || 0),
      deductionReason: String(form.get(`deductionReason_${employeeId}`) || "").trim() || null,
    }));
    if (adjustments.some((item) => item.bonusAmount < 0 || item.deductionAmount < 0 || !Number.isFinite(item.bonusAmount) || !Number.isFinite(item.deductionAmount))) return setError(locale === "en" ? "Bonus and deduction amounts must be valid non-negative numbers." : "Les primes et retenues doivent être des montants valides et non négatifs.");
    const missingReason = adjustments.find((item) => (item.bonusAmount > 0 && !item.bonusReason) || (item.deductionAmount > 0 && !item.deductionReason));
    if (missingReason) return setError(locale === "en" ? "Every non-zero payroll variable requires a precise reason." : "Chaque variable de paie non nulle exige un motif précis.");
    const ok = await mutate("payroll-prepare", `/api/enterprise/${organizationId}/payroll-runs`, { payrollPeriodId, currency, employeeIds: selectedEmployees, adjustments }, t("payroll.runPrepared"), copy.preparationFailed);
    if (ok) { setPrepareOpen(false); setSelectedEmployees([]); setTab("RUNS"); }
  }

  async function submitRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitTarget) return;
    const approverUserId = String(new FormData(event.currentTarget).get("approverUserId") || "");
    if (!approverUserId) return setError(copy.noApprover);
    const ok = await mutate(`payroll-submit-${submitTarget.id}`, `/api/enterprise/${organizationId}/payroll-runs/${submitTarget.id}/submit`, { approverUserId, revision: submitTarget.revision }, t("payroll.runSubmitted"), copy.submitFailed);
    if (ok) { setSubmitTarget(null); setDetail(null); }
  }

  async function decideRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decisionTarget) return;
    const comment = String(new FormData(event.currentTarget).get("comment") || "").trim();
    if (decisionTarget.decision === "REJECT" && !comment) return setError(copy.rejectionHelp);
    const run = decisionTarget.run;
    const ok = await mutate(`payroll-decision-${run.id}`, `/api/enterprise/${organizationId}/payroll-runs/${run.id}/decision`, {
      decision: decisionTarget.decision,
      revision: run.revision,
      comment: comment || (decisionTarget.decision === "REJECT" ? DEFAULT_PAYROLL_REJECTION_AUDIT_COMMENT : DEFAULT_PAYROLL_APPROVAL_AUDIT_COMMENT),
    }, decisionTarget.decision === "APPROVE" ? t("payroll.runApproved") : t("payroll.runRejected"), copy.decisionFailed);
    if (ok) { setDecisionTarget(null); setDetail(null); }
  }

  async function cancelRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelTarget) return;
    const reason = String(new FormData(event.currentTarget).get("reason") || "").trim();
    if (!reason) return setError(copy.cancellationHelp);
    const ok = await mutate(`payroll-cancel-${cancelTarget.id}`, `/api/enterprise/${organizationId}/payroll-runs/${cancelTarget.id}/cancel`, { revision: cancelTarget.revision, reason }, t("payroll.runCancelled"), copy.cancelFailed);
    if (ok) { setCancelTarget(null); setDetail(null); }
  }

  function actionsFor(run: PayrollRun): BusinessContextAction[] {
    return [
      { id: "open", label: t("people.open"), icon: Eye, onSelect: () => setDetail(run) },
      ...(run.status === "PREPARED" ? [
        { id: "submit", label: t("payroll.submit"), icon: Send, onSelect: () => { setError(""); setSubmitTarget(run); } },
        { id: "cancel", label: t("payroll.cancel"), icon: Ban, destructive: true, onSelect: () => { setError(""); setCancelTarget(run); } },
      ] : []),
      ...(run.canDecide ? [
        { id: "approve", label: t("people.approve"), icon: CheckCircle2, onSelect: () => { setError(""); setDecisionTarget({ run, decision: "APPROVE" as const }); } },
        { id: "reject", label: t("people.reject"), icon: XCircle, destructive: true, onSelect: () => { setError(""); setDecisionTarget({ run, decision: "REJECT" as const }); } },
      ] : []),
      ...(run.status === "REJECTED" ? [{ id: "cancel", label: t("payroll.cancelPermanently"), icon: Ban, destructive: true, onSelect: () => { setError(""); setCancelTarget(run); } }] : []),
    ];
  }

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={t("payroll.eyebrow", { organization: organizationName })}
      title={t("payroll.title")}
      description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${copy.financeBoundary}`}
      count={t("payroll.count", { count: runs.pagination.total, suffix: suffix(runs.pagination.total) })}
      primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => { setError(""); setPeriodOpen(true); }}><Plus className="h-4 w-4" />{t("payroll.newPeriod")}</Button><Button onClick={() => { setError(""); setPrepareOpen(true); }}><FileText className="h-4 w-4" />{t("payroll.prepareRun")}</Button></div>}
    />
    <ModuleMetrics label={t("payroll.metrics")}><ModuleMetric label={t("payroll.openPeriods")} value={periods.metrics.open || 0} /><ModuleMetric label={t("payroll.toApprove")} value={runs.metrics.pendingApproval || 0} /><ModuleMetric label={t("payroll.approvedRuns")} value={runs.metrics.approved || 0} /><ModuleMetric label={t("payroll.activePopulation")} value={lookups.employees.length} /></ModuleMetrics>
    <ModuleToolbar controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "RUNS", label: t("payroll.runsTab"), count: runs.pagination.total }, { id: "PERIODS", label: t("payroll.periodsTab"), count: periods.pagination.total }]} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={statusItems} /></>} summary={copy.financeBoundary} />
    <ModuleContent>
      {error && !periodOpen && !prepareOpen && !submitTarget && !decisionTarget && !cancelTarget ? <ProfessionalError message={error} /> : null}
      <ModuleSection title={tab === "RUNS" ? t("payroll.runsSection") : t("payroll.periodsSection")} description={tab === "RUNS" ? t("payroll.runsDescription") : t("payroll.periodsDescription")}>
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "RUNS" ? (
          runs.items.length ? <BusinessList ariaLabel={t("payroll.runsSection")}>{runs.items.map((run) => <BusinessListItem key={run.id} title={`${run.reference} · ${run.payrollPeriod.name}`} status={<StatusBadge tone={statusTone(run.status)}>{professionalErpEnumLabel(locale, "payrollStatus", run.status)}</StatusBadge>} meta={t("payroll.employeeCountNet", { count: run.employeeCount, suffix: suffix(run.employeeCount), amount: professionalErpMoney(run.netAmount, run.currency, locale) })} description={t("payroll.amountSummary", { gross: professionalErpMoney(run.grossAmount, run.currency, locale), bonus: professionalErpMoney(run.bonusAmount, run.currency, locale), deduction: professionalErpMoney(run.deductionAmount, run.currency, locale) })} onOpen={() => setDetail(run)} actions={<ContextActions label={t("payroll.actions")} actions={actionsFor(run)} />} />)}</BusinessList> : <EmptyState compact title={t("payroll.noRun")} description={t("payroll.noRunDescription")} />
        ) : periods.items.length ? <BusinessList ariaLabel={t("payroll.periodsSection")}>{periods.items.map((period) => <BusinessListItem key={period.id} title={`${period.code} · ${period.name}`} status={<StatusBadge tone={statusTone(period.status)}>{professionalErpEnumLabel(locale, "payrollStatus", period.status)}</StatusBadge>} meta={`${professionalErpDate(period.periodStart, locale)} – ${professionalErpDate(period.periodEnd, locale)}`} description={`${t("payroll.runCount", { count: period._count.payrollRuns, suffix: suffix(period._count.payrollRuns) })}${period.payDate ? t("payroll.paymentPlanned", { date: professionalErpDate(period.payDate, locale) }) : ""}`} />)}</BusinessList> : <EmptyState compact title={t("payroll.noPeriod")} description={t("payroll.noPeriodDescription")} />}
        <PaginationControls page={activeCollection.pagination.page} pageCount={activeCollection.pagination.pageCount} onChange={setPage} copy={copy} />
      </ModuleSection>
      <ProfessionalHelp moduleCode="PAYROLL_OPERATIONS" />
    </ModuleContent>

    <Dialog open={periodOpen} onClose={() => { if (!busyAction) setPeriodOpen(false); }} title={t("payroll.newPeriodDialog")} description={locale === "en" ? "Open a bounded payroll period. A planned pay date is informational and never marks payroll as paid." : "Ouvrez une période de paie bornée. La date de paiement prévue reste informative et ne marque jamais la paie comme payée."} presentation="editor" className="h-[88dvh] max-w-3xl">
      <form onSubmit={createPeriod} className="grid gap-5">{error ? <ProfessionalError message={error} /> : null}<ProfessionalFormSection title={t("payroll.period")}><Field label={t("payroll.code")} help={locale === "en" ? "Use a stable human code, for example 2026-09." : "Utilisez un code humain stable, par exemple 2026-09."}><Input name="code" placeholder="2026-09" required /></Field><Field label={t("payroll.name")} help={locale === "en" ? "Use a name that employees and reviewers can understand." : "Utilisez un nom compréhensible par les collaborateurs et validateurs."}><Input name="name" placeholder={locale === "en" ? "September 2026 payroll" : "Paie septembre 2026"} required /></Field><Field label={t("payroll.start")}><Input name="periodStart" type="date" required /></Field><Field label={t("payroll.end")}><Input name="periodEnd" type="date" required /></Field><Field label={t("payroll.payDate")}><Input name="payDate" type="date" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" onClick={() => setPeriodOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)} aria-busy={Boolean(busyAction)}>{t("payroll.openPeriod")}</Button></div></form>
    </Dialog>

    <Dialog open={prepareOpen} onClose={() => { if (!busyAction) setPrepareOpen(false); }} title={t("payroll.prepareAssistant")} description={copy.reviewVariablesDescription} presentation="editor" className="h-[96dvh] max-w-6xl">
      <form onSubmit={prepareRun} className="grid gap-5">
        {error ? <ProfessionalError message={error} /> : null}
        {!lookups.employees.length ? <ProfessionalError message={copy.noEmployee} /> : null}
        {!openPeriods.length ? <ProfessionalError message={copy.noOpenPeriod} /> : null}
        <ProfessionalFormSection title={copy.periodCurrency} description={locale === "en" ? "The selected currency must match every active employment contract in the population." : "La devise choisie doit correspondre à chaque contrat de travail actif de la population."}>
          <Field label={t("payroll.openPeriodField")}><NativeSelect name="payrollPeriodId" required disabled={!openPeriods.length} items={[{ id: "", label: openPeriods.length ? t("people.select") : copy.noOpenPeriod }, ...openPeriods.map((period) => ({ id: period.id, label: `${period.code} · ${period.name}` }))]} /></Field>
          <Field label={t("payroll.currency")}><NativeSelect name="currency" defaultValue={currencyItems[0]?.id || "USD"} required items={currencyItems} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={copy.population} description={copy.populationDescription}>
          <div className="md:col-span-2 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!lookups.employees.length} onClick={() => setSelectedEmployees(lookups.employees.map((employee) => employee.id))}>{copy.selectAll}</Button><Button type="button" variant="outline" disabled={!selectedEmployees.length} onClick={() => setSelectedEmployees([])}>{copy.clearAll}</Button></div>
          <div className="md:col-span-2 grid gap-3">{lookups.employees.map((employee) => {
            const selected = selectedEmployees.includes(employee.id);
            return <section key={employee.id} className="grid gap-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
              <label className="flex min-h-11 items-center gap-3 font-black"><input type="checkbox" checked={selected} onChange={(event) => setSelectedEmployees((current) => event.target.checked ? [...new Set([...current, employee.id])] : current.filter((id) => id !== employee.id))} />{employee.displayName} · {employee.employeeNumber}</label>
              {selected ? <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("payroll.bonus")}><Input name={`bonus_${employee.id}`} type="number" min="0" step="0.01" defaultValue="0" /></Field>
                <Field label={copy.bonusReason}><Input name={`bonusReason_${employee.id}`} placeholder={copy.noBonus} /></Field>
                <Field label={t("payroll.deduction")}><Input name={`deduction_${employee.id}`} type="number" min="0" step="0.01" defaultValue="0" /></Field>
                <Field label={copy.deductionReason}><Input name={`deductionReason_${employee.id}`} placeholder={copy.noDeduction} /></Field>
              </div> : null}
            </section>;
          })}</div>
        </ProfessionalFormSection>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6"><strong>{copy.evidenceOnly}.</strong> {t("payroll.serverControls")} {copy.financeBoundary}</div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" onClick={() => setPrepareOpen(false)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction) || !selectedEmployees.length || !lookups.employees.length || !openPeriods.length} aria-busy={Boolean(busyAction)}>{t("payroll.calculatePrepare")}</Button></div>
      </form>
    </Dialog>

    <Dialog open={Boolean(submitTarget)} onClose={() => { if (!busyAction) setSubmitTarget(null); }} title={t("payroll.selectApproverTitle")} description={t("payroll.selectApproverDescription")} presentation="editor" className="h-[70dvh] max-w-2xl">
      {submitTarget ? <form onSubmit={submitRun} className="grid gap-5">{error ? <ProfessionalError message={error} /> : null}<div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm"><strong>{submitTarget.reference}</strong> · {professionalErpMoney(submitTarget.netAmount, submitTarget.currency, locale)}</div>{!lookups.approvers.length ? <ProfessionalError message={copy.noApprover} /> : null}<Field label={t("payroll.approver")}><NativeSelect name="approverUserId" required disabled={!lookups.approvers.length} items={approverItems} /></Field><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setSubmitTarget(null)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={!lookups.approvers.length || Boolean(busyAction)} aria-busy={Boolean(busyAction)}>{t("payroll.submit")}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(decisionTarget)} onClose={() => { if (!busyAction) setDecisionTarget(null); }} title={copy.decisionReview} presentation="editor" className="h-[74dvh] max-w-2xl">
      {decisionTarget ? <form onSubmit={decideRun} className="grid gap-5">{error ? <ProfessionalError message={error} /> : null}<div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm"><strong>{decisionTarget.run.reference}</strong> · {professionalErpMoney(decisionTarget.run.netAmount, decisionTarget.run.currency, locale)}</div><Field label={decisionTarget.decision === "REJECT" ? copy.rejectionReason : copy.decisionComment} required={decisionTarget.decision === "REJECT"} help={decisionTarget.decision === "REJECT" ? copy.rejectionHelp : undefined}><textarea name="comment" rows={decisionTarget.decision === "REJECT" ? 6 : 5} required={decisionTarget.decision === "REJECT"} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setDecisionTarget(null)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{decisionTarget.decision === "APPROVE" ? t("people.approve") : t("people.reject")}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(cancelTarget)} onClose={() => { if (!busyAction) setCancelTarget(null); }} title={copy.cancellationReview} presentation="editor" className="h-[70dvh] max-w-2xl">
      {cancelTarget ? <form onSubmit={cancelRun} className="grid gap-5">{error ? <ProfessionalError message={error} /> : null}<div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm"><strong>{cancelTarget.reference}</strong> · {professionalErpMoney(cancelTarget.netAmount, cancelTarget.currency, locale)}</div><Field label={copy.cancellationReason} help={copy.cancellationHelp}><textarea name="reason" rows={6} required className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCancelTarget(null)} disabled={Boolean(busyAction)}>{t("people.cancel")}</Button><Button type="submit" disabled={Boolean(busyAction)}>{t("payroll.cancel")}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.reference} · ${detail.payrollPeriod.name}` : t("payroll.detail")} presentation="editor" className="h-[96dvh] max-w-6xl">
      {detail && payrollReportModel ? <div className="grid gap-5"><ProfessionalReportView model={payrollReportModel} locale={locale} logoUrl={organizationLogoUrl} /><section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-dtsc-ink">{t("payroll.payslipsControls")}</h3><p className="mt-1 text-sm text-dtsc-muted">{copy.reviewVariablesDescription}</p></div>{detail.status === "APPROVED" ? <Button asChild><Link href={`/enterprise-modules/FINANCE_PAYMENTS?payrollRunId=${encodeURIComponent(detail.id)}`}><Landmark className="h-4 w-4" />{copy.continueFinance}</Link></Button> : null}</div><div className="mt-3"><BusinessList ariaLabel={t("payroll.employees")}>{detail.items.map((item) => <BusinessListItem key={item.id} title={`${item.employee.displayName} · ${item.employee.employeeNumber}`} status={<StatusBadge tone={item.payslip ? "success" : "neutral"}>{item.payslip ? `${item.payslip.payslipNumber} · ${professionalErpEnumLabel(locale, "payrollStatus", item.payslip.status)}` : t("payroll.payslipNotGenerated")}</StatusBadge>} meta={t("payroll.netApprovedTime", { amount: professionalErpMoney(item.netAmount, detail.currency, locale), time: minutesLabel(item.approvedTimeMinutes) })} description={`${copy.contractualBase}: ${professionalErpMoney(item.baseGrossAmount, detail.currency, locale)} · ${t("payroll.bonus")}: ${professionalErpMoney(item.bonusAmount, detail.currency, locale)}${item.bonusReason ? ` (${item.bonusReason})` : ""} · ${t("payroll.deduction")}: ${professionalErpMoney(item.deductionAmount, detail.currency, locale)}${item.deductionReason ? ` (${item.deductionReason})` : ""}`} />)}</BusinessList></div></section><div className="rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-3 text-sm leading-6">{copy.financeBoundary}</div><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}
    </Dialog>
  </ModuleWorkspace>;
}