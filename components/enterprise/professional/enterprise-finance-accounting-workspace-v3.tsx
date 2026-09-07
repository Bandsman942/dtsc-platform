"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, ChevronRight, FilePlus2, Plus, RotateCcw, Search, Settings2 } from "lucide-react";
import { AccountingCompactTable, type AccountingCompactColumn } from "@/components/enterprise/professional/accounting-compact-table";
import { AccountingJournalWorkbench } from "@/components/enterprise/professional/accounting-journal-workbench";
import { AssignedApprovalSubmitPanel } from "@/components/enterprise/professional/assigned-approval-submit-panel";
import { EnterpriseAccountingOnboardingPanel } from "@/components/enterprise/professional/enterprise-accounting-onboarding-panel";
import { FinanceAccountingReferenceSelect } from "@/components/enterprise/core-v2/finance-accounting-reference-select";
import { ProfessionalError, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { financeDate, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { financeMutation } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleContent, ModuleHeader, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Props = {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canCreate: boolean;
  canSubmit: boolean;
  canWrite: boolean;
  canApprove: boolean;
  canManage: boolean;
};

type Space = "home" | "post" | "review" | "configure";
type ReviewView = "ledger" | "trial" | "anomalies";
type ConfigureView = "setup" | "charts" | "accounts" | "years" | "periods" | "journals" | "rules";
type ConfigCreatable = Exclude<ConfigureView, "setup" | "rules">;

type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type AnyRow = Record<string, unknown> & { id: string };
type EntryCapabilities = { canSubmit?: boolean; canApprove?: boolean; canReject?: boolean; canPost?: boolean; canReverse?: boolean };
type JournalEntry = AnyRow & {
  number?: string;
  reference?: string | null;
  description?: string;
  status?: string;
  accountingDate?: string;
  totalDebit?: string | number;
  totalCredit?: string | number;
  functionalCurrencyCode?: string;
  revision?: number;
  journal?: { code?: string; nameFr?: string; nameEn?: string } | null;
  fiscalPeriod?: { code?: string } | null;
  capabilities?: EntryCapabilities;
};
type LedgerRow = AnyRow & {
  ledgerAccount?: { code?: string; nameFr?: string; nameEn?: string; accountType?: string };
  journalEntry?: {
    id?: string; number?: string; accountingDate?: string; reference?: string | null; description?: string;
    functionalCurrencyCode?: string; sourceModule?: string | null; sourceEntityType?: string | null; sourceEntityId?: string | null;
    journal?: { code?: string; nameFr?: string; nameEn?: string };
    fiscalPeriod?: { code?: string };
  };
  description?: string | null;
  debit?: string | number;
  credit?: string | number;
  transactionCurrencyCode?: string | null;
  transactionAmount?: string | number | null;
};
type TrialRow = AnyRow & {
  code?: string; nameFr?: string; nameEn?: string; accountType?: string;
  functionalCurrencyCode?: string | null;
  openingBalance?: string | number; periodDebit?: string | number; periodCredit?: string | number; closingBalance?: string | number;
};
type OverviewPayload = { metrics?: Record<string, number>; charts?: Record<string, unknown>; range?: string };
type ListPayload<T = AnyRow> = { items?: T[]; pagination?: Pagination; functionalCurrencyCode?: string | null; period?: { dateFrom?: string | null; dateTo?: string | null } };
type EntryTracePayload = { entry?: JournalEntry & { lines?: LedgerRow[]; sourceModule?: string | null; sourceEntityId?: string | null }; sourceLink?: { labelFr: string; labelEn: string; href: string; moduleCode: string } | null };

type ConfigFormState = { open: boolean; kind: ConfigCreatable | null };

const EMPTY_PAGINATION: Pagination = { page: 1, pageSize: 25, total: 0, pageCount: 1 };

function rawText(value: unknown) { return value === null || value === undefined ? "" : String(value); }
function rowText(row: AnyRow, key: string) { return rawText(row[key]); }
function localizedName(row: AnyRow, locale: FinanceLocale) { return locale === "en" ? rowText(row, "nameEn") || rowText(row, "nameFr") : rowText(row, "nameFr") || rowText(row, "nameEn"); }
function dateQueryValue(date: string, end = false) { return date ? `${date}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : ""; }

export function EnterpriseFinanceAccountingWorkspaceV3(props: Props) {
  const { organizationId, organizationName, definition, locale: rawLocale, canCreate, canWrite, canManage } = props;
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const en = locale === "en";
  const [space, setSpace] = useState<Space>("home");
  const [reviewView, setReviewView] = useState<ReviewView>("ledger");
  const [configureView, setConfigureView] = useState<ConfigureView>("setup");
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [overview, setOverview] = useState<OverviewPayload>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const [entryTrace, setEntryTrace] = useState<EntryTracePayload | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<JournalEntry | null>(null);
  const [actionTarget, setActionTarget] = useState<{ entry: JournalEntry; action: "APPROVE" | "REJECT" | "POST" | "REVERSE" } | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>({ open: false, kind: null });
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  useToastMessage(successMessage, "success");
  useToastMessage(errorMessage, "error");

  const reload = useCallback((success?: string) => {
    setRefreshKey((value) => value + 1);
    if (success) setSuccessMessage(success);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setErrorMessage("");
      try {
        if (space === "home") {
          const response = await fetch(`/api/enterprise/${organizationId}/accounting-professional?view=overview&range=90&page=1&pageSize=25`, { cache: "no-store", signal: controller.signal });
          const body = await response.json().catch(() => ({})) as OverviewPayload & { message?: string; error?: string };
          if (!response.ok) throw new Error(body.message || body.error || "ACCOUNTING_OVERVIEW_FAILED");
          if (!cancelled) { setOverview(body); setRows([]); setPagination(EMPTY_PAGINATION); }
          return;
        }
        if (space === "post") {
          const query = new URLSearchParams({ page: String(page), pageSize: "25" });
          if (search.trim()) query.set("search", search.trim());
          const response = await fetch(`/api/enterprise/${organizationId}/journal-entries?${query.toString()}`, { cache: "no-store", signal: controller.signal });
          const body = await response.json().catch(() => ({})) as ListPayload<JournalEntry> & { message?: string; error?: string };
          if (!response.ok) throw new Error(body.message || body.error || "JOURNAL_ENTRIES_FAILED");
          if (!cancelled) { setEntries(body.items || []); setRows([]); setPagination(body.pagination || EMPTY_PAGINATION); }
          return;
        }
        if (space === "review") {
          const query = new URLSearchParams({ view: reviewView === "ledger" ? "general-ledger" : reviewView === "trial" ? "trial-balance" : "anomalies", page: String(page), pageSize: "25" });
          if (search.trim()) query.set("search", search.trim());
          if (dateFrom) query.set("dateFrom", dateQueryValue(dateFrom));
          if (dateTo) query.set("dateTo", dateQueryValue(dateTo, true));
          const response = await fetch(`/api/enterprise/${organizationId}/accounting-query?${query.toString()}`, { cache: "no-store", signal: controller.signal });
          const body = await response.json().catch(() => ({})) as ListPayload & { message?: string; error?: string };
          if (!response.ok) throw new Error(body.message || body.error || "ACCOUNTING_QUERY_FAILED");
          if (!cancelled) { setRows(body.items || []); setEntries([]); setPagination(body.pagination || EMPTY_PAGINATION); }
          return;
        }
        if (configureView === "setup") { setRows([]); setPagination(EMPTY_PAGINATION); return; }
        const endpoint = configureView === "rules" ? "accounting-professional?view=posting-rules" : configureView === "charts" ? "charts-of-accounts" : configureView === "accounts" ? "ledger-accounts" : configureView === "years" ? "fiscal-years" : configureView === "periods" ? "fiscal-periods" : "journals";
        const separator = endpoint.includes("?") ? "&" : "?";
        const query = new URLSearchParams({ page: String(page), pageSize: "25" });
        if (search.trim()) query.set("search", search.trim());
        const response = await fetch(`/api/enterprise/${organizationId}/${endpoint}${separator}${query.toString()}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => ({})) as ListPayload & { message?: string; error?: string };
        if (!response.ok) throw new Error(body.message || body.error || "ACCOUNTING_CONFIGURATION_FAILED");
        if (!cancelled) { setRows(body.items || []); setEntries([]); setPagination(body.pagination || EMPTY_PAGINATION); }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) { setRows([]); setEntries([]); setPagination(EMPTY_PAGINATION); setErrorMessage(safeFinanceError(error, en ? "Accounting data is temporarily unavailable." : "Les données comptables sont momentanément indisponibles.", locale)); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [configureView, dateFrom, dateTo, en, locale, organizationId, page, refreshKey, reviewView, search, space]);

  useEffect(() => {
    if (!detailEntryId) { setEntryTrace(null); return; }
    let cancelled = false;
    setEntryTrace(null);
    fetch(`/api/enterprise/${organizationId}/accounting-query?view=entry-trace&entryId=${encodeURIComponent(detailEntryId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as EntryTracePayload & { message?: string; error?: string };
        if (!response.ok) throw new Error(body.message || body.error || "ENTRY_TRACE_FAILED");
        if (!cancelled) setEntryTrace(body);
      })
      .catch((error) => { if (!cancelled) setErrorMessage(safeFinanceError(error, en ? "The journal entry could not be opened." : "L’écriture n’a pas pu être ouverte.", locale)); });
    return () => { cancelled = true; };
  }, [detailEntryId, en, locale, organizationId]);

  function chooseSpace(next: Space) {
    setSpace(next); setPage(1); setSearch(""); setDateFrom(""); setDateTo(""); setRows([]); setEntries([]); setErrorMessage("");
  }

  async function submitApproval(approverUserId: string) {
    if (!approvalTarget) return;
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/journal-entries/${approvalTarget.id}/transition`, { action: "SUBMIT", approverUserId, revision: approvalTarget.revision }, "POST");
      setApprovalTarget(null); reload(en ? "Journal entry submitted for approval." : "Écriture soumise pour validation.");
    } catch (error) { setErrorMessage(safeFinanceError(error, en ? "Submission failed." : "La soumission a échoué.", locale)); }
    finally { setBusy(false); }
  }

  async function executeAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") || "").trim();
    const accountingDate = String(form.get("accountingDate") || "").trim();
    setBusy(true); setErrorMessage("");
    try {
      if (actionTarget.action === "REVERSE") {
        await financeMutation(`/api/enterprise/${organizationId}/journal-entries/${actionTarget.entry.id}/reverse`, { reason, accountingDate }, "POST");
      } else {
        await financeMutation(`/api/enterprise/${organizationId}/journal-entries/${actionTarget.entry.id}/transition`, { action: actionTarget.action, reason: reason || undefined, revision: actionTarget.entry.revision }, "POST");
      }
      const label = actionTarget.action === "APPROVE" ? (en ? "Journal entry approved." : "Écriture approuvée.") : actionTarget.action === "REJECT" ? (en ? "Journal entry rejected." : "Écriture rejetée.") : actionTarget.action === "POST" ? (en ? "Journal entry posted." : "Écriture comptabilisée.") : (en ? "Journal entry reversed." : "Écriture contrepassée.");
      setActionTarget(null); reload(label);
    } catch (error) { setErrorMessage(safeFinanceError(error, en ? "Accounting action failed." : "L’action comptable a échoué.", locale)); }
    finally { setBusy(false); }
  }

  async function createConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const kind = configForm.kind;
    if (!kind) return;
    const form = new FormData(event.currentTarget);
    const base = `/api/enterprise/${organizationId}`;
    setBusy(true); setErrorMessage("");
    try {
      if (kind === "charts") await financeMutation(`${base}/charts-of-accounts`, { code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || "") });
      if (kind === "accounts") await financeMutation(`${base}/ledger-accounts`, { chartId: String(form.get("chartId") || ""), code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || ""), accountType: String(form.get("accountType") || "ASSET"), currencyCode: String(form.get("currencyCode") || "") || undefined, allowDirectPosting: form.get("allowDirectPosting") === "on", isControlAccount: false, isSystemAccount: false });
      if (kind === "years") await financeMutation(`${base}/fiscal-years`, { code: String(form.get("code") || ""), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") });
      if (kind === "periods") await financeMutation(`${base}/fiscal-periods`, { fiscalYearId: String(form.get("fiscalYearId") || ""), code: String(form.get("code") || ""), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") });
      if (kind === "journals") await financeMutation(`${base}/journals`, { code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || ""), journalType: String(form.get("journalType") || "GENERAL"), sequencePrefix: String(form.get("sequencePrefix") || "") || undefined, requiresApproval: form.get("requiresApproval") === "on" });
      setConfigForm({ open: false, kind: null }); reload(en ? "Accounting configuration saved." : "Configuration comptable enregistrée.");
    } catch (error) { setErrorMessage(safeFinanceError(error, en ? "Configuration could not be saved." : "La configuration n’a pas pu être enregistrée.", locale)); }
    finally { setBusy(false); }
  }

  const spaceOptions = [
    { id: "home" as const, label: en ? "Home" : "Accueil" },
    { id: "post" as const, label: en ? "Post" : "Comptabiliser" },
    { id: "review" as const, label: en ? "Review" : "Consulter" },
    { id: "configure" as const, label: en ? "Configure" : "Configurer" },
  ];

  const metricCards = useMemo(() => {
    const metrics = overview.metrics || {};
    return [
      [en ? "Draft entries" : "Écritures brouillon", Number(metrics.draftEntries || 0)],
      [en ? "Pending approval" : "À valider", Number(metrics.pendingApproval || 0)],
      [en ? "Posted entries" : "Comptabilisées", Number(metrics.postedEntries || 0)],
      [en ? "Posting failures" : "Échecs de comptabilisation", Number(metrics.failedPostings || 0)],
      [en ? "Open periods" : "Périodes ouvertes", Number(metrics.openPeriods || 0)],
      [en ? "Active posting rules" : "Règles actives", Number(metrics.activePostingRules || 0)],
    ] as const;
  }, [en, overview.metrics]);

  const entryColumns: AccountingCompactColumn<JournalEntry>[] = [
    { key: "number", label: en ? "Entry" : "Écriture", render: (row) => <button type="button" className="font-black text-dtsc-blue hover:underline" onClick={() => setDetailEntryId(row.id)}>{row.number || row.reference || "—"}</button> },
    { key: "date", label: en ? "Date" : "Date", render: (row) => financeDate(row.accountingDate || "", locale) },
    { key: "journal", label: en ? "Journal" : "Journal", render: (row) => row.journal?.code || "—" },
    { key: "period", label: en ? "Period" : "Période", render: (row) => row.fiscalPeriod?.code || "—" },
    { key: "description", label: en ? "Description" : "Libellé", cellClassName: "max-w-[22rem] truncate", render: (row) => row.description || "—" },
    { key: "debit", label: en ? "Debit" : "Débit", numeric: true, render: (row) => financeMoney(row.totalDebit || 0, row.functionalCurrencyCode || "", locale) },
    { key: "status", label: en ? "Status" : "Statut", render: (row) => <StatusBadge label={financeStatusLabel(row.status || "", locale)} tone={financeStatusTone(row.status || "")} /> },
    { key: "actions", label: en ? "Actions" : "Actions", cellClassName: "whitespace-nowrap", render: (row) => <div className="flex justify-end gap-1">
      {row.capabilities?.canSubmit ? <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setApprovalTarget(row)}>{en ? "Submit" : "Soumettre"}</Button> : null}
      {row.capabilities?.canApprove ? <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setActionTarget({ entry: row, action: "APPROVE" })}>{en ? "Approve" : "Approuver"}</Button> : null}
      {row.capabilities?.canReject ? <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setActionTarget({ entry: row, action: "REJECT" })}>{en ? "Reject" : "Rejeter"}</Button> : null}
      {row.capabilities?.canPost ? <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setActionTarget({ entry: row, action: "POST" })}>{en ? "Post" : "Comptabiliser"}</Button> : null}
      {row.capabilities?.canReverse ? <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setActionTarget({ entry: row, action: "REVERSE" })}>{en ? "Reverse" : "Contrepasser"}</Button> : null}
    </div> },
  ];

  const ledgerColumns: AccountingCompactColumn<LedgerRow>[] = [
    { key: "date", label: en ? "Date" : "Date", render: (row) => financeDate(row.journalEntry?.accountingDate || "", locale) },
    { key: "entry", label: en ? "Entry" : "Écriture", render: (row) => <button type="button" className="font-black text-dtsc-blue hover:underline" onClick={() => row.journalEntry?.id && setDetailEntryId(row.journalEntry.id)}>{row.journalEntry?.number || "—"}</button> },
    { key: "account", label: en ? "Account" : "Compte", render: (row) => <span className="font-bold">{row.ledgerAccount?.code || "—"} · {locale === "en" ? row.ledgerAccount?.nameEn || row.ledgerAccount?.nameFr : row.ledgerAccount?.nameFr || row.ledgerAccount?.nameEn}</span> },
    { key: "description", label: en ? "Description" : "Libellé", cellClassName: "max-w-[24rem] truncate", render: (row) => row.description || row.journalEntry?.description || "—" },
    { key: "journal", label: en ? "Journal" : "Journal", render: (row) => row.journalEntry?.journal?.code || "—" },
    { key: "period", label: en ? "Period" : "Période", render: (row) => row.journalEntry?.fiscalPeriod?.code || "—" },
    { key: "debit", label: en ? "Debit" : "Débit", numeric: true, render: (row) => financeMoney(row.debit || 0, row.journalEntry?.functionalCurrencyCode || "", locale) },
    { key: "credit", label: en ? "Credit" : "Crédit", numeric: true, render: (row) => financeMoney(row.credit || 0, row.journalEntry?.functionalCurrencyCode || "", locale) },
  ];

  const trialColumns: AccountingCompactColumn<TrialRow>[] = [
    { key: "account", label: en ? "Account" : "Compte", render: (row) => <span className="font-black">{row.code || "—"} · {locale === "en" ? row.nameEn || row.nameFr : row.nameFr || row.nameEn}</span> },
    { key: "opening", label: en ? "Opening" : "Ouverture", numeric: true, render: (row) => financeMoney(row.openingBalance || 0, row.functionalCurrencyCode || "", locale) },
    { key: "debit", label: en ? "Period debit" : "Débit période", numeric: true, render: (row) => financeMoney(row.periodDebit || 0, row.functionalCurrencyCode || "", locale) },
    { key: "credit", label: en ? "Period credit" : "Crédit période", numeric: true, render: (row) => financeMoney(row.periodCredit || 0, row.functionalCurrencyCode || "", locale) },
    { key: "closing", label: en ? "Closing" : "Clôture", numeric: true, render: (row) => <strong>{financeMoney(row.closingBalance || 0, row.functionalCurrencyCode || "", locale)}</strong> },
  ];

  const anomalyColumns: AccountingCompactColumn<AnyRow>[] = [
    { key: "reference", label: en ? "Reference" : "Référence", render: (row) => <span className="font-black">{rowText(row, "reference") || "—"}</span> },
    { key: "event", label: en ? "Posting event" : "Événement", render: (row) => rowText(row, "postingEvent") || "—" },
    { key: "error", label: en ? "Control" : "Contrôle", render: (row) => rowText(row, "errorCode") || "—" },
    { key: "created", label: en ? "Detected" : "Détectée", render: (row) => financeDate(rowText(row, "createdAt"), locale) },
    { key: "status", label: en ? "Status" : "Statut", render: (row) => <StatusBadge label={financeStatusLabel(rowText(row, "status"), locale)} tone="danger" /> },
  ];

  const configColumns: AccountingCompactColumn<AnyRow>[] = [
    { key: "code", label: en ? "Code" : "Code", render: (row) => <span className="font-black">{rowText(row, "code") || rowText(row, "mappingKey") || "—"}</span> },
    { key: "name", label: en ? "Label" : "Libellé", cellClassName: "max-w-[28rem] truncate", render: (row) => localizedName(row, locale) || rowText(row, "description") || rowText(row, "sourceModule") || "—" },
    { key: "type", label: en ? "Type" : "Type", render: (row) => rowText(row, "accountType") || rowText(row, "journalType") || rowText(row, "templateCode") || "—" },
    { key: "status", label: en ? "Status" : "Statut", render: (row) => <StatusBadge label={financeStatusLabel(rowText(row, "status") || (row.isActive === false ? "INACTIVE" : "ACTIVE"), locale)} tone={financeStatusTone(rowText(row, "status") || (row.isActive === false ? "INACTIVE" : "ACTIVE"))} /> },
  ];

  const hasToolbar = space !== "home" && !(space === "configure" && configureView === "setup");

  return <ModuleWorkspace className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
    <ModuleHeader
      eyebrow={organizationName}
      title={definition.labelFr || (en ? "Accounting" : "Comptabilité")}
      description={en ? "A compact professional general-ledger workspace: post, review, control and configure from one accounting truth." : "Un espace de grand livre compact et professionnel : comptabiliser, consulter, contrôler et configurer depuis une seule vérité comptable."}
      primaryAction={canCreate ? <Button type="button" onClick={() => { setSpace("post"); setWorkbenchOpen(true); }}><FilePlus2 className="mr-2 h-4 w-4" />{en ? "New entry" : "Nouvelle écriture"}</Button> : null}
    />

    <nav aria-label={en ? "Accounting workspace" : "Espace Comptabilité"} className="grid grid-cols-2 gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page/70 p-2 sm:grid-cols-4">
      {spaceOptions.map((option) => <button key={option.id} type="button" onClick={() => chooseSpace(option.id)} aria-current={space === option.id ? "page" : undefined} className={`min-h-11 rounded-xl px-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${space === option.id ? "bg-dtsc-blue text-white shadow-sm" : "bg-dtsc-surface text-dtsc-ink hover:bg-dtsc-soft"}`}>{option.label}</button>)}
    </nav>

    {space === "review" ? <div className="flex gap-2 overflow-x-auto pb-1">{(["ledger", "trial", "anomalies"] as ReviewView[]).map((view) => <Button key={view} type="button" size="sm" variant={reviewView === view ? "default" : "outline"} onClick={() => { setReviewView(view); setPage(1); }}>{view === "ledger" ? (en ? "General ledger" : "Grand livre") : view === "trial" ? (en ? "Trial balance" : "Balance") : (en ? "Anomalies" : "Anomalies")}</Button>)}</div> : null}
    {space === "configure" ? <div className="flex gap-2 overflow-x-auto pb-1">{(["setup", "charts", "accounts", "years", "periods", "journals", "rules"] as ConfigureView[]).map((view) => <Button key={view} type="button" size="sm" variant={configureView === view ? "default" : "outline"} onClick={() => { setConfigureView(view); setPage(1); setSearch(""); }}>{view === "setup" ? (en ? "Setup" : "Mise en service") : view === "charts" ? (en ? "Charts" : "Plans") : view === "accounts" ? (en ? "Accounts" : "Comptes") : view === "years" ? (en ? "Fiscal years" : "Exercices") : view === "periods" ? (en ? "Periods" : "Périodes") : view === "journals" ? (en ? "Journals" : "Journaux") : (en ? "Posting rules" : "Règles")}</Button>)}</div> : null}

    {hasToolbar ? <ModuleToolbar
      search={<label className="relative block min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={en ? "Search…" : "Rechercher…"} className="pl-9" /></label>}
      controls={<div className="flex flex-wrap items-end gap-2">{space === "review" && reviewView !== "anomalies" ? <><label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "From" : "Du"}<Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="h-10 w-40" /></label><label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "To" : "Au"}<Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="h-10 w-40" /></label></> : null}<Button type="button" variant="outline" size="sm" onClick={() => reload()}><RotateCcw className="mr-1.5 h-4 w-4" />{en ? "Refresh" : "Actualiser"}</Button>{space === "configure" && configureView !== "setup" && configureView !== "rules" && ((configureView === "charts" && canManage) || (configureView !== "charts" && canCreate)) ? <Button type="button" size="sm" onClick={() => setConfigForm({ open: true, kind: configureView as ConfigCreatable })}><Plus className="mr-1.5 h-4 w-4" />{en ? "Create" : "Créer"}</Button> : null}</div>}
      summary={pagination.total ? `${pagination.total} ${en ? "record(s)" : "élément(s)"}` : undefined}
    /> : null}

    {errorMessage ? <ProfessionalError message={errorMessage} /> : null}

    <ModuleContent className="space-y-5">
      {space === "home" ? <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{metricCards.map(([label, value]) => <button type="button" key={label} onClick={() => label.includes(en ? "failure" : "Échec") ? chooseSpace("review") : label.includes(en ? "Draft" : "brouillon") || label.includes(en ? "Pending" : "valider") ? chooseSpace("post") : undefined} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><span className="block text-xs font-black uppercase tracking-[0.05em] text-dtsc-muted">{label}</span><strong className="mt-2 block text-2xl font-black tabular-nums text-dtsc-ink">{value}</strong></button>)}</div>
        <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-5"><div className="flex items-start gap-3"><BookOpenCheck className="mt-0.5 h-5 w-5 text-cyan-600" /><div><h2 className="font-black text-dtsc-ink">{en ? "Accounting work queue" : "File de travail comptable"}</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">{en ? "Create entries, route them for independent approval, post them and inspect their source trace without leaving the ledger." : "Créez les écritures, affectez leur validation indépendante, comptabilisez-les et remontez à leur source sans quitter le grand livre."}</p><Button type="button" className="mt-4" onClick={() => chooseSpace("post")}>{en ? "Open work queue" : "Ouvrir la file"}<ChevronRight className="ml-2 h-4 w-4" /></Button></div></div></section><section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" /><div><h2 className="font-black text-dtsc-ink">{en ? "Controls and close readiness" : "Contrôles et préparation de clôture"}</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">{en ? "Review failed postings and the underlying ledger before financial close. Close remains managed by its dedicated entitlement." : "Analysez les échecs de comptabilisation et le grand livre avant la clôture. La clôture reste protégée par son entitlement dédié."}</p><Button type="button" variant="outline" className="mt-4" onClick={() => { chooseSpace("review"); setReviewView("anomalies"); }}>{en ? "Review anomalies" : "Voir les anomalies"}<ChevronRight className="ml-2 h-4 w-4" /></Button></div></div></section></div>
      </div> : null}

      {space === "post" ? loading ? <ProfessionalLoading /> : <AccountingCompactTable rows={entries} columns={entryColumns} rowKey={(row) => row.id} emptyLabel={en ? "No journal entry matches these filters." : "Aucune écriture ne correspond à ces filtres."} minWidth="min-w-[1160px]" /> : null}

      {space === "review" ? loading ? <ProfessionalLoading /> : reviewView === "ledger" ? <AccountingCompactTable rows={rows as LedgerRow[]} columns={ledgerColumns} rowKey={(row) => row.id} emptyLabel={en ? "No ledger movement in this scope." : "Aucun mouvement de grand livre sur ce périmètre."} minWidth="min-w-[1180px]" /> : reviewView === "trial" ? <AccountingCompactTable rows={rows as TrialRow[]} columns={trialColumns} rowKey={(row) => row.id} emptyLabel={en ? "No balance in this scope." : "Aucun solde sur ce périmètre."} minWidth="min-w-[860px]" /> : <AccountingCompactTable rows={rows} columns={anomalyColumns} rowKey={(row) => row.id} emptyLabel={en ? "No posting anomaly." : "Aucune anomalie de comptabilisation."} minWidth="min-w-[820px]" /> : null}

      {space === "configure" ? configureView === "setup" ? <EnterpriseAccountingOnboardingPanel organizationId={organizationId} locale={rawLocale} /> : loading ? <ProfessionalLoading /> : <AccountingCompactTable rows={rows} columns={configColumns} rowKey={(row) => row.id} emptyLabel={en ? "No configuration item in this scope." : "Aucun élément de configuration sur ce périmètre."} minWidth="min-w-[760px]" /> : null}

      {pagination.pageCount > 1 && space !== "home" && !(space === "configure" && configureView === "setup") ? <div className="flex items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page/60 px-3 py-2 text-xs font-bold text-dtsc-muted"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{en ? "Previous" : "Précédent"}</Button><span className="tabular-nums">{en ? "Page" : "Page"} {page} / {pagination.pageCount}</span><Button type="button" variant="outline" size="sm" disabled={page >= pagination.pageCount} onClick={() => setPage((value) => Math.min(pagination.pageCount, value + 1))}>{en ? "Next" : "Suivant"}</Button></div> : null}
    </ModuleContent>

    <AccountingJournalWorkbench open={workbenchOpen} organizationId={organizationId} locale={rawLocale} onClose={() => setWorkbenchOpen(false)} onCreated={() => reload()} />

    <Dialog open={Boolean(approvalTarget)} onClose={() => !busy && setApprovalTarget(null)} title={en ? "Submit journal entry" : "Soumettre l’écriture"} presentation="editor" className="h-[92dvh] max-w-2xl">{approvalTarget ? <AssignedApprovalSubmitPanel organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" locale={rawLocale} submitting={busy} onSubmit={submitApproval} onCancel={() => setApprovalTarget(null)} /> : null}</Dialog>

    <Dialog open={Boolean(actionTarget)} onClose={() => !busy && setActionTarget(null)} title={actionTarget?.action === "APPROVE" ? (en ? "Approve journal entry" : "Approuver l’écriture") : actionTarget?.action === "REJECT" ? (en ? "Reject journal entry" : "Rejeter l’écriture") : actionTarget?.action === "POST" ? (en ? "Post journal entry" : "Comptabiliser l’écriture") : (en ? "Reverse journal entry" : "Contrepasser l’écriture")} presentation="editor" className="h-[90dvh] max-w-2xl">{actionTarget ? <form onSubmit={executeAction} className="grid gap-4"><div className="rounded-xl border border-dtsc-border bg-dtsc-page/70 p-4"><p className="font-black text-dtsc-ink">{actionTarget.entry.number || actionTarget.entry.reference}</p><p className="mt-1 text-sm text-dtsc-muted">{actionTarget.entry.description}</p></div>{actionTarget.action === "REVERSE" ? <label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Reversal date" : "Date de contrepassation"}<Input type="date" name="accountingDate" required disabled={busy} defaultValue={new Date().toISOString().slice(0, 10)} /></label> : null}{actionTarget.action === "REJECT" || actionTarget.action === "REVERSE" ? <label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Reason" : "Motif"}<textarea name="reason" required minLength={actionTarget.action === "REVERSE" ? 8 : 4} maxLength={1000} disabled={busy} className="min-h-32 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" /></label> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setActionTarget(null)}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}>{busy ? (en ? "Processing…" : "Traitement…") : (en ? "Confirm" : "Confirmer")}</Button></div></form> : null}</Dialog>

    <Dialog open={Boolean(detailEntryId)} onClose={() => setDetailEntryId(null)} title={en ? "Journal entry trace" : "Traçabilité de l’écriture"} presentation="editor" className="h-[94dvh] max-w-[min(1180px,calc(100vw-1rem))]">{!entryTrace?.entry ? <ProfessionalLoading /> : <div className="grid gap-4"><div className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page/60 p-4 sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs font-black uppercase text-dtsc-muted">{en ? "Entry" : "Écriture"}</span><strong className="mt-1 block text-dtsc-ink">{entryTrace.entry.number || "—"}</strong></div><div><span className="text-xs font-black uppercase text-dtsc-muted">{en ? "Date" : "Date"}</span><strong className="mt-1 block text-dtsc-ink">{financeDate(entryTrace.entry.accountingDate || "", locale)}</strong></div><div><span className="text-xs font-black uppercase text-dtsc-muted">{en ? "Status" : "Statut"}</span><div className="mt-1"><StatusBadge label={financeStatusLabel(entryTrace.entry.status || "", locale)} tone={financeStatusTone(entryTrace.entry.status || "")} /></div></div><div><span className="text-xs font-black uppercase text-dtsc-muted">{en ? "Source" : "Source"}</span>{entryTrace.sourceLink ? <Link href={entryTrace.sourceLink.href} className="mt-1 inline-flex items-center font-black text-dtsc-blue hover:underline">{en ? entryTrace.sourceLink.labelEn : entryTrace.sourceLink.labelFr}<ChevronRight className="ml-1 h-4 w-4" /></Link> : <span className="mt-1 block text-sm font-semibold text-dtsc-muted">{en ? "No authorized source link" : "Aucun lien source autorisé"}</span>}</div></div><AccountingCompactTable rows={(entryTrace.entry.lines || []) as LedgerRow[]} columns={ledgerColumns.filter((column) => !["date", "entry", "journal", "period"].includes(column.key))} rowKey={(row) => row.id} emptyLabel={en ? "No journal line." : "Aucune ligne comptable."} minWidth="min-w-[760px]" /></div>}</Dialog>

    <Dialog open={configForm.open} onClose={() => !busy && setConfigForm({ open: false, kind: null })} title={en ? "Accounting configuration" : "Configuration comptable"} presentation="editor" className="h-[94dvh] max-w-3xl"><form onSubmit={createConfig} className="grid gap-4">{configForm.kind === "accounts" ? <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="chart" name="chartId" label={en ? "Chart of accounts" : "Plan comptable"} locale={rawLocale} required disabled={busy} status="ACTIVE" /> : null}{configForm.kind === "periods" ? <FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="fiscal-year" name="fiscalYearId" label={en ? "Fiscal year" : "Exercice"} locale={rawLocale} required disabled={busy} /> : null}{configForm.kind === "accounts" || configForm.kind === "charts" || configForm.kind === "years" || configForm.kind === "periods" || configForm.kind === "journals" ? <label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Code" : "Code"}<Input name="code" required maxLength={40} disabled={busy} /></label> : null}{configForm.kind === "charts" || configForm.kind === "accounts" || configForm.kind === "journals" ? <><label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "French label" : "Libellé français"}<Input name="nameFr" required maxLength={180} disabled={busy} /></label><label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "English label" : "Libellé anglais"}<Input name="nameEn" required maxLength={180} disabled={busy} /></label></> : null}{configForm.kind === "years" || configForm.kind === "periods" ? <><label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Start date" : "Date de début"}<Input name="startDate" type="date" required disabled={busy} /></label><label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "End date" : "Date de fin"}<Input name="endDate" type="date" required disabled={busy} /></label></> : null}{configForm.kind === "accounts" ? <><label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Account type" : "Type de compte"}<select name="accountType" defaultValue="ASSET" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3" disabled={busy}>{["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="currency" name="currencyCode" label={en ? "Account currency (optional)" : "Devise du compte (facultatif)"} locale={rawLocale} disabled={busy} /><label className="flex min-h-11 items-center gap-2 text-sm font-bold text-dtsc-ink"><input type="checkbox" name="allowDirectPosting" defaultChecked />{en ? "Allow direct manual posting" : "Autoriser la saisie manuelle directe"}</label></> : null}{configForm.kind === "journals" ? <><label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Journal type" : "Type de journal"}<select name="journalType" defaultValue="GENERAL" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3" disabled={busy}>{["GENERAL", "SALES", "PURCHASES", "BANK", "CASH", "MOBILE_MONEY", "PAYROLL", "INVENTORY", "ASSETS", "ADJUSTMENT", "OPENING"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-2 text-sm font-bold text-dtsc-ink">{en ? "Sequence prefix" : "Préfixe de séquence"}<Input name="sequencePrefix" maxLength={20} disabled={busy} /></label><label className="flex min-h-11 items-center gap-2 text-sm font-bold text-dtsc-ink"><input type="checkbox" name="requiresApproval" />{en ? "Require independent approval" : "Exiger une validation indépendante"}</label></> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setConfigForm({ open: false, kind: null })}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}>{busy ? (en ? "Saving…" : "Enregistrement…") : (en ? "Save" : "Enregistrer")}</Button></div></form></Dialog>
  </ModuleWorkspace>;
}
