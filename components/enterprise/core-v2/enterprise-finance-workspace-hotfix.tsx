"use client";

import { CheckCircle2, Eye, FilePlus2, Plus, RotateCcw, Send, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { Field, NativeSelect, formatEnterpriseDate, type EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { FinanceReferenceSelect, type FinanceReferenceOption } from "@/components/enterprise/core-v2/finance-reference-select";

type LegacyRecord = { id: string; recordType?: string; title: string; description: string | null; status: string; updatedAt: string };
type BudgetCapabilities = { canSubmit?: boolean; canCancel?: boolean; canReopen?: boolean; canFreeze?: boolean; canCreateRevision?: boolean; canClose?: boolean };
type ExpenseCapabilities = { canSubmit?: boolean; canCancel?: boolean; canReopen?: boolean };
type BudgetItem = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  status: string;
  scenarioCode: string;
  versionNumber: number;
  fiscalYearCode: string | null;
  periodStart: string;
  periodEnd: string;
  currency: string;
  departmentId: string | null;
  ownerUserId: string | null;
  forecastAmount: string | number | null;
  forecastMethod: string | null;
  forecastConfidence: string | number | null;
  actualFreshnessAt: string | null;
  frozenAt: string | null;
  revision: number;
  plannedAmount: string | number;
  committedAmount: string | number;
  actualAmount: string | number;
  availableAmount: string | number;
  lineCount: number;
  capabilities?: BudgetCapabilities;
};
type ExpenseItem = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  status: string;
  expenseDate: string;
  category: string | null;
  currency: string;
  amount: string | number;
  supplierId: string | null;
  purchaseId: string | null;
  budgetLineId: string | null;
  revision: number;
  budgetStatus: string;
  supplier: { id: string; legalName: string; displayName: string | null } | null;
  purchase: { id: string; reference: string; title: string; totalAmount: string | number } | null;
  budgetLine: { id: string; name: string; budget: { id: string; reference: string; title: string; currency: string; status: string } } | null;
  capabilities?: ExpenseCapabilities;
};
type BudgetDetail = {
  budget: BudgetItem;
  lines: Array<{ id: string; code: string | null; name: string; category: string | null; costCenterCode: string | null; responsibleUserId: string | null; hypothesis: string | null; forecastAmount: string | number | null; plannedAmount: string | number; committedAmount: string | number; actualAmount: string | number; availableAmount: string | number }>;
  totals: { plannedAmount: string | number; committedAmount: string | number; actualAmount: string | number; availableAmount: string | number };
  alerts: Array<{ id: string; ruleCode: string; thresholdType: string; thresholdValue: string | number; currentValue: string | number | null; severity: string; status: string; triggeredAt: string }>;
  versions: Array<{ id: string; reference: string; scenarioCode: string; versionNumber: number; status: string; createdAt: string; frozenAt: string | null }>;
  purchases: Array<{ id: string; reference: string; title: string; status: string; totalAmount: string | number; currency: string }>;
  expenses: Array<{ id: string; reference: string; title: string; status: string; amount: string | number; currency: string }>;
  events: Array<{ id: string; summary: string; createdAt: string }>;
};
type ExpenseDetail = {
  expense: ExpenseItem & { amountVarianceReason?: string | null };
  documents: Array<{ id: string; title: string; documentType: string }>;
  events: Array<{ id: string; summary: string; createdAt: string }>;
  approval: { id: string; status: string; approverUserId: string; decisionComment: string | null } | null;
};
type SummaryBucket = { currency: string; activeBudgets: number; plannedAmount: string; committedAmount: string; actualAmount: string; availableAmount: string; unbudgetedExpenseAmount: string; unbudgetedExpenseCount: number };
type BudgetLineDraft = { name: string; code: string; category: string; plannedAmount: string; forecastAmount: string; costCenterCode: string; departmentId: string; responsibleUserId: string; hypothesis: string };

