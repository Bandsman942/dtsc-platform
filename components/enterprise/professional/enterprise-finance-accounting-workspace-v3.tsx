"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, BookOpenCheck, ChevronRight, FilePlus2, Plus, RotateCcw, Search } from "lucide-react";
import { Field } from "@/components/enterprise/core-v2/erp-v2-ui";
import { FinanceAccountingReferenceSelect } from "@/components/enterprise/core-v2/finance-accounting-reference-select";
import { AccountingCompactTable, type AccountingCompactColumn } from "@/components/enterprise/professional/accounting-compact-table";
import { AccountingJournalWorkbench } from "@/components/enterprise/professional/accounting-journal-workbench";
import { AccountingRecordDetail, type AccountingRecordDetailKind } from "@/components/enterprise/professional/accounting-record-detail";
import { AssignedApprovalSubmitPanel } from "@/components/enterprise/professional/assigned-approval-submit-panel";
import { EnterpriseAccountingOnboardingPanel } from "@/components/enterprise/professional/enterprise-accounting-onboarding-panel";
import { ProfessionalError, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { financeDate, financeEnumLabel, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { financeMutation } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { type BusinessContextAction } from "@/components/workspace/context-actions";
import { FullscreenEntityDetail } from "@/components/workspace/fullscreen-entity-detail";
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
    id?: string;
    number?: string;
    accountingDate?: string;
    reference?: string | null;
    description?: string;
    functionalCurrencyCode?: string;
    sourceModule?: string | null;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
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
  code?: string;
  nameFr?: string;
  nameEn?: string;
  accountType?: string;
  functionalCurrencyCode?: string | null;
  openingBalance?: string | number;
  periodDebit?: string | number;
  periodCredit?: string | number;
  closingBalance?: string | number;
};
type OverviewPayload = { metrics?: Record<string, number>; charts?: Record<string, unknown>; range?: string };
type ListPayload<T = AnyRow> = { items?: T[]; pagination?: Pagination; functionalCurrencyCode?: string | null; period?: { dateFrom?: string | null; dateTo?: string | null } };
type EntryTracePayload = {
  entry?: JournalEntry & { lines?: LedgerRow[]; sourceModule?: string | null; sourceEntityId?: string | null };
  sourceLink?: { labelFr: string; labelEn: string; href: string; moduleCode: string } | null;
};
type ConfigFormState = { open: boolean; kind: ConfigCreatable | null };
type RecordDetailState = { kind: AccountingRecordDetailKind; row: AnyRow } | null;

const EMPTY_PAGINATION: Pagination = { page: 1, pageSize: 25, total: 0, pageCount: 1 };
const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"] as const;
const JOURNAL_TYPES = ["GENERAL", "SALES", "PURCHASES", "BANK", "CASH", "MOBILE_MONEY", "PAYROLL", "INVENTORY", "ASSETS", "ADJUSTMENT", "OPENING"] as const;
const FULLSCREEN_FORM_CLASS = "h-[100dvh] w-screen max-w-none rounded-none sm:h-[94dvh] sm:w-auto sm:max-w-3xl sm:rounded-3xl";

function rawText(value: unknown) { return value === null || value === undefined ? "" : String(value); }
function rowText(row: AnyRow, key: string) { return rawText(row[key]); }
function localizedName(row: AnyRow, locale: FinanceLocale) { return locale === "en" ? rowText(row, "nameEn") || rowText(row, "nameFr") : rowText(row, "nameFr") || rowText(row, "nameEn"); }
function dateQueryValue(date: string, end = false) { return date ? `${date}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : ""; }

export function EnterpriseFinanceAccountingWorkspaceV3(props: Props) {
  const { organizationId, organizationName, definition, locale: rawLocale, canCreate, canManage } = props;
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const en = locale === "en";
  const searchParams = useSearchParams();
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
  const [detailEntryRefreshKey, setDetailEntryRefreshKey] = useState(0);
  const [entryTrace, setEntryTrace] = useState<EntryTracePayload | null>(null);
  const [recordDetail, setRecordDetail] = useState<RecordDetailState>(null);
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
    const legacyTab = searchParams.get("tab");
    if (!legacyTab) return;
    if (legacyTab === "entries") setSpace("post");
    else if (legacyTab === "ledger" || legacyTab === "trial" || legacyTab === "anomalies") {
      setSpace("review");
      setReviewView(legacyTab === "ledger" ? "ledger" : legacyTab === "trial" ? "trial" : "anomalies");
    } else if (["setup", "charts", "accounts", "years", "periods", "journals", "rules"].includes(legacyTab)) {
      setSpace("configure");
      setConfigureView(legacyTab as ConfigureView);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setErrorMessage("");
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
        if (!cancelled) {
          setRows([]);
          setEntries([]);
          setPagination(EMPTY_PAGINATION);
          setErrorMessage(safeFinanceError(error, en ? "Accounting data is temporarily unavailable." : "Les données comptables sont momentanément indisponibles.", locale));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
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
      .catch((error) => {
        if (!cancelled) setErrorMessage(safeFinanceError(error, en ? "The journal entry could not be opened." : "L’écriture n’a pas pu être ouverte.", locale));
      });
    return () => { cancelled = true; };
  }, [detailEntryId, detailEntryRefreshKey, en, locale, organizationId]);

  function chooseSpace(next: Space) {
    setSpace(next);
    setPage(1);
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setRows([]);
    setEntries([]);
    setRecordDetail(null);
    setErrorMessage("");
  }

  async function submitApproval(approverUserId: string) {
    if (!approvalTarget) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/journal-entries/${approvalTarget.id}/transition`, { action: "SUBMIT", approverUserId, revision: approvalTarget.revision }, "POST");
      setApprovalTarget(null);
      reload(en ? "Journal entry submitted for approval." : "Écriture soumise pour validation.");
    } catch (error) {
      setErrorMessage(safeFinanceError(error, en ? "Submission failed." : "La soumission a échoué.", locale));
    } finally {
      setBusy(false);
    }
  }

  async function executeAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget || busy) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") || "").trim();
    const accountingDate = String(form.get("accountingDate") || "").trim();
    setBusy(true);
    setErrorMessage("");
    try {
      if (actionTarget.action === "REVERSE") {
        await financeMutation(`/api/enterprise/${organizationId}/journal-entries/${actionTarget.entry.id}/reverse`, { reason, accountingDate }, "POST");
      } else {
        await financeMutation(`/api/enterprise/${organizationId}/journal-entries/${actionTarget.entry.id}/transition`, { action: actionTarget.action, reason: reason || undefined, revision: actionTarget.entry.revision }, "POST");
      }
      const label = actionTarget.action === "APPROVE"
        ? (en ? "Journal entry approved." : "Écriture approuvée.")
        : actionTarget.action === "REJECT"
          ? (en ? "Journal entry rejected." : "Écriture rejetée.")
          : actionTarget.action === "POST"
            ? (en ? "Journal entry posted." : "Écriture comptabilisée.")
            : (en ? "Journal entry reversed." : "Écriture contrepassée.");
      setActionTarget(null);
      reload(label);
    } catch (error) {
      setErrorMessage(safeFinanceError(error, en ? "Accounting action failed." : "L’action comptable a échoué.", locale));
    } finally {
      setBusy(false);
    }
  }

  async function createConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const kind = configForm.kind;
    if (!kind || busy) return;
    const form = new FormData(event.currentTarget);
    const base = `/api/enterprise/${organizationId}`;
    setBusy(true);
    setErrorMessage("");
    try {
      if (kind === "charts") await financeMutation(`${base}/charts-of-accounts`, { code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || "") });
      if (kind === "accounts") await financeMutation(`${base}/ledger-accounts`, { chartId: String(form.get("chartId") || ""), code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || ""), accountType: String(form.get("accountType") || "ASSET"), currencyCode: String(form.get("currencyCode") || "") || undefined, allowDirectPosting: form.get("allowDirectPosting") === "on", isControlAccount: false, isSystemAccount: false });
      if (kind === "years") await financeMutation(`${base}/fiscal-years`, { code: String(form.get("code") || ""), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") });
      if (kind === "periods") await financeMutation(`${base}/fiscal-periods`, { fiscalYearId: String(form.get("fiscalYearId") || ""), code: String(form.get("code") || ""), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") });
      if (kind === "journals") await financeMutation(`${base}/journals`, { code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || ""), journalType: String(form.get("journalType") || "GENERAL"), sequencePrefix: String(form.get("sequencePrefix") || "") || undefined, requiresApproval: form.get("requiresApproval") === "on" });
      setConfigForm({ open: false, kind: null });
      reload(en ? "Accounting configuration saved." : "Configuration comptable enregistrée.");
    } catch (error) {
      setErrorMessage(safeFinanceError(error, en ? "Configuration could not be saved." : "La configuration n’a pas pu être enregistrée.", locale));
    } finally {
      setBusy(false);
    }
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
      [en ? "Draft entries" : "Écritures brouillon", Number(metrics.draftEntries || 0), "post"],
      [en ? "Pending approval" : "À valider", Number(metrics.pendingApproval || 0), "post"],
      [en ? "Posted entries" : "Comptabilisées", Number(metrics.postedEntries || 0), "review"],
      [en ? "Posting failures" : "Échecs de comptabilisation", Number(metrics.failedPostings || 0), "anomalies"],
      [en ? "Open periods" : "Périodes ouvertes", Number(metrics.openPeriods || 0), "configure"],
      [en ? "Active posting rules" : "Règles actives", Number(metrics.activePostingRules || 0), "rules"],
    ] as const;
  }, [en, overview.metrics]);

  const entryColumns: AccountingCompactColumn<JournalEntry>[] = [
    { key: "number", label: en ? "Entry" : "Écriture", render: (row) => <span className="font-black text-dtsc-blue">{row.number || row.reference || "—"}</span> },
    { key: "date", label: en ? "Date" : "Date", render: (row) => financeDate(row.accountingDate || "", locale) },
    { key: "journal", label: en ? "Journal" : "Journal", render: (row) => row.journal?.code || "—" },
    { key: "period", label: en ? "Period" : "Période", render: (row) => row.fiscalPeriod?.code || "—" },
    { key: "description", label: en ? "Description" : "Libellé", cellClassName: "max-w-[22rem] truncate", render: (row) => row.description || "—" },
    { key: "debit", label: en ? "Debit" : "Débit", numeric: true, render: (row) => financeMoney(row.totalDebit || 0, row.functionalCurrencyCode || "", locale) },
    { key: "status", label: en ? "Status" : "Statut", render: (row) => <StatusBadge tone={financeStatusTone(row.status || "")}>{financeStatusLabel(row.status || "", locale)}</StatusBadge> },
  ];

  const ledgerColumns: AccountingCompactColumn<LedgerRow>[] = [
    { key: "date", label: en ? "Date" : "Date", render: (row) => financeDate(row.journalEntry?.accountingDate || "", locale) },
    { key: "entry", label: en ? "Entry" : "Écriture", render: (row) => <span className="font-black text-dtsc-blue">{row.journalEntry?.number || "—"}</span> },
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
    { key: "event", label: en ? "Posting event" : "Événement", render: (row) => financeEnumLabel(rowText(row, "postingEvent"), locale) || "—" },
    { key: "error", label: en ? "Control" : "Contrôle", render: (row) => financeEnumLabel(rowText(row, "errorCode"), locale) || (en ? "Action required" : "Action requise") },
    { key: "created", label: en ? "Detected" : "Détectée", render: (row) => financeDate(rowText(row, "createdAt"), locale) },
    { key: "status", label: en ? "Status" : "Statut", render: (row) => <StatusBadge tone="danger">{financeStatusLabel(rowText(row, "status"), locale)}</StatusBadge> },
  ];

  const configColumns: AccountingCompactColumn<AnyRow>[] = [
    { key: "code", label: en ? "Code" : "Code", render: (row) => <span className="font-black">{rowText(row, "code") || (rowText(row, "mappingKey") ? financeEnumLabel(rowText(row, "mappingKey"), locale) : "—")}</span> },
    { key: "name", label: en ? "Label" : "Libellé", cellClassName: "max-w-[28rem] truncate", render: (row) => localizedName(row, locale) || rowText(row, "description") || (rowText(row, "sourceModule") ? financeEnumLabel(rowText(row, "sourceModule"), locale) : "—") },
    { key: "type", label: en ? "Type" : "Type", render: (row) => financeEnumLabel(rowText(row, "accountType") || rowText(row, "journalType") || rowText(row, "templateCode"), locale) || "—" },
    { key: "status", label: en ? "Status" : "Statut", render: (row) => {
      const currentStatus = rowText(row, "status") || (row.isActive === false ? "INACTIVE" : "ACTIVE");
      return <StatusBadge tone={financeStatusTone(currentStatus)}>{financeStatusLabel(currentStatus, locale)}</StatusBadge>;
    } },
  ];

  const entryDetailActions: BusinessContextAction[] = entryTrace?.entry ? [
    ...(entryTrace.entry.capabilities?.canSubmit ? [{ id: "submit", label: en ? "Submit for approval" : "Soumettre pour validation", onSelect: () => { setDetailEntryId(null); setApprovalTarget(entryTrace.entry || null); } }] : []),
    ...(entryTrace.entry.capabilities?.canApprove ? [{ id: "approve", label: en ? "Approve" : "Approuver", onSelect: () => { setDetailEntryId(null); setActionTarget({ entry: entryTrace.entry as JournalEntry, action: "APPROVE" }); } }] : []),
    ...(entryTrace.entry.capabilities?.canReject ? [{ id: "reject", label: en ? "Reject" : "Rejeter", destructive: true, onSelect: () => { setDetailEntryId(null); setActionTarget({ entry: entryTrace.entry as JournalEntry, action: "REJECT" }); } }] : []),
    ...(entryTrace.entry.capabilities?.canPost ? [{ id: "post", label: en ? "Post" : "Comptabiliser", onSelect: () => { setDetailEntryId(null); setActionTarget({ entry: entryTrace.entry as JournalEntry, action: "POST" }); } }] : []),
    ...(entryTrace.entry.capabilities?.canReverse ? [{ id: "reverse", label: en ? "Reverse" : "Contrepasser", destructive: true, separatorBefore: true, onSelect: () => { setDetailEntryId(null); setActionTarget({ entry: entryTrace.entry as JournalEntry, action: "REVERSE" }); } }] : []),
    { id: "refresh", label: en ? "Refresh" : "Actualiser", icon: RotateCcw, separatorBefore: true, onSelect: () => setDetailEntryRefreshKey((value) => value + 1) },
  ] : [];

  const hasToolbar = space !== "home" && !(space === "configure" && configureView === "setup");
  const workspaceTitle = en ? definition.labelEn || definition.labelFr : definition.labelFr || definition.labelEn;
  const configureOptions = (["setup", "charts", "accounts", "years", "periods", "journals", "rules"] as ConfigureView[]);
  const reviewOptions = (["ledger", "trial", "anomalies"] as ReviewView[]);

  return <ModuleWorkspace className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
    <ModuleHeader
      eyebrow={organizationName}
      title={workspaceTitle}
      description={en ? "A compact professional general-ledger workspace: post, review, control and configure from one accounting truth." : "Un espace de grand livre compact et professionnel : comptabiliser, consulter, contrôler et configurer depuis une seule vérité comptable."}
      primaryAction={canCreate ? <Button type="button" onClick={() => { setSpace("post"); setWorkbenchOpen(true); }}><FilePlus2 className="mr-2 h-4 w-4" />{en ? "New entry" : "Nouvelle écriture"}</Button> : null}
    />

    <nav aria-label={en ? "Accounting workspace" : "Espace Comptabilité"} className="grid grid-cols-2 gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page/70 p-2 sm:grid-cols-4">
      {spaceOptions.map((option) => <button key={option.id} type="button" onClick={() => chooseSpace(option.id)} aria-current={space === option.id ? "page" : undefined} className={`min-h-11 min-w-0 rounded-xl px-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${space === option.id ? "bg-dtsc-blue text-white shadow-sm" : "bg-dtsc-surface text-dtsc-ink hover:bg-dtsc-soft"}`}>{option.label}</button>)}
    </nav>

    {space === "review" ? <div data-horizontal-rail data-no-group-swipe className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-2">{reviewOptions.map((view) => <Button key={view} type="button" size="sm" variant={reviewView === view ? "default" : "outline"} className="min-h-11 min-w-[8rem] shrink-0 snap-start whitespace-normal px-3 py-2 text-center leading-tight" onClick={() => { setReviewView(view); setPage(1); setRecordDetail(null); }}>{view === "ledger" ? (en ? "General ledger" : "Grand livre") : view === "trial" ? (en ? "Trial balance" : "Balance") : (en ? "Anomalies" : "Anomalies")}</Button>)}</div> : null}
    {space === "configure" ? <div data-horizontal-rail data-no-group-swipe className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-2">{configureOptions.map((view) => <Button key={view} type="button" size="sm" variant={configureView === view ? "default" : "outline"} className="min-h-11 min-w-[8.5rem] shrink-0 snap-start whitespace-normal px-3 py-2 text-center leading-tight" onClick={() => { setConfigureView(view); setPage(1); setSearch(""); setRecordDetail(null); }}>{view === "setup" ? (en ? "Setup" : "Mise en service") : view === "charts" ? (en ? "Charts" : "Plans") : view === "accounts" ? (en ? "Accounts" : "Comptes") : view === "years" ? (en ? "Fiscal years" : "Exercices") : view === "periods" ? (en ? "Periods" : "Périodes") : view === "journals" ? (en ? "Journals" : "Journaux") : (en ? "Posting rules" : "Règles")}</Button>)}</div> : null}

    {hasToolbar ? <ModuleToolbar
      search={<label className="relative block min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={en ? "Search…" : "Rechercher…"} className="pl-9" /></label>}
      controls={<div className="flex min-w-0 flex-wrap items-end gap-2">{space === "review" && reviewView !== "anomalies" ? <><label className="grid min-w-0 gap-1 text-xs font-bold text-dtsc-muted">{en ? "From" : "Du"}<Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="h-10 w-full min-w-0 sm:w-40" /></label><label className="grid min-w-0 gap-1 text-xs font-bold text-dtsc-muted">{en ? "To" : "Au"}<Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="h-10 w-full min-w-0 sm:w-40" /></label></> : null}<Button type="button" variant="outline" size="sm" onClick={() => reload()}><RotateCcw className="mr-1.5 h-4 w-4" />{en ? "Refresh" : "Actualiser"}</Button>{space === "configure" && configureView !== "setup" && configureView !== "rules" && ((configureView === "charts" && canManage) || (configureView !== "charts" && canCreate)) ? <Button type="button" size="sm" onClick={() => setConfigForm({ open: true, kind: configureView as ConfigCreatable })}><Plus className="mr-1.5 h-4 w-4" />{en ? "Create" : "Créer"}</Button> : null}</div>}
      summary={pagination.total ? `${pagination.total} ${en ? "record(s)" : "élément(s)"}` : undefined}
    /> : null}

    {errorMessage ? <ProfessionalError message={errorMessage} /> : null}

    <ModuleContent className="space-y-5">
      {space === "home" ? <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{metricCards.map(([label, value, target]) => <button type="button" key={label} onClick={() => { if (target === "anomalies") { chooseSpace("review"); setReviewView("anomalies"); } else if (target === "rules") { chooseSpace("configure"); setConfigureView("rules"); } else if (target === "configure") { chooseSpace("configure"); setConfigureView("periods"); } else chooseSpace(target); }} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><span className="block text-xs font-black uppercase tracking-[0.05em] text-dtsc-muted">{label}</span><strong className="mt-2 block text-2xl font-black tabular-nums text-dtsc-ink">{value}</strong></button>)}</div>
        <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-5"><div className="flex items-start gap-3"><BookOpenCheck className="mt-0.5 h-5 w-5 text-cyan-600" /><div><h2 className="font-black text-dtsc-ink">{en ? "Accounting work queue" : "File de travail comptable"}</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">{en ? "Create entries, route them for independent approval, post them and inspect their source trace without leaving the ledger." : "Créez les écritures, affectez leur validation indépendante, comptabilisez-les et remontez à leur source sans quitter le grand livre."}</p><Button type="button" className="mt-4" onClick={() => chooseSpace("post")}>{en ? "Open work queue" : "Ouvrir la file"}<ChevronRight className="ml-2 h-4 w-4" /></Button></div></div></section><section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" /><div><h2 className="font-black text-dtsc-ink">{en ? "Controls and close readiness" : "Contrôles et préparation de clôture"}</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">{en ? "Review failed postings and the underlying ledger before financial close. Close remains managed by its dedicated entitlement." : "Analysez les échecs de comptabilisation et le grand livre avant la clôture. La clôture reste protégée par son entitlement dédié."}</p><Button type="button" variant="outline" className="mt-4" onClick={() => { chooseSpace("review"); setReviewView("anomalies"); }}>{en ? "Review anomalies" : "Voir les anomalies"}<ChevronRight className="ml-2 h-4 w-4" /></Button></div></div></section></div>
      </div> : null}

      {space === "post" ? loading ? <ProfessionalLoading /> : <AccountingCompactTable rows={entries} columns={entryColumns} rowKey={(row) => row.id} onRowClick={(row) => setDetailEntryId(row.id)} emptyLabel={en ? "No journal entry matches these filters." : "Aucune écriture ne correspond à ces filtres."} minWidth="min-w-[980px]" /> : null}

      {space === "review" ? loading ? <ProfessionalLoading /> : reviewView === "ledger" ? <AccountingCompactTable rows={rows as LedgerRow[]} columns={ledgerColumns} rowKey={(row) => row.id} onRowClick={(row) => row.journalEntry?.id && setDetailEntryId(row.journalEntry.id)} emptyLabel={en ? "No ledger movement in this scope." : "Aucun mouvement de grand livre sur ce périmètre."} minWidth="min-w-[1180px]" /> : reviewView === "trial" ? <AccountingCompactTable rows={rows as TrialRow[]} columns={trialColumns} rowKey={(row) => row.id} onRowClick={(row) => setRecordDetail({ kind: "trial", row })} emptyLabel={en ? "No balance in this scope." : "Aucun solde sur ce périmètre."} minWidth="min-w-[860px]" /> : <AccountingCompactTable rows={rows} columns={anomalyColumns} rowKey={(row) => row.id} onRowClick={(row) => setRecordDetail({ kind: "anomalies", row })} emptyLabel={en ? "No posting anomaly." : "Aucune anomalie de comptabilisation."} minWidth="min-w-[820px]" /> : null}

      {space === "configure" ? configureView === "setup" ? <EnterpriseAccountingOnboardingPanel organizationId={organizationId} locale={rawLocale} canManage={canManage} /> : loading ? <ProfessionalLoading /> : <AccountingCompactTable rows={rows} columns={configColumns} rowKey={(row) => row.id} onRowClick={(row) => setRecordDetail({ kind: configureView as AccountingRecordDetailKind, row })} emptyLabel={en ? "No configuration item in this scope." : "Aucun élément de configuration sur ce périmètre."} minWidth="min-w-[760px]" /> : null}

      {pagination.pageCount > 1 && space !== "home" && !(space === "configure" && configureView === "setup") ? <div className="flex items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page/60 px-3 py-2 text-xs font-bold text-dtsc-muted"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{en ? "Previous" : "Précédent"}</Button><span className="tabular-nums">{en ? "Page" : "Page"} {page} / {pagination.pageCount}</span><Button type="button" variant="outline" size="sm" disabled={page >= pagination.pageCount} onClick={() => setPage((value) => Math.min(pagination.pageCount, value + 1))}>{en ? "Next" : "Suivant"}</Button></div> : null}
    </ModuleContent>

    <AccountingJournalWorkbench open={workbenchOpen} organizationId={organizationId} locale={rawLocale} onClose={() => setWorkbenchOpen(false)} onCreated={() => reload()} />

    <Dialog open={Boolean(approvalTarget)} onClose={() => !busy && setApprovalTarget(null)} title={en ? "Submit journal entry" : "Soumettre l’écriture"} presentation="editor" className={FULLSCREEN_FORM_CLASS}>{approvalTarget ? <div className="p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5"><AssignedApprovalSubmitPanel organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" locale={rawLocale} submitting={busy} onSubmit={submitApproval} onCancel={() => setApprovalTarget(null)} /></div> : null}</Dialog>

    <Dialog open={Boolean(actionTarget)} onClose={() => !busy && setActionTarget(null)} title={actionTarget?.action === "APPROVE" ? (en ? "Approve journal entry" : "Approuver l’écriture") : actionTarget?.action === "REJECT" ? (en ? "Reject journal entry" : "Rejeter l’écriture") : actionTarget?.action === "POST" ? (en ? "Post journal entry" : "Comptabiliser l’écriture") : (en ? "Reverse journal entry" : "Contrepasser l’écriture")} presentation="editor" className={FULLSCREEN_FORM_CLASS}>{actionTarget ? <form onSubmit={executeAction} className="grid min-w-0 gap-4 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5"><div className="rounded-xl border border-dtsc-border bg-dtsc-page/70 p-4"><p className="font-black text-dtsc-ink">{actionTarget.entry.number || actionTarget.entry.reference}</p><p className="mt-1 text-sm text-dtsc-muted">{actionTarget.entry.description}</p></div>{actionTarget.action === "REVERSE" ? <Field label={en ? "Reversal date" : "Date de contrepassation"} help={en ? "Posting date used for the reversal entry." : "Date comptable utilisée pour l’écriture de contrepassation."}><Input type="date" name="accountingDate" required disabled={busy} defaultValue={new Date().toISOString().slice(0, 10)} /></Field> : null}{actionTarget.action === "REJECT" || actionTarget.action === "REVERSE" ? <Field label={en ? "Reason" : "Motif"} help={en ? "Explain the business reason recorded in the audit trail." : "Expliquez le motif métier conservé dans la piste d’audit."}><textarea name="reason" required minLength={actionTarget.action === "REVERSE" ? 8 : 4} maxLength={1000} disabled={busy} className="min-h-32 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 md:text-sm" /></Field> : null}<div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setActionTarget(null)}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}>{busy ? (en ? "Processing…" : "Traitement…") : (en ? "Confirm" : "Confirmer")}</Button></div></form> : null}</Dialog>

    <FullscreenEntityDetail
      open={Boolean(detailEntryId)}
      onClose={() => setDetailEntryId(null)}
      title={entryTrace?.entry ? `${entryTrace.entry.number || entryTrace.entry.reference || (en ? "Journal entry" : "Écriture")}` : (en ? "Journal entry trace" : "Traçabilité de l’écriture")}
      description={en ? "Full accounting trace and authorized contextual actions." : "Traçabilité comptable complète et actions contextuelles autorisées."}
      actions={entryDetailActions}
      actionLabel={en ? "Journal entry actions" : "Actions de l’écriture"}
    >
      {!entryTrace?.entry ? <ProfessionalLoading /> : <div className="grid min-w-0 gap-4"><div className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page/60 p-4 sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs font-black uppercase text-dtsc-muted">{en ? "Entry" : "Écriture"}</span><strong className="mt-1 block break-words text-dtsc-ink">{entryTrace.entry.number || "—"}</strong></div><div><span className="text-xs font-black uppercase text-dtsc-muted">{en ? "Date" : "Date"}</span><strong className="mt-1 block text-dtsc-ink">{financeDate(entryTrace.entry.accountingDate || "", locale)}</strong></div><div><span className="text-xs font-black uppercase text-dtsc-muted">{en ? "Status" : "Statut"}</span><div className="mt-1"><StatusBadge tone={financeStatusTone(entryTrace.entry.status || "")}>{financeStatusLabel(entryTrace.entry.status || "", locale)}</StatusBadge></div></div><div><span className="text-xs font-black uppercase text-dtsc-muted">{en ? "Source" : "Source"}</span>{entryTrace.sourceLink ? <Link href={entryTrace.sourceLink.href} className="mt-1 inline-flex items-center font-black text-dtsc-blue hover:underline">{en ? entryTrace.sourceLink.labelEn : entryTrace.sourceLink.labelFr}<ChevronRight className="ml-1 h-4 w-4" /></Link> : <span className="mt-1 block text-sm font-semibold text-dtsc-muted">{en ? "No authorized source link" : "Aucun lien source autorisé"}</span>}</div></div><AccountingCompactTable rows={(entryTrace.entry.lines || []) as LedgerRow[]} columns={ledgerColumns.filter((column) => !["date", "entry", "journal", "period"].includes(column.key))} rowKey={(row) => row.id} emptyLabel={en ? "No journal line." : "Aucune ligne comptable."} minWidth="min-w-[760px]" /></div>}
    </FullscreenEntityDetail>

    <AccountingRecordDetail
      organizationId={organizationId}
      locale={rawLocale}
      kind={recordDetail?.kind || null}
      record={recordDetail?.row || null}
      canManage={canManage}
      onClose={() => setRecordDetail(null)}
      onChanged={(success) => reload(success)}
      onError={setErrorMessage}
    />

    <Dialog open={configForm.open} onClose={() => !busy && setConfigForm({ open: false, kind: null })} title={configForm.kind ? configFormTitle(configForm.kind, en) : (en ? "Accounting configuration" : "Configuration comptable")} description={en ? "Complete only the fields persisted by the selected accounting object. References are constrained to this company." : "Renseignez uniquement les champs réellement persistés par l’objet comptable choisi. Les références sont limitées à cette entreprise."} presentation="editor" className={FULLSCREEN_FORM_CLASS}>
      <form onSubmit={createConfig} className="grid min-w-0 gap-5 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
        {configForm.kind === "accounts" ? <FormReferenceField label={en ? "Chart of accounts" : "Plan comptable"} help={en ? "Choose an active chart owned by this company." : "Choisissez un plan comptable actif appartenant à cette entreprise."}><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="chart" name="chartId" label={en ? "Chart of accounts" : "Plan comptable"} locale={rawLocale} required disabled={busy} status="ACTIVE" /></FormReferenceField> : null}
        {configForm.kind === "periods" ? <FormReferenceField label={en ? "Fiscal year" : "Exercice"} help={en ? "Choose the fiscal year that will own this period." : "Choisissez l’exercice auquel cette période sera rattachée."}><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="fiscal-year" name="fiscalYearId" label={en ? "Fiscal year" : "Exercice"} locale={rawLocale} required disabled={busy} /></FormReferenceField> : null}
        {configForm.kind ? <Field label={en ? "Code" : "Code"} help={configCodeHelp(configForm.kind, en)}><Input name="code" required maxLength={40} disabled={busy} /></Field> : null}
        {configForm.kind === "charts" || configForm.kind === "accounts" || configForm.kind === "journals" ? <><Field label={en ? "French label" : "Libellé français"} help={en ? "Business label shown in the French interface." : "Libellé métier affiché dans l’interface française."}><Input name="nameFr" required maxLength={180} disabled={busy} /></Field><Field label={en ? "English label" : "Libellé anglais"} help={en ? "Business label shown in the English interface." : "Libellé métier affiché dans l’interface anglaise."}><Input name="nameEn" required maxLength={180} disabled={busy} /></Field></> : null}
        {configForm.kind === "years" || configForm.kind === "periods" ? <div className="grid min-w-0 gap-4 sm:grid-cols-2"><Field label={en ? "Start date" : "Date de début"} help={configForm.kind === "years" ? (en ? "First day of the fiscal year." : "Premier jour de l’exercice comptable.") : (en ? "First day included in the accounting period." : "Premier jour inclus dans la période comptable.")}><Input name="startDate" type="date" required disabled={busy} /></Field><Field label={en ? "End date" : "Date de fin"} help={configForm.kind === "years" ? (en ? "Last day of the fiscal year." : "Dernier jour de l’exercice comptable.") : (en ? "Last day included in the accounting period." : "Dernier jour inclus dans la période comptable.")}><Input name="endDate" type="date" required disabled={busy} /></Field></div> : null}
        {configForm.kind === "accounts" ? <><Field label={en ? "Account type" : "Type de compte"} help={en ? "Controls the accounting nature and compatible postings." : "Détermine la nature comptable et les comptabilisations compatibles."}><select name="accountType" defaultValue="ASSET" className="h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base md:text-sm" disabled={busy}>{ACCOUNT_TYPES.map((value) => <option key={value} value={value}>{financeEnumLabel(value, locale)}</option>)}</select></Field><FormReferenceField label={en ? "Account currency (optional)" : "Devise du compte (facultatif)"} help={en ? "Leave empty to use the accounting functional currency." : "Laissez vide pour utiliser la devise fonctionnelle de la comptabilité."}><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="currency" name="currencyCode" label={en ? "Account currency (optional)" : "Devise du compte (facultatif)"} locale={rawLocale} disabled={busy} /></FormReferenceField><label className="flex min-h-11 items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-page/60 px-3 text-sm font-bold text-dtsc-ink"><input type="checkbox" name="allowDirectPosting" defaultChecked disabled={busy} />{en ? "Allow direct manual posting" : "Autoriser la saisie manuelle directe"}</label></> : null}
        {configForm.kind === "journals" ? <><Field label={en ? "Journal type" : "Type de journal"} help={en ? "Choose the operational family used by this journal." : "Choisissez la famille opérationnelle utilisée par ce journal."}><select name="journalType" defaultValue="GENERAL" className="h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base md:text-sm" disabled={busy}>{JOURNAL_TYPES.map((value) => <option key={value} value={value}>{financeEnumLabel(value, locale)}</option>)}</select></Field><Field label={en ? "Sequence prefix" : "Préfixe de séquence"} help={en ? "Optional readable prefix used by the journal numbering sequence." : "Préfixe lisible facultatif utilisé par la séquence de numérotation du journal."}><Input name="sequencePrefix" maxLength={20} disabled={busy} /></Field><label className="flex min-h-11 items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-page/60 px-3 text-sm font-bold text-dtsc-ink"><input type="checkbox" name="requiresApproval" disabled={busy} />{en ? "Require independent approval" : "Exiger une validation indépendante"}</label></> : null}
        <div data-responsive-actions className="flex min-w-0 flex-wrap justify-end gap-2 border-t border-dtsc-border pt-4"><Button type="button" variant="outline" disabled={busy} onClick={() => setConfigForm({ open: false, kind: null })}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={busy}>{busy ? (en ? "Saving…" : "Enregistrement…") : (en ? "Save" : "Enregistrer")}</Button></div>
      </form>
    </Dialog>
  </ModuleWorkspace>;
}

function configFormTitle(kind: ConfigCreatable, en: boolean) {
  if (kind === "charts") return en ? "Create chart of accounts" : "Créer un plan comptable";
  if (kind === "accounts") return en ? "Create ledger account" : "Créer un compte comptable";
  if (kind === "years") return en ? "Create fiscal year" : "Créer un exercice comptable";
  if (kind === "periods") return en ? "Create accounting period" : "Créer une période comptable";
  return en ? "Create journal" : "Créer un journal";
}

function configCodeHelp(kind: ConfigCreatable, en: boolean) {
  if (kind === "years") return en ? "Readable fiscal-year code, for example 2026." : "Code lisible de l’exercice, par exemple 2026.";
  if (kind === "periods") return en ? "Readable period code, for example 2026-01." : "Code lisible de la période, par exemple 2026-01.";
  if (kind === "journals") return en ? "Stable journal code, for example BANK or SALES." : "Code stable du journal, par exemple BANQUE ou VENTES.";
  if (kind === "accounts") return en ? "Account number defined by the selected chart." : "Numéro du compte défini dans le plan comptable sélectionné.";
  return en ? "Stable code used to identify this chart." : "Code stable utilisé pour identifier ce plan comptable.";
}

function FormReferenceField({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <div className="grid min-w-0 gap-1.5"><span className="text-xs font-black uppercase text-dtsc-muted">{label}<span aria-hidden="true" className="ml-1 text-red-500">*</span></span>{children}<p className="break-words text-sm leading-6 text-dtsc-muted">{help}</p></div>;
}