const budgetStatuses = ["DRAFT", "PREPARING", "PENDING_APPROVAL", "CORRECTION_REQUESTED", "ACTIVE", "FROZEN", "REVISED", "REJECTED", "CLOSED", "CANCELLED"];
const budgetScenarios = ["BASE", "CONSERVATIVE", "OPTIMISTIC", "REVISED", "CUSTOM"];
const forecastMethods = ["MANUAL", "HISTORICAL_RUN_RATE", "IMPORTED", "AI_ASSISTED"];
const alertRules = ["CONSUMPTION_THRESHOLD", "OVERSPEND", "HIGH_COMMITMENT", "FORECAST_OVERSPEND", "MISSING_ACTUALS", "INACTIVE_LINE"];
const expenseStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"];
const labelsFr: Record<string, string> = {
  DRAFT: "Brouillon", PREPARING: "En préparation", CORRECTION_REQUESTED: "Correction demandée", FROZEN: "Gelé", REVISED: "Révisé", BASE: "Base", CONSERVATIVE: "Prudent", OPTIMISTIC: "Optimiste", CUSTOM: "Personnalisé", MANUAL: "Manuelle", HISTORICAL_RUN_RATE: "Rythme historique", IMPORTED: "Importée", AI_ASSISTED: "Assistée par IA", PENDING_APPROVAL: "En validation", ACTIVE: "Actif", APPROVED: "Approuvée", REJECTED: "Rejeté", CLOSED: "Clôturé", CANCELLED: "Annulé", UNBUDGETED: "Non budgétée", BUDGETED: "Budgétée", CONSUMPTION_THRESHOLD: "Seuil de consommation", OVERSPEND: "Dépassement", HIGH_COMMITMENT: "Engagement élevé", FORECAST_OVERSPEND: "Prévision de dépassement", MISSING_ACTUALS: "Réalisé manquant", INACTIVE_LINE: "Ligne inactive",
};
const labelsEn: Record<string, string> = {
  DRAFT: "Draft", PREPARING: "Preparing", CORRECTION_REQUESTED: "Correction requested", FROZEN: "Frozen", REVISED: "Revised", BASE: "Base", CONSERVATIVE: "Conservative", OPTIMISTIC: "Optimistic", CUSTOM: "Custom", MANUAL: "Manual", HISTORICAL_RUN_RATE: "Historical run rate", IMPORTED: "Imported", AI_ASSISTED: "AI-assisted", PENDING_APPROVAL: "Pending approval", ACTIVE: "Active", APPROVED: "Approved", REJECTED: "Rejected", CLOSED: "Closed", CANCELLED: "Cancelled", UNBUDGETED: "Unbudgeted", BUDGETED: "Budgeted", CONSUMPTION_THRESHOLD: "Consumption threshold", OVERSPEND: "Overspend", HIGH_COMMITMENT: "High commitment", FORECAST_OVERSPEND: "Forecast overspend", MISSING_ACTUALS: "Missing actuals", INACTIVE_LINE: "Inactive line",
};
function label(en: boolean, value: string) { return (en ? labelsEn : labelsFr)[value] || value.replaceAll("_", " "); }
function tone(status: string) { return status === "ACTIVE" || status === "APPROVED" ? "success" as const : status === "PENDING_APPROVAL" ? "warning" as const : status === "REJECTED" || status === "CANCELLED" ? "danger" as const : "neutral" as const; }
function amount(value: string | number, currency: string, en: boolean) { const n = Number(value || 0); try { return new Intl.NumberFormat(en ? "en-US" : "fr-FR", { style: "currency", currency }).format(n); } catch { return `${n.toFixed(2)} ${currency}`; } }

export function EnterpriseFinanceWorkspaceHotfix({ organizationId, members, departments, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; members: EnterpriseChoice[]; departments: EnterpriseChoice[]; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const en = locale === "en";
  const emptyLine: BudgetLineDraft = { name: "", code: "", category: "", plannedAmount: "0", forecastAmount: "", costCenterCode: "", departmentId: "", responsibleUserId: "", hypothesis: "" };
  const [pageBudget, setPageBudget] = useState(1);
  const [pageExpense, setPageExpense] = useState(1);
  const [budgetSearch, setBudgetSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [budgetStatus, setBudgetStatus] = useState("");
  const [expenseStatus, setExpenseStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [summary, setSummary] = useState<SummaryBucket[]>([]);
  const [createBudgetOpen, setCreateBudgetOpen] = useState(false);
  const [createExpenseOpen, setCreateExpenseOpen] = useState(false);
  const [budgetDetail, setBudgetDetail] = useState<BudgetDetail | null>(null);
  const [expenseDetail, setExpenseDetail] = useState<ExpenseDetail | null>(null);
  const [approvalBudget, setApprovalBudget] = useState<BudgetItem | null>(null);
  const [approvalExpense, setApprovalExpense] = useState<ExpenseItem | null>(null);
  const [revisionBudget, setRevisionBudget] = useState<BudgetItem | null>(null);
  const [alertBudget, setAlertBudget] = useState<BudgetItem | null>(null);
  const [lines, setLines] = useState<BudgetLineDraft[]>([{ ...emptyLine }]);
  const [purchaseSource, setPurchaseSource] = useState<FinanceReferenceOption | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  useToastMessage(message, "success");
  useToastMessage(errorMessage, "error");

  const budgetParams = useMemo(() => { const p = new URLSearchParams({ page: String(pageBudget), pageSize: "20" }); if (budgetSearch.trim()) p.set("search", budgetSearch.trim()); if (budgetStatus) p.set("status", budgetStatus); return p; }, [pageBudget, budgetSearch, budgetStatus]);
  const expenseParams = useMemo(() => { const p = new URLSearchParams({ page: String(pageExpense), pageSize: "20" }); if (expenseSearch.trim()) p.set("search", expenseSearch.trim()); if (expenseStatus) p.set("status", expenseStatus); return p; }, [pageExpense, expenseSearch, expenseStatus]);
  const budgets = useEnterpriseV2Collection<BudgetItem>({ endpoint: `/api/enterprise/${organizationId}/budgets`, params: budgetParams, refreshKey });
  const expenses = useEnterpriseV2Collection<ExpenseItem>({ endpoint: `/api/enterprise/${organizationId}/expenses`, params: expenseParams, refreshKey });

  const loadSummary = useCallback(async () => {
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/finance-summary`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { currencies?: SummaryBucket[] } | null;
      if (!response.ok || !body) throw new Error("SUMMARY_FAILED");
      setSummary(body.currencies || []);
    } catch {
      setSummary([]);
    }
  }, [organizationId]);
  useEffect(() => { void loadSummary(); }, [loadSummary, refreshKey]);

  function mutationError(error: unknown) {
    const raw = error instanceof Error ? error.message : "";
    if (raw && !["ACTION_FAILED", "LOAD_FAILED"].includes(raw)) return raw;
    return en ? "The action could not be completed. Check the information and try again." : "L’action n’a pas pu être terminée. Vérifiez les informations puis réessayez.";
  }

  async function createBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(""); setErrorMessage("");
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const assumptionsText = String(form.assumptionsText || "").trim();
    delete form.assumptionsText;
    for (const key of ["forecastAmount", "forecastConfidence"]) if (String(form[key] || "").trim() === "") delete form[key];
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/budgets`, "POST", {
        ...form,
        ...(assumptionsText ? { assumptions: { note: assumptionsText } } : {}),
        lines: lines.map((line) => ({ ...line, plannedAmount: Number(line.plannedAmount), forecastAmount: line.forecastAmount ? Number(line.forecastAmount) : undefined })),
      });
      setCreateBudgetOpen(false);
      setLines([{ ...emptyLine }]);
      setRefreshKey((value) => value + 1);
      setMessage(en ? "Budget draft created." : "Brouillon budgétaire créé.");
    } catch (error) { setErrorMessage(mutationError(error)); }
    finally { setBusy(false); }
  }

  async function createExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(""); setErrorMessage("");
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const amountValue = String(form.amount || "").trim();
    const currencyValue = String(form.currency || "").trim();
    const documentId = String(form.documentId || "").trim();
    const payload: Record<string, unknown> = {
      ...form,
      amount: amountValue ? Number(amountValue) : undefined,
      currency: currencyValue || undefined,
      documentIds: documentId ? [documentId] : [],
    };
    delete payload.documentId;
    if (purchaseSource) {
      delete payload.supplierId;
      delete payload.budgetLineId;
    }
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/expenses`, "POST", payload);
      setCreateExpenseOpen(false);
      setPurchaseSource(null);
      setRefreshKey((value) => value + 1);
      setMessage(en ? "Expense draft created." : "Brouillon de dépense créé.");
    } catch (error) { setErrorMessage(mutationError(error)); }
    finally { setBusy(false); }
  }

  async function runAction(kind: "budgets" | "expenses", item: BudgetItem | ExpenseItem, actionName: string, approverUserId?: string, extra: Record<string, unknown> = {}) {
    const key = `${kind}:${item.id}:${actionName}`;
    if (busyAction) return;
    setBusyAction(key); setMessage(""); setErrorMessage("");
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/${kind}/${item.id}/actions`, "POST", { action: actionName, revision: item.revision, approverUserId: approverUserId || "", ...extra });
      setApprovalBudget(null); setApprovalExpense(null); setRevisionBudget(null); setBudgetDetail(null); setExpenseDetail(null);
      setRefreshKey((value) => value + 1);
      setMessage(en ? "Workflow updated." : "Workflow mis à jour.");
    } catch (error) { setErrorMessage(mutationError(error)); }
    finally { setBusyAction(null); }
  }

  async function configureAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!alertBudget || busy) return;
    setBusy(true); setMessage(""); setErrorMessage("");
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/budgets/${alertBudget.id}/alerts`, "POST", { ...form, thresholdValue: Number(form.thresholdValue), recipientUserIds: [] });
      const target = alertBudget;
      setAlertBudget(null);
      await openBudget(target);
      setMessage(en ? "Budget alert configured." : "Alerte budgétaire configurée.");
    } catch (error) { setErrorMessage(mutationError(error)); }
    finally { setBusy(false); }
  }

  async function evaluateAlerts(item: BudgetItem) {
    if (busyAction) return;
    setBusyAction(`alert:${item.id}`); setMessage(""); setErrorMessage("");
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/budgets/${item.id}/alerts`, "POST", { action: "EVALUATE" });
      await openBudget(item);
      setMessage(en ? "Budget alerts evaluated." : "Alertes budgétaires évaluées.");
    } catch (error) { setErrorMessage(mutationError(error)); }
    finally { setBusyAction(null); }
  }

  async function openBudget(item: BudgetItem) {
    setErrorMessage("");
    const response = await fetch(`/api/enterprise/${organizationId}/budgets/${item.id}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as (BudgetDetail & { message?: string }) | null;
    if (!response.ok || !body) { setErrorMessage(body?.message || (en ? "The budget could not be loaded." : "Le budget n’a pas pu être chargé.")); return; }
    setBudgetDetail(body);
  }

  async function openExpense(item: ExpenseItem) {
    setErrorMessage("");
    const response = await fetch(`/api/enterprise/${organizationId}/expenses/${item.id}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as (ExpenseDetail & { message?: string }) | null;
    if (!response.ok || !body) { setErrorMessage(body?.message || (en ? "The expense could not be loaded." : "La dépense n’a pas pu être chargée.")); return; }
    setExpenseDetail(body);
  }

  const budgetActions = (item: BudgetItem): BusinessContextAction[] => [
    { id: "open", label: en ? "Open" : "Ouvrir", icon: Eye, disabled: Boolean(busyAction), onSelect: () => void openBudget(item) },
    ...(item.capabilities?.canSubmit ? [{ id: "submit", label: en ? "Submit" : "Soumettre", icon: Send, disabled: Boolean(busyAction), onSelect: () => setApprovalBudget(item) }] : []),
    ...(item.capabilities?.canCancel ? [{ id: "cancel", label: en ? "Cancel" : "Annuler", icon: XCircle, destructive: true, disabled: Boolean(busyAction), onSelect: () => void runAction("budgets", item, "CANCEL") }] : []),
    ...(item.capabilities?.canReopen ? [{ id: "reopen", label: en ? "Reopen" : "Rouvrir", icon: RotateCcw, disabled: Boolean(busyAction), onSelect: () => void runAction("budgets", item, "REOPEN") }] : []),
    ...(item.capabilities?.canFreeze ? [{ id: "freeze", label: en ? "Freeze" : "Geler", icon: CheckCircle2, disabled: Boolean(busyAction), onSelect: () => void runAction("budgets", item, "FREEZE") }] : []),
    ...(item.capabilities?.canCreateRevision ? [{ id: "revision", label: en ? "Create revision" : "Créer une révision", icon: FilePlus2, disabled: Boolean(busyAction), onSelect: () => setRevisionBudget(item) }] : []),
    ...(item.capabilities?.canClose ? [{ id: "close", label: en ? "Close" : "Clôturer", icon: CheckCircle2, disabled: Boolean(busyAction), onSelect: () => void runAction("budgets", item, "CLOSE") }] : []),
  ];
  const expenseActions = (item: ExpenseItem): BusinessContextAction[] => [
    { id: "open", label: en ? "Open" : "Ouvrir", icon: Eye, disabled: Boolean(busyAction), onSelect: () => void openExpense(item) },
    ...(item.capabilities?.canSubmit ? [{ id: "submit", label: en ? "Submit" : "Soumettre", icon: Send, disabled: Boolean(busyAction), onSelect: () => setApprovalExpense(item) }] : []),
    ...(item.capabilities?.canCancel ? [{ id: "cancel", label: en ? "Cancel" : "Annuler", icon: XCircle, destructive: true, disabled: Boolean(busyAction), onSelect: () => void runAction("expenses", item, "CANCEL") }] : []),
    ...(item.capabilities?.canReopen ? [{ id: "reopen", label: en ? "Reopen" : "Rouvrir", icon: RotateCcw, disabled: Boolean(busyAction), onSelect: () => void runAction("expenses", item, "REOPEN") }] : []),
  ];

  return <div className="grid min-w-0 gap-8">
    {summary.map((item) => <ModuleMetrics key={item.currency} label={`${en ? "Finance indicators" : "Indicateurs financiers"} · ${item.currency}`}><ModuleMetric label={en ? "Active budgets" : "Budgets actifs"} value={item.activeBudgets} /><ModuleMetric label={en ? "Planned" : "Planifié"} value={amount(item.plannedAmount, item.currency, en)} /><ModuleMetric label={en ? "Committed" : "Engagé"} value={amount(item.committedAmount, item.currency, en)} /><ModuleMetric label={en ? "Actual" : "Réalisé"} value={amount(item.actualAmount, item.currency, en)} /><ModuleMetric label={en ? "Available" : "Disponible"} value={amount(item.availableAmount, item.currency, en)} /><ModuleMetric label={en ? "Unbudgeted expenses" : "Dépenses non budgétées"} value={amount(item.unbudgetedExpenseAmount, item.currency, en)} hint={`${item.unbudgetedExpenseCount}`} /></ModuleMetrics>)}

    <ModuleSection title={en ? "Budgets" : "Budgets"} description={en ? "Financial plans, commitments and actual consumption." : "Plans financiers, engagements et consommation réelle."} count={`${budgets.pagination.total}`} action={canCreate ? <Button onClick={() => { setErrorMessage(""); setCreateBudgetOpen(true); }}><Plus className="h-4 w-4" />{en ? "New budget" : "Nouveau budget"}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-2"><Input value={budgetSearch} onChange={(event) => { setBudgetSearch(event.target.value); setPageBudget(1); }} placeholder={en ? "Search budgets…" : "Rechercher un budget…"} /><NativeSelect value={budgetStatus} onChange={setBudgetStatus} items={budgetStatuses.map((id) => ({ id, label: label(en, id) }))} /></div>
      {budgets.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{en ? "Loading…" : "Chargement…"}</p> : budgets.items.length ? <BusinessList ariaLabel="budgets">{budgets.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={tone(item.status)}>{label(en, item.status)}</StatusBadge>} meta={`${item.currency} · ${en ? "Planned" : "Planifié"} ${amount(item.plannedAmount, item.currency, en)} · ${en ? "Available" : "Disponible"} ${amount(item.availableAmount, item.currency, en)}`} description={`${label(en, item.scenarioCode)} · v${item.versionNumber} · ${formatEnterpriseDate(item.periodStart, locale)} → ${formatEnterpriseDate(item.periodEnd, locale)} · ${item.lineCount} ${en ? "lines" : "lignes"}${item.actualFreshnessAt ? ` · ${en ? "Fresh" : "Actualisé"} ${formatEnterpriseDate(item.actualFreshnessAt, locale)}` : ""}`} onOpen={() => void openBudget(item)} actions={<ContextActions label={en ? "Budget actions" : "Actions budget"} actions={budgetActions(item)} />} />)}</BusinessList> : <EmptyState compact title={en ? "No budgets" : "Aucun budget"} description={budgets.error || (en ? "No budget matches the filters." : "Aucun budget ne correspond aux filtres.")} />}
      <Pager page={pageBudget} pageCount={budgets.pagination.pageCount} setPage={setPageBudget} en={en} />
    </ModuleSection>

    <ModuleSection title={en ? "Expenses" : "Dépenses"} description={en ? "ERP expenses are budget consumption, not bank payments." : "Les dépenses ERP représentent une consommation budgétaire, pas un paiement bancaire."} count={`${expenses.pagination.total}`} action={canCreate ? <Button onClick={() => { setErrorMessage(""); setPurchaseSource(null); setCreateExpenseOpen(true); }}><FilePlus2 className="h-4 w-4" />{en ? "New expense" : "Nouvelle dépense"}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-2"><Input value={expenseSearch} onChange={(event) => { setExpenseSearch(event.target.value); setPageExpense(1); }} placeholder={en ? "Search expenses…" : "Rechercher une dépense…"} /><NativeSelect value={expenseStatus} onChange={setExpenseStatus} items={expenseStatuses.map((id) => ({ id, label: label(en, id) }))} /></div>
      {expenses.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{en ? "Loading…" : "Chargement…"}</p> : expenses.items.length ? <BusinessList ariaLabel="expenses">{expenses.items.map((item) => <BusinessListItem key={item.id} title={`${item.reference} · ${item.title}`} status={<StatusBadge tone={tone(item.status)}>{label(en, item.status)}</StatusBadge>} meta={`${amount(item.amount, item.currency, en)} · ${label(en, item.budgetStatus)}`} description={`${formatEnterpriseDate(item.expenseDate, locale)} · ${item.supplier?.displayName || item.supplier?.legalName || (en ? "No supplier" : "Sans fournisseur")}${item.purchase ? ` · ${item.purchase.reference}` : ""}`} onOpen={() => void openExpense(item)} actions={<ContextActions label={en ? "Expense actions" : "Actions dépense"} actions={expenseActions(item)} />} />)}</BusinessList> : <EmptyState compact title={en ? "No expenses" : "Aucune dépense"} description={expenses.error || (en ? "No expense matches the filters." : "Aucune dépense ne correspond aux filtres.")} />}
      <Pager page={pageExpense} pageCount={expenses.pagination.pageCount} setPage={setPageExpense} en={en} />
    </ModuleSection>

    {legacyRecords.length ? <ModuleSection title={en ? "Historical finance records" : "Historique financier"} description={en ? "Legacy BUDGET/EXPENSE records are read-only." : "Les anciens BUDGET/EXPENSE restent en lecture seule."}><BusinessList ariaLabel="legacy finance">{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{en ? "History" : "Historique"}</StatusBadge>} description={item.description || label(en, item.status)} />)}</BusinessList></ModuleSection> : null}

    <Dialog open={createBudgetOpen} onClose={() => { if (!busy) setCreateBudgetOpen(false); }} title={en ? "New budget" : "Nouveau budget"} presentation="editor" className="max-w-5xl">
      <form onSubmit={createBudget} className="grid gap-5">
        <Field label={en ? "Title" : "Intitulé"}><Input name="title" required disabled={busy} /></Field>
        <div className="grid gap-3 md:grid-cols-2"><Field label={en ? "Start" : "Début"}><Input name="periodStart" type="date" required disabled={busy} /></Field><Field label={en ? "End" : "Fin"}><Input name="periodEnd" type="date" required disabled={busy} /></Field><Field label={en ? "Currency" : "Devise"}><Input name="currency" defaultValue="USD" maxLength={3} required disabled={busy} /></Field><Field label={en ? "Scenario" : "Scénario"}><NativeSelect name="scenarioCode" defaultValue="BASE" items={budgetScenarios.map((id) => ({ id, label: label(en, id) }))} disabled={busy} /></Field><Field label={en ? "Fiscal year" : "Exercice"}><Input name="fiscalYearCode" placeholder="2026" disabled={busy} /></Field><Field label={en ? "Budget owner" : "Responsable budgétaire"}><NativeSelect name="ownerUserId" items={members} disabled={busy} /></Field><Field label={en ? "Department" : "Département"}><NativeSelect name="departmentId" items={departments} disabled={busy} /></Field><Field label={en ? "Forecast method" : "Méthode de prévision"}><NativeSelect name="forecastMethod" items={forecastMethods.map((id) => ({ id, label: label(en, id) }))} disabled={busy} /></Field><Field label={en ? "Forecast amount" : "Montant prévisionnel"}><Input name="forecastAmount" type="number" min="0" step="0.01" disabled={busy} /></Field><Field label={en ? "Confidence (%)" : "Confiance (%)"}><Input name="forecastConfidence" type="number" min="0" max="100" step="0.1" disabled={busy} /></Field></div>
        <Field label="Description"><textarea name="description" disabled={busy} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm disabled:opacity-60" /></Field>
        <Field label={en ? "Assumptions" : "Hypothèses"}><textarea name="assumptionsText" disabled={busy} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm disabled:opacity-60" /></Field>
        <div className="grid gap-3 border-y border-dtsc-border py-3"><div className="flex items-center justify-between gap-3"><strong>{en ? "Budget lines" : "Lignes budgétaires"}</strong><Button type="button" variant="outline" disabled={busy} onClick={() => setLines((items) => [...items, { ...emptyLine }])}><Plus className="h-4 w-4" />{en ? "Add line" : "Ajouter"}</Button></div>{lines.map((line, index) => <div key={index} className="grid gap-2 rounded-xl border border-dtsc-border p-3 md:grid-cols-2 lg:grid-cols-4"><Input value={line.name} onChange={(event) => setLines((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder={en ? "Line name" : "Nom de ligne"} required disabled={busy} /><Input value={line.code} onChange={(event) => setLines((items) => items.map((item, i) => i === index ? { ...item, code: event.target.value } : item))} placeholder="Code" disabled={busy} /><Input value={line.category} onChange={(event) => setLines((items) => items.map((item, i) => i === index ? { ...item, category: event.target.value } : item))} placeholder={en ? "Category" : "Catégorie"} disabled={busy} /><Input value={line.costCenterCode} onChange={(event) => setLines((items) => items.map((item, i) => i === index ? { ...item, costCenterCode: event.target.value } : item))} placeholder={en ? "Cost center" : "Centre de coûts"} disabled={busy} /><Input value={line.plannedAmount} onChange={(event) => setLines((items) => items.map((item, i) => i === index ? { ...item, plannedAmount: event.target.value } : item))} type="number" min="0" step="0.01" required disabled={busy} /><Input value={line.forecastAmount} onChange={(event) => setLines((items) => items.map((item, i) => i === index ? { ...item, forecastAmount: event.target.value } : item))} type="number" min="0" step="0.01" placeholder={en ? "Forecast" : "Prévision"} disabled={busy} /><NativeSelect value={line.departmentId} onChange={(value) => setLines((items) => items.map((item, i) => i === index ? { ...item, departmentId: value } : item))} items={departments} disabled={busy} /><NativeSelect value={line.responsibleUserId} onChange={(value) => setLines((items) => items.map((item, i) => i === index ? { ...item, responsibleUserId: value } : item))} items={members} disabled={busy} /><textarea value={line.hypothesis} onChange={(event) => setLines((items) => items.map((item, i) => i === index ? { ...item, hypothesis: event.target.value } : item))} placeholder={en ? "Line assumption" : "Hypothèse de ligne"} disabled={busy} className="min-h-16 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm disabled:opacity-60 md:col-span-2 lg:col-span-4" />{lines.length > 1 ? <Button type="button" variant="outline" disabled={busy} onClick={() => setLines((items) => items.filter((_, i) => i !== index))}>{en ? "Remove line" : "Retirer la ligne"}</Button> : null}</div>)}</div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={busy} onClick={() => setCreateBudgetOpen(false)}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}>{en ? "Create draft" : "Créer le brouillon"}</Button></div>
      </form>
    </Dialog>

    <Dialog open={createExpenseOpen} onClose={() => { if (!busy) setCreateExpenseOpen(false); }} title={en ? "New expense" : "Nouvelle dépense"} presentation="editor" className="max-w-4xl">
      <form onSubmit={createExpense} className="grid gap-5">
        <Field label={en ? "Title" : "Dépense"}><Input name="title" required disabled={busy} /></Field>
        <div className="grid gap-3 md:grid-cols-2"><Field label={en ? "Expense date" : "Date"}><Input name="expenseDate" type="date" required disabled={busy} /></Field><Field label={en ? "Category" : "Catégorie"}><Input name="category" disabled={busy} /></Field></div>
        <Field label={en ? "Purchase source" : "Achat source"}><FinanceReferenceSelect organizationId={organizationId} kind="purchase" name="purchaseId" label={en ? "purchase" : "achat"} locale={locale} disabled={busy} onOptionChange={setPurchaseSource} /></Field>
        {purchaseSource ? <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 text-sm text-dtsc-muted"><strong className="text-dtsc-ink">{en ? "Purchase-linked expense" : "Dépense liée à un achat"}</strong><p className="mt-1">{en ? "Supplier, budget line and currency are inherited from the purchase and revalidated by the server. Leave the amount empty to reuse the purchase total." : "Le fournisseur, la ligne budgétaire et la devise sont repris de l’achat puis revalidés par le serveur. Laissez le montant vide pour reprendre le total de l’achat."}</p></div> : <div className="grid gap-3 md:grid-cols-2"><Field label={en ? "Supplier" : "Fournisseur"}><FinanceReferenceSelect organizationId={organizationId} kind="supplier" name="supplierId" label={en ? "supplier" : "fournisseur"} locale={locale} disabled={busy} /></Field><Field label={en ? "Budget line" : "Ligne budgétaire"}><FinanceReferenceSelect organizationId={organizationId} kind="budget-line" name="budgetLineId" label={en ? "budget line" : "ligne budgétaire"} locale={locale} disabled={busy} /></Field></div>}
        <Field label={en ? "Supporting document" : "Justificatif"}><FinanceReferenceSelect organizationId={organizationId} kind="document" name="documentId" label={en ? "supporting document" : "justificatif"} locale={locale} disabled={busy} /></Field>
        <div className="grid gap-3 md:grid-cols-2"><Field label={en ? "Amount" : "Montant"}><Input name="amount" type="number" min="0" step="0.01" disabled={busy} placeholder={purchaseSource ? (en ? "Defaults to purchase total" : "Par défaut : total achat") : undefined} /></Field><Field label={en ? "Currency" : "Devise"}><Input name="currency" maxLength={3} disabled={busy} placeholder={purchaseSource ? (en ? "Inherited from purchase" : "Reprise de l’achat") : undefined} /></Field><Field label={en ? "Department" : "Département"}><NativeSelect name="departmentId" items={departments} disabled={busy} /></Field><Field label={en ? "Variance reason" : "Motif d’écart"}><Input name="amountVarianceReason" disabled={busy} /></Field></div>
        <Field label="Description"><textarea name="description" disabled={busy} className="min-h-20 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm disabled:opacity-60" /></Field>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={busy} onClick={() => setCreateExpenseOpen(false)}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}>{en ? "Create draft" : "Créer le brouillon"}</Button></div>
      </form>
    </Dialog>

    <ApprovalDialog open={Boolean(approvalBudget)} onClose={() => setApprovalBudget(null)} title={en ? "Submit budget" : "Soumettre le budget"} organizationId={organizationId} locale={locale} en={en} busy={Boolean(busyAction)} onSubmit={(approver) => approvalBudget ? void runAction("budgets", approvalBudget, "SUBMIT", approver) : undefined} />
    <ApprovalDialog open={Boolean(approvalExpense)} onClose={() => setApprovalExpense(null)} title={en ? "Submit expense" : "Soumettre la dépense"} organizationId={organizationId} locale={locale} en={en} busy={Boolean(busyAction)} onSubmit={(approver) => approvalExpense ? void runAction("expenses", approvalExpense, "SUBMIT", approver) : undefined} />
    <RevisionDialog open={Boolean(revisionBudget)} onClose={() => setRevisionBudget(null)} en={en} busy={Boolean(busyAction)} onSubmit={(reason) => revisionBudget ? void runAction("budgets", revisionBudget, "CREATE_REVISION", undefined, { revisionReason: reason }) : undefined} />

    <Dialog open={Boolean(alertBudget)} onClose={() => { if (!busy) setAlertBudget(null); }} title={en ? "Configure budget alert" : "Configurer une alerte budgétaire"} presentation="editor">
      <form onSubmit={configureAlert} className="grid gap-4"><Field label={en ? "Rule" : "Règle"}><NativeSelect name="ruleCode" defaultValue="CONSUMPTION_THRESHOLD" items={alertRules.map((id) => ({ id, label: label(en, id) }))} disabled={busy} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label={en ? "Threshold type" : "Type de seuil"}><NativeSelect name="thresholdType" defaultValue="PERCENT" items={[{ id: "PERCENT", label: "%" }, { id: "AMOUNT", label: en ? "Amount" : "Montant" }]} disabled={busy} /></Field><Field label={en ? "Threshold" : "Seuil"}><Input name="thresholdValue" type="number" min="0" step="0.01" required disabled={busy} /></Field><Field label={en ? "Severity" : "Sévérité"}><NativeSelect name="severity" defaultValue="WARNING" items={[{ id: "INFO", label: "Info" }, { id: "WARNING", label: en ? "Warning" : "Avertissement" }, { id: "CRITICAL", label: en ? "Critical" : "Critique" }]} disabled={busy} /></Field><Field label={en ? "Responsible" : "Responsable"}><NativeSelect name="responsibleUserId" items={members} disabled={busy} /></Field></div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={busy} onClick={() => setAlertBudget(null)}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}>{en ? "Save alert" : "Enregistrer l’alerte"}</Button></div></form>
    </Dialog>

    <Dialog open={Boolean(budgetDetail)} onClose={() => setBudgetDetail(null)} title={budgetDetail ? `${budgetDetail.budget.reference} · ${budgetDetail.budget.title}` : ""} className="h-[96dvh] max-w-5xl">
      {budgetDetail ? <div className="grid gap-5"><div className="flex flex-wrap items-center justify-between gap-3 border-y border-dtsc-border py-3 text-sm"><div><strong>{label(en, budgetDetail.budget.scenarioCode)} · v{budgetDetail.budget.versionNumber}</strong><p className="text-dtsc-muted">{budgetDetail.budget.fiscalYearCode || "—"} · {budgetDetail.budget.forecastMethod ? label(en, budgetDetail.budget.forecastMethod) : (en ? "No forecast method" : "Sans méthode de prévision")}</p></div>{canManage ? <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={Boolean(busyAction)} onClick={() => void evaluateAlerts(budgetDetail.budget)}>{en ? "Evaluate alerts" : "Évaluer les alertes"}</Button><Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setAlertBudget(budgetDetail.budget)}>{en ? "Configure alert" : "Configurer une alerte"}</Button></div> : null}</div><ModuleMetrics label={en ? "Budget position" : "Position budgétaire"}><ModuleMetric label={en ? "Planned" : "Planifié"} value={amount(budgetDetail.totals.plannedAmount, budgetDetail.budget.currency, en)} /><ModuleMetric label={en ? "Committed" : "Engagé"} value={amount(budgetDetail.totals.committedAmount, budgetDetail.budget.currency, en)} /><ModuleMetric label={en ? "Actual" : "Réalisé"} value={amount(budgetDetail.totals.actualAmount, budgetDetail.budget.currency, en)} /><ModuleMetric label={en ? "Available" : "Disponible"} value={amount(budgetDetail.totals.availableAmount, budgetDetail.budget.currency, en)} /></ModuleMetrics>{budgetDetail.versions.length > 1 ? <div><strong className="text-sm text-dtsc-ink">{en ? "Versions and scenarios" : "Versions et scénarios"}</strong><BusinessList ariaLabel="budget versions">{budgetDetail.versions.map((version) => <BusinessListItem key={version.id} title={`${version.reference} · v${version.versionNumber}`} status={<StatusBadge tone={tone(version.status)}>{label(en, version.status)}</StatusBadge>} meta={label(en, version.scenarioCode)} description={formatEnterpriseDate(version.createdAt, locale)} />)}</BusinessList></div> : null}{budgetDetail.alerts.length ? <div><strong className="text-sm text-dtsc-ink">{en ? "Budget alerts" : "Alertes budgétaires"}</strong><BusinessList ariaLabel="budget alerts">{budgetDetail.alerts.map((alert) => <BusinessListItem key={alert.id} title={label(en, alert.ruleCode)} status={<StatusBadge tone={alert.severity === "CRITICAL" ? "danger" : alert.severity === "WARNING" ? "warning" : "info"}>{label(en, alert.status)}</StatusBadge>} meta={`${alert.thresholdType} ${String(alert.thresholdValue)} · ${en ? "Current" : "Actuel"} ${String(alert.currentValue ?? "—")}`} description={formatEnterpriseDate(alert.triggeredAt, locale)} />)}</BusinessList></div> : null}<div><strong className="text-sm text-dtsc-ink">{en ? "Budget lines" : "Lignes budgétaires"}</strong><BusinessList ariaLabel="budget lines">{budgetDetail.lines.map((line) => <BusinessListItem key={line.id} title={`${line.code || "—"} · ${line.name}`} meta={`${en ? "Planned" : "Planifié"} ${amount(line.plannedAmount, budgetDetail.budget.currency, en)} · ${en ? "Available" : "Disponible"} ${amount(line.availableAmount, budgetDetail.budget.currency, en)}`} description={`${en ? "Committed" : "Engagé"} ${amount(line.committedAmount, budgetDetail.budget.currency, en)} · ${en ? "Actual" : "Réalisé"} ${amount(line.actualAmount, budgetDetail.budget.currency, en)}`} />)}</BusinessList></div>{budgetDetail.events.length ? <div className="border-y border-dtsc-border py-3 text-sm text-dtsc-muted"><strong className="text-dtsc-ink">{en ? "History" : "Historique"}</strong>{budgetDetail.events.slice(0, 20).map((event) => <p key={event.id}>{formatEnterpriseDate(event.createdAt, locale)} · {event.summary}</p>)}</div> : null}</div> : null}
    </Dialog>

    <Dialog open={Boolean(expenseDetail)} onClose={() => setExpenseDetail(null)} title={expenseDetail ? `${expenseDetail.expense.reference} · ${expenseDetail.expense.title}` : ""} className="h-[96dvh] max-w-4xl">
      {expenseDetail ? <div className="grid gap-4 text-sm"><div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-2"><p><strong>{en ? "Amount" : "Montant"}</strong><br />{amount(expenseDetail.expense.amount, expenseDetail.expense.currency, en)}</p><p><strong>{en ? "Budget" : "Budget"}</strong><br />{expenseDetail.expense.budgetLine ? `${expenseDetail.expense.budgetLine.budget.reference} · ${expenseDetail.expense.budgetLine.name}` : label(en, "UNBUDGETED")}</p><p><strong>{en ? "Purchase" : "Achat"}</strong><br />{expenseDetail.expense.purchase?.reference || "—"}</p><p><strong>{en ? "Supplier" : "Fournisseur"}</strong><br />{expenseDetail.expense.supplier?.displayName || expenseDetail.expense.supplier?.legalName || "—"}</p></div>{expenseDetail.expense.amountVarianceReason ? <p><strong>{en ? "Amount variance" : "Écart de montant"}</strong><br />{expenseDetail.expense.amountVarianceReason}</p> : null}{expenseDetail.documents.length ? <div><strong className="text-dtsc-ink">{en ? "Supporting documents" : "Justificatifs"}</strong><BusinessList ariaLabel="expense documents">{expenseDetail.documents.map((document) => <BusinessListItem key={document.id} title={document.title} meta={document.documentType} />)}</BusinessList></div> : null}{expenseDetail.approval ? <p className="rounded-xl border border-dtsc-border p-3"><strong>{en ? "Approval" : "Validation"}</strong><br />{label(en, expenseDetail.approval.status)}{expenseDetail.approval.decisionComment ? ` · ${expenseDetail.approval.decisionComment}` : ""}</p> : null}{expenseDetail.events.length ? <div className="border-y border-dtsc-border py-3 text-dtsc-muted"><strong className="text-dtsc-ink">{en ? "History" : "Historique"}</strong>{expenseDetail.events.slice(0, 20).map((event) => <p key={event.id}>{formatEnterpriseDate(event.createdAt, locale)} · {event.summary}</p>)}</div> : null}</div> : null}
    </Dialog>
  </div>;
}

function Pager({ page, pageCount, setPage, en }: { page: number; pageCount: number; setPage: (value: number | ((value: number) => number)) => void; en: boolean }) {
  return <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>Page {page}/{pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>;
}

function ApprovalDialog({ open, onClose, title, organizationId, locale, en, busy, onSubmit }: { open: boolean; onClose: () => void; title: string; organizationId: string; locale?: string | null; en: boolean; busy: boolean; onSubmit: (approver: string) => void }) {
  return <Dialog open={open} onClose={onClose} title={title} presentation="editor"><form onSubmit={(event) => { event.preventDefault(); const approver = String(new FormData(event.currentTarget).get("approverUserId") || ""); if (approver) onSubmit(approver); }} className="grid gap-4"><Field label={en ? "Approver" : "Approbateur"}><EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_BUDGETS" locale={locale} disabled={busy} /></Field><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}><Send className="h-4 w-4" />{en ? "Submit" : "Soumettre"}</Button></div></form></Dialog>;
}

function RevisionDialog({ open, onClose, en, busy, onSubmit }: { open: boolean; onClose: () => void; en: boolean; busy: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (!open) setReason(""); }, [open]);
  return <Dialog open={open} onClose={onClose} title={en ? "Create budget revision" : "Créer une révision budgétaire"} presentation="editor"><div className="grid gap-4"><Field label={en ? "Revision reason" : "Motif de révision"}><textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm disabled:opacity-60" required /></Field><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{en ? "Cancel" : "Annuler"}</Button><Button disabled={busy || reason.trim().length < 2} onClick={() => onSubmit(reason.trim())}><FilePlus2 className="h-4 w-4" />{en ? "Create revision" : "Créer la révision"}</Button></div></div></Dialog>;
}