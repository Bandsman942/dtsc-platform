"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { CheckCircle2, FileSpreadsheet, Plus, Scale, Send, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { FinanceReferenceSelect } from "@/components/enterprise/core-v2/finance-reference-select";
import { FinanceCriticalStepUpFields, performFinanceCriticalStepUp } from "@/components/enterprise/professional/finance-critical-step-up";
import { FinanceDateFilter, FinanceExportControls, type FinanceExportColumn } from "@/components/enterprise/professional/finance-design2-controls";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import {
  FinanceDetailGrid,
  FinanceDetailValue,
  FinancePaginationControls,
  FinanceRecordList,
  financeMutation,
  type FinanceRecord,
} from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { fetchOperationalFinanceRecord, useOperationalFinanceCollection } from "@/components/enterprise/professional/use-operational-finance-collection";
import { ProfessionalError, ProfessionalFormSection, ProfessionalHelp, ProfessionalLoading, ProfessionalSearch, ProfessionalTabs } from "@/components/enterprise/professional/professional-erp-ui";
import { financeDate, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { ReconciliationPhysicalCount } from "@/components/enterprise/professional/reconciliation-physical-count";
import { physicalCountTotal } from "@/lib/enterprise/accounting/physical-count";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";
import { downloadProfessionalCsv, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";

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

type RecordCapabilities = {
  canClose?: boolean;
  canValidate?: boolean;
  canMatch?: boolean;
  canCancel?: boolean;
  canSubmit?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
};

type CashSession = FinanceRecord & {
  financialAccountId: string;
  openingAmount: string | number;
  theoreticalClosingAmount?: string | number | null;
  countedClosingAmount?: string | number | null;
  discrepancyAmount?: string | number | null;
  openedAt: string;
  closedAt?: string | null;
  revision: number;
  capabilities?: RecordCapabilities;
  financialAccount?: { id: string; code: string; name: string; currencyCode: string } | null;
};

type BankStatementLine = {
  id?: string;
  transactionDate: string;
  valueDate?: string | null;
  description: string;
  reference?: string | null;
  counterparty?: string | null;
  debit: string | number;
  credit: string | number;
  runningBalance?: string | number | null;
  reconciliationStatus?: string | null;
  allocatedAmount?: string;
  remainingAmount?: string;
};

type BankStatement = FinanceRecord & {
  reference: string;
  financialAccountId: string;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  openingBalance: string | number;
  closingBalance: string | number;
  lines?: BankStatementLine[];
  financialAccount?: { id: string; code: string; name: string; currencyCode: string } | null;
};

type Reconciliation = FinanceRecord & {
  number?: string;
  financialAccountId: string;
  bankStatementId?: string | null;
  physicalEvidenceJson?: { physicalCount: string; evidenceReference: string; countedAt: string; counts?: Array<{denomination:string;quantity:number}>; currencyCode?:string } | null;
  periodStart: string;
  periodEnd: string;
  differenceAmount?: string | number | null;
  matchedAmount?: string | number | null;
  revision: number;
  capabilities?: RecordCapabilities;
  statementLines?: BankStatementLine[];
  matches?: Array<{ id: string; matchedAmount: string | number; status: string }>;
  exactSuggestions?: Array<{ bankStatementLineId: string; treasuryTransactionId: string; matchedAmount: string; reference: string; transactionDate: string; currencyCode: string }>;
  suggestionLimitExceeded?: boolean;
  financialAccount?: { id: string; code: string; name: string; currencyCode: string } | null;
  bankStatement?: { id: string; reference: string; currencyCode: string; closingBalance: string | number } | null;
};

type ParsedBankLine = {
  transactionDate: string;
  valueDate?: string;
  description: string;
  reference?: string;
  counterparty?: string;
  debit: string;
  credit: string;
  runningBalance?: string;
};

type ReconciliationAction = { record: Reconciliation; action: "SUBMIT" | "APPROVE" | "REJECT" };

type ViewTab = { id: string; label: string; status?: string };

const DENOMINATION_ROWS = 8;
const tFinance = (locale: FinanceLocale, key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);
const tx = (locale: FinanceLocale, fr: string, en: string) => locale === "en" ? en : fr;

function parseCsvRow(row: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"') {
      if (quoted && row[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if ((character === "," || character === ";") && !quoted) {
      values.push(current.trim());
      current = "";
    } else current += character;
  }
  values.push(current.trim());
  return values;
}

function safeText(value: string) {
  const trimmed = value.trim();
  return /^[=+@]/.test(trimmed) || /^-[^\d.,]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

function parseBankCsv(content: string, locale: FinanceLocale): ParsedBankLine[] {
  const rows = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((row) => row.trim());
  if (rows.length < 2) throw new Error(tFinance(locale, "cashCsvNoRows"));
  const headers = parseCsvRow(rows[0]).map((value) => value.toLowerCase().replace(/[\s_-]+/g, ""));
  const indexFor = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const indexes = {
    transactionDate: indexFor("date", "transactiondate", "datedoperation"),
    valueDate: indexFor("valuedate", "datedevaleur"),
    description: indexFor("description", "libelle", "label"),
    reference: indexFor("reference", "ref"),
    counterparty: indexFor("counterparty", "contrepartie", "tiers"),
    debit: indexFor("debit"),
    credit: indexFor("credit"),
    runningBalance: indexFor("balance", "solde", "runningbalance"),
  };
  if (indexes.transactionDate < 0 || indexes.description < 0 || (indexes.debit < 0 && indexes.credit < 0)) throw new Error(tFinance(locale, "cashCsvRequiredColumns"));
  return rows.slice(1).map((row, rowIndex) => {
    const cells = parseCsvRow(row);
    const transactionDate = cells[indexes.transactionDate] || "";
    const description = safeText(cells[indexes.description] || "");
    if (!transactionDate || !description) throw new Error(`${rowIndex + 2}: ${tFinance(locale, "lineIncomplete")}`);
    return {
      transactionDate,
      valueDate: indexes.valueDate >= 0 ? cells[indexes.valueDate] || undefined : undefined,
      description,
      reference: indexes.reference >= 0 ? safeText(cells[indexes.reference] || "") || undefined : undefined,
      counterparty: indexes.counterparty >= 0 ? safeText(cells[indexes.counterparty] || "") || undefined : undefined,
      debit: indexes.debit >= 0 ? (cells[indexes.debit] || "0").replace(/\s/g, "").replace(",", ".") : "0",
      credit: indexes.credit >= 0 ? (cells[indexes.credit] || "0").replace(/\s/g, "").replace(",", ".") : "0",
      runningBalance: indexes.runningBalance >= 0 ? (cells[indexes.runningBalance] || "").replace(/\s/g, "").replace(",", ".") || undefined : undefined,
    };
  });
}

function cashCounts(form: FormData) {
  const counts: Array<{ denomination: string; quantity: number }> = [];
  for (let index = 0; index < DENOMINATION_ROWS; index += 1) {
    const denomination = String(form.get(`denomination_${index}`) || "").trim();
    const quantity = Number(form.get(`quantity_${index}`) || 0);
    if (!denomination || !Number.isFinite(quantity) || quantity <= 0) continue;
    counts.push({ denomination, quantity: Math.trunc(quantity) });
  }
  const countedClosingAmount = counts.reduce((sum, item) => sum + Number(item.denomination) * item.quantity, 0).toFixed(6).replace(/\.?0+$/, "");
  return { counts, countedClosingAmount: countedClosingAmount || "0" };
}

export function EnterpriseFinanceCashBankReconciliationBase(props: Props) {
  const { organizationId, organizationName, definition, locale: rawLocale, canCreate } = props;
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const t = useCallback((key: EnterpriseFinanceKey) => tFinance(locale, key), [locale]);
  const moduleCode = definition.code as "FINANCE_CASH" | "FINANCE_BANK" | "FINANCE_RECONCILIATION";
  const isCash = moduleCode === "FINANCE_CASH";
  const isBank = moduleCode === "FINANCE_BANK";
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<FinanceRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashSession | null>(null);
  const [validateTarget, setValidateTarget] = useState<CashSession | null>(null);
  const [matchTarget, setMatchTarget] = useState<Reconciliation | null>(null);
  const [actionTarget, setActionTarget] = useState<ReconciliationAction | null>(null);
  const [cancelTarget,setCancelTarget]=useState<{record:Reconciliation;matchId?:string}|null>(null);
  const [csvLines, setCsvLines] = useState<ParsedBankLine[]>([]);
  const [csvName, setCsvName] = useState("");
  const [bankImportAccount,setBankImportAccount]=useState("");
  const [previewPage,setPreviewPage]=useState(1);
  const [reconciliationAccountId, setReconciliationAccountId] = useState("");
  const [physicalMode, setPhysicalMode] = useState(false);
  const [physicalCurrency,setPhysicalCurrency]=useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  useToastMessage(message, "success");
  useToastMessage(errorMessage, "error");

  const tabs = useMemo<ViewTab[]>(() => {
    if (isBank) return [
      { id: "all", label: t("allSessions") },
      { id: "imported", label: tx(locale, "Importés", "Imported"), status: "IMPORTED" },
    ];
    if (isCash) return [
      { id: "all", label: t("allSessions") },
      { id: "open", label: t("openSessions"), status: "OPEN" },
      { id: "pending", label: t("toValidate"), status: "PENDING_VALIDATION" },
      { id: "closed", label: t("closedSessions"), status: "CLOSED" },
    ];
    return [
      { id: "all", label: t("allSessions") },
      { id: "open", label: t("openSessions"), status: "OPEN" },
      { id: "pending", label: t("toValidate"), status: "PENDING_VALIDATION" },
      { id: "closed", label: t("closedSessions"), status: "COMPLETED" },
    ];
  }, [isBank, isCash, locale, t]);

  const endpoint = isCash ? "cash-sessions" : isBank ? "bank-statements" : "reconciliations";
  const tabStatus = tabs.find((item) => item.id === tab)?.status || "";
  const effectiveStatus = status || tabStatus;
  const collection = useOperationalFinanceCollection<FinanceRecord>({
    endpoint: `/api/enterprise/${organizationId}/${endpoint}`,
    page,
    search,
    status: effectiveStatus,
    filters: { dateFrom, dateTo },
    refreshKey,
  });
  const exportColumns: FinanceExportColumn[] = [
    { key: "reference", labelFr: "Référence", labelEn: "Reference", get: (row) => String(row.reference || row.number || row.code || row.id || "") },
    { key: "status", labelFr: "Statut", labelEn: "Status", get: (row) => financeStatusLabel(String(row.status || ""), locale) },
    { key: "date", labelFr: "Date", labelEn: "Date", get: (row) => financeDate(row.statementDate || row.periodStart || row.openedAt || row.createdAt, locale) },
    { key: "currency", labelFr: "Devise", labelEn: "Currency", get: (row) => String(row.currencyCode || "") },
    { key: "opening", labelFr: "Ouverture", labelEn: "Opening", get: (row) => String(row.openingBalance || row.openingAmount || "") },
    { key: "closing", labelFr: "Clôture", labelEn: "Closing", get: (row) => String(row.closingBalance || row.differenceAmount || "") },
  ];
  function downloadBankImportTemplate() {
    // CSV remains available for legacy statements; XLSX uses its own round-trip server template.
    const fields = ["transactionDate", "valueDate", "description", "reference", "counterparty", "debit", "credit", "runningBalance"];
    const model: ProfessionalReportExportModel = {
      title: tx(locale, "Modèle des lignes de relevé", "Bank statement lines template"), organizationName,
      filenameBase: "DTSC-modele-releve-bancaire", columns: fields.map((key) => ({ key, label: key })),
      rows: [], chart: [], insights: [], kpis: [],
    };
    downloadProfessionalCsv(model);
  }

  function downloadBankImportXlsx() {
    const query=new URLSearchParams({locale});
    if(bankImportAccount)query.set("financialAccountId",bankImportAccount);
    window.location.assign(`/api/enterprise/${organizationId}/bank-statements/template?${query}`);
  }

  const loadExact = useCallback(async (recordId: string) => {
    if (isCash) return fetchOperationalFinanceRecord<CashSession>(`/api/enterprise/${organizationId}/cash-sessions`, recordId);
    const response = await fetch(`/api/enterprise/${organizationId}/${isBank ? "bank-statements" : "reconciliations"}/${recordId}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { statement?: BankStatement; reconciliation?: Reconciliation; message?: string; error?: string } | null;
    if (!response.ok || !body) throw new Error(body?.message || body?.error || t("cashDetailUnavailable"));
    return (isBank ? body.statement : body.reconciliation) || null;
  }, [isBank, isCash, organizationId, t]);

  useEffect(() => {
    const key = isCash ? "cashSessionId" : isBank ? "statementId" : "reconciliationId";
    const id = searchParams.get(key);
    if (!id) return;
    void loadExact(id).then((record) => { if (record) setDetail(record); }).catch((error) => setErrorMessage(safeFinanceError(error, t("cashDetailUnavailable"), locale)));
  }, [isBank, isCash, loadExact, searchParams, t]);

  async function openDetail(record: FinanceRecord) {
    setErrorMessage("");
    try { setDetail(await loadExact(record.id) || record); }
    catch (error) { setDetail(record); setErrorMessage(safeFinanceError(error, t("cashDetailUnavailable"), locale)); }
  }

  function mutationSuccess(copy: string) {
    setDetail(null);
    setRefreshKey((value) => value + 1);
    setMessage(copy);
  }

  async function openCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions`, {
        financialAccountId: String(form.get("financialAccountId") || ""),
        siteId: String(form.get("siteId") || "") || undefined,
        openingAmount: String(form.get("openingAmount") || "0"),
      });
      setCreateOpen(false); mutationSuccess(t("cashSessionOpened"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("openingFailed"), locale)); }
    finally { setBusy(false); }
  }

  async function closeCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!closeTarget) return;
    const form = new FormData(event.currentTarget);
    const counted = cashCounts(form);
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions/${closeTarget.id}/close`, {
        countedClosingAmount: counted.countedClosingAmount,
        closingReason: String(form.get("closingReason") || "") || undefined,
        counts: counted.counts,
        revision: closeTarget.revision,
        approverUserId: String(form.get("approverUserId") || ""),
      });
      setCloseTarget(null); mutationSuccess(t("cashCloseSubmitted"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("closeFailed"), locale)); }
    finally { setBusy(false); }
  }

  async function validateCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateTarget) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions/${validateTarget.id}/validate`, {
        approve: String(form.get("decision") || "APPROVE") === "APPROVE",
        reason: String(form.get("reason") || "") || undefined,
        revision: validateTarget.revision,
      });
      setValidateTarget(null); mutationSuccess(t("cashDecisionRecorded"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("validationFailed"), locale)); }
    finally { setBusy(false); }
  }

  async function onCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setCsvLines([]); setCsvName("");setPreviewPage(1);
    if (!file) return;
    const isXlsx=file.name.toLowerCase().endsWith(".xlsx");
    if (!isXlsx && (!file.name.toLowerCase().endsWith(".csv") || !["text/csv", "application/vnd.ms-excel", ""].includes(file.type))) { setErrorMessage(tx(locale,"Sélectionnez un CSV ou un Excel .xlsx.","Select a CSV or .xlsx Excel file.")); return; }
    if (file.size > (isXlsx?2:5) * 1024 * 1024) { setErrorMessage(isXlsx?tx(locale,"Le fichier Excel dépasse 2 Mo.","Excel file exceeds 2 MB."):t("fileExceeds5Mb")); return; }
    setBusy(true);
    try {
      let parsed:ParsedBankLine[];
      if(isXlsx){
        const payload=new FormData();payload.set("file",file);
        const response=await fetch(`/api/enterprise/${organizationId}/bank-statements/template`,{method:"POST",body:payload,cache:"no-store"});
        const data=await response.json().catch(()=>null);
        if(!response.ok||!Array.isArray(data?.lines))throw new Error(data?.message||tx(locale,"Le fichier Excel ne peut pas être analysé.","Excel file could not be analyzed."));
        parsed=data.lines;
      }else parsed = parseBankCsv(await file.text(), locale);
      if (parsed.length > 10_000) throw new Error(t("bankStatementTooManyRows"));
      setCsvLines(parsed); setCsvName(file.name); setErrorMessage("");
    } catch (error) { setErrorMessage(safeFinanceError(error, t("csvParsingFailed"), locale)); }
    finally {setBusy(false);}
  }

  async function importStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csvLines.length) { setErrorMessage(t("previewCsvBeforeConfirm")); return; }
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/bank-statements`, {
        financialAccountId: String(form.get("financialAccountId") || ""),
        reference: String(form.get("reference") || ""),
        statementDate: String(form.get("statementDate") || ""),
        periodStart: String(form.get("periodStart") || ""),
        periodEnd: String(form.get("periodEnd") || ""),
        currencyCode: String(form.get("currencyCode") || "").toUpperCase(),
        openingBalance: String(form.get("openingBalance") || "0"),
        closingBalance: String(form.get("closingBalance") || "0"),
        lines: csvLines,
      });
      setCreateOpen(false); setCsvLines([]); setCsvName(""); mutationSuccess(t("statementImported"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("importFailed"), locale)); }
    finally { setBusy(false); }
  }

  async function createReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      const physicalCounts=physicalMode?JSON.parse(String(form.get("physicalCounts")||"null")):undefined;
      if(physicalMode&&(!physicalCounts||physicalCountTotal(physicalCounts)!==String(form.get("physicalCount")||"")))throw new Error("RECONCILIATION_COUNT_ROWS_INVALID");
      await financeMutation(`/api/enterprise/${organizationId}/reconciliations`, {
        financialAccountId: String(form.get("financialAccountId") || ""),
        bankStatementId: String(form.get("bankStatementId") || "") || undefined,
        periodStart: physicalMode ? new Date().toISOString() : String(form.get("periodStart") || ""),
        periodEnd: physicalMode ? new Date().toISOString() : String(form.get("periodEnd") || ""),
        ...(physicalMode ? {physicalCounts,physicalCount: String(form.get("physicalCount") || ""), evidenceReference: String(form.get("evidenceReference") || ""), attest: form.get("attest") === "on"} : {}),
      });
      setCreateOpen(false); setReconciliationAccountId(""); setPhysicalMode(false); mutationSuccess(t("reconciliationPrepared"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("creationFailed"), locale)); }
    finally { setBusy(false); }
  }

  async function matchReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matchTarget) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/reconciliations/${matchTarget.id}/matches`, {
        bankStatementLineId: String(form.get("bankStatementLineId") || "") || undefined,
        paymentId: String(form.get("paymentId") || "") || undefined,
        treasuryTransactionId: String(form.get("treasuryTransactionId") || "") || undefined,
        journalEntryId: String(form.get("journalEntryId") || "") || undefined,
        matchedAmount: String(form.get("matchedAmount") || "0"),
      });
      const refreshed = await loadExact(matchTarget.id);
      setMatchTarget(null); setDetail(refreshed); setRefreshKey((value) => value + 1); setMessage(t("matchRecorded"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("matchingFailed"), locale)); }
    finally { setBusy(false); }
  }

  async function confirmExactSuggestion(record: Reconciliation, suggestion: NonNullable<Reconciliation["exactSuggestions"]>[number]) {
    if (busy || !record.capabilities?.canMatch) return;
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/reconciliations/${record.id}/matches`, {
        bankStatementLineId: suggestion.bankStatementLineId,
        treasuryTransactionId: suggestion.treasuryTransactionId,
        matchedAmount: suggestion.matchedAmount,
      });
      setDetail(await loadExact(record.id)); setRefreshKey(value => value + 1); setMessage(t("matchRecorded"));
    } catch (error) {
      setErrorMessage(safeFinanceError(error, t("matchingFailed"), locale));
    } finally { setBusy(false); }
  }

  async function cancelReservation(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!cancelTarget||busy)return;
    const form=new FormData(event.currentTarget);
    setBusy(true);setErrorMessage("");
    try{
      const response=await fetch(`/api/enterprise/${organizationId}/reconciliations/${cancelTarget.record.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:cancelTarget.record.revision,reason:String(form.get("reason")||""),matchId:cancelTarget.matchId})});
      const body=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(body?.message||tx(locale,"Annulation impossible.","Unable to cancel."));
      setDetail(await loadExact(cancelTarget.record.id));setCancelTarget(null);setRefreshKey(value=>value+1);setMessage(tx(locale,"Annulation enregistrée.","Cancellation recorded."));
    }catch(error){setErrorMessage(safeFinanceError(error, tx(locale,"Annulation impossible.","Unable to cancel."), locale));}
    finally{setBusy(false);}
  }
  async function reconciliationTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      if(actionTarget.record.physicalEvidenceJson && actionTarget.action === "APPROVE") await performFinanceCriticalStepUp(form,"APPROVE");
      await financeMutation(`/api/enterprise/${organizationId}/reconciliations/${actionTarget.record.id}/complete`, {
        action: actionTarget.action,
        revision: actionTarget.record.revision,
        reason: String(form.get("reason") || "") || undefined,
        ...(actionTarget.action === "SUBMIT" ? { approverUserId: String(form.get("approverUserId") || "") } : {}),
      });
      setActionTarget(null); mutationSuccess(t("reconciliationCompleted"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("completionFailed"), locale)); }
    finally { setBusy(false); }
  }

  const primaryLabel = isCash ? t("openCashSession") : isBank ? t("importStatement") : t("newReconciliation");
  const title = isCash ? t("professionalCash") : isBank ? t("bankStatementsTitle") : t("bankFinanceReconciliationTitle");
  const description = isCash ? t("cashSectionDescription") : isBank ? t("bankSectionDescription") : t("reconciliationSectionDescription");
  const selectedCash = isCash ? detail as CashSession | null : null;
  const selectedBank = isBank ? detail as BankStatement | null : null;
  const selectedRecon = !isCash && !isBank ? detail as Reconciliation | null : null;
  const statusItems = isBank
    ? ["IMPORTED", "RECONCILED"]
    : isCash
      ? ["OPEN", "PENDING_VALIDATION", "CLOSED", "REJECTED"]
      : ["DRAFT", "IN_PROGRESS", "PENDING_VALIDATION", "COMPLETED"];

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={`${isCash ? t("cashOperations") : isBank ? t("bankAndStatements") : t("financialReconciliation")} · ${organizationName}`}
      title={title}
      description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
      count={`${collection.pagination.total}`}
      primaryAction={canCreate ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{primaryLabel}</Button> : undefined}
    />
    <ModuleToolbar
      search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("cashSearchPlaceholder")} />}
      controls={<div className="grid min-w-0 gap-2">
        <ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); setStatus(""); setDetail(null); }} items={tabs.map(({ id, label }) => ({ id, label }))} label={t("moduleViews")} />
        <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("allStatuses") }, ...statusItems.map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} />
        <div className="flex min-w-0 flex-wrap items-end gap-2"><FinanceDateFilter locale={locale} from={dateFrom} to={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }} /><FinanceExportControls endpoint={`/api/enterprise/${organizationId}/${endpoint}`} organizationName={organizationName} title={title} locale={locale} filters={{ search, status: effectiveStatus, dateFrom, dateTo }} columns={exportColumns} disabled={collection.loading} />{isBank ? <Button type="button" size="sm" variant="outline" onClick={downloadBankImportTemplate}><FileSpreadsheet className="mr-1 h-4 w-4" />{tx(locale, "Modèle CSV", "CSV template")}</Button> : null}{isBank ? <Button type="button" size="sm" variant="outline" onClick={downloadBankImportXlsx}><FileSpreadsheet className="mr-1 h-4 w-4" />{tx(locale,"Modèle Excel","Excel template")}</Button> : null}</div>
      </div>}
      summary={isBank ? t("bankSectionDescription") : t("noReconciledLineReuse")}
    />
    <ModuleContent>
      <ModuleSection title={tabs.find((item) => item.id === tab)?.label || title} description={description}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : <FinanceRecordList items={collection.items} locale={locale} emptyTitle={t("noItem")} emptyDescription={t("createFirstOperationOrFilters")} onOpen={(record) => void openDetail(record)} />}
        <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} />
      </ModuleSection>
      <ProfessionalHelp moduleCode={moduleCode} />
    </ModuleContent>

    <Dialog open={Boolean(detail)} onClose={() => { if (!busy) setDetail(null); }} title={tx(locale, "Détail", "Details")} description={description} presentation="editor" className="max-w-4xl">
      {selectedCash ? <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={financeStatusTone(selectedCash.status)}>{financeStatusLabel(selectedCash.status, locale)}</StatusBadge>
          {selectedCash.capabilities?.canClose ? <Button onClick={() => setCloseTarget(selectedCash)}>{t("close")}</Button> : null}
          {selectedCash.capabilities?.canValidate ? <Button onClick={() => setValidateTarget(selectedCash)}><CheckCircle2 className="h-4 w-4" />{t("toValidate")}</Button> : null}
        </div>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("cashAccount")} value={selectedCash.financialAccount ? `${selectedCash.financialAccount.code} · ${selectedCash.financialAccount.name}` : selectedCash.financialAccountId} />
          <FinanceDetailValue label={t("openingAmount")} value={financeMoney(selectedCash.openingAmount, selectedCash.financialAccount?.currencyCode || "", locale)} />
          <FinanceDetailValue label={t("theoretical")} value={selectedCash.theoreticalClosingAmount == null ? "—" : financeMoney(selectedCash.theoreticalClosingAmount, selectedCash.financialAccount?.currencyCode || "", locale)} />
          <FinanceDetailValue label={t("counted")} value={selectedCash.countedClosingAmount == null ? "—" : financeMoney(selectedCash.countedClosingAmount, selectedCash.financialAccount?.currencyCode || "", locale)} />
          <FinanceDetailValue label={t("variance")} value={selectedCash.discrepancyAmount == null ? "—" : financeMoney(selectedCash.discrepancyAmount, selectedCash.financialAccount?.currencyCode || "", locale)} />
          <FinanceDetailValue label={t("date")} value={financeDate(selectedCash.openedAt, locale)} />
        </FinanceDetailGrid>
      </div> : null}
      {selectedBank ? <div className="grid gap-5">
        <StatusBadge tone={financeStatusTone(selectedBank.status)}>{financeStatusLabel(selectedBank.status, locale)}</StatusBadge>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("bankStatement")} value={selectedBank.reference} />
          <FinanceDetailValue label={t("financialAccount")} value={selectedBank.financialAccount ? `${selectedBank.financialAccount.code} · ${selectedBank.financialAccount.name}` : selectedBank.financialAccountId} />
          <FinanceDetailValue label={t("currency")} value={selectedBank.currencyCode} />
          <FinanceDetailValue label={t("date")} value={financeDate(selectedBank.statementDate, locale)} />
          <FinanceDetailValue label={t("openingBalance")} value={financeMoney(selectedBank.openingBalance, selectedBank.currencyCode, locale)} />
          <FinanceDetailValue label={t("total")} value={financeMoney(selectedBank.closingBalance, selectedBank.currencyCode, locale)} />
        </FinanceDetailGrid>
        <p className="text-sm text-dtsc-muted">{selectedBank.lines?.length || 0} {t("linePlural")}</p>
      </div> : null}
      {selectedRecon ? <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={financeStatusTone(selectedRecon.status)}>{financeStatusLabel(selectedRecon.status, locale)}</StatusBadge>
          {selectedRecon.capabilities?.canCancel ? <Button variant="outline" onClick={()=>{setCancelTarget({record:selectedRecon});setDetail(null);}}>{tx(locale,"Annuler le brouillon","Cancel draft")}</Button> : null}
          {selectedRecon.capabilities?.canMatch ? <Button onClick={() => setMatchTarget(selectedRecon)}><Scale className="h-4 w-4" />{t("toReconcile")}</Button> : null}
          {selectedRecon.capabilities?.canSubmit ? <Button onClick={() => setActionTarget({ record: selectedRecon, action: "SUBMIT" })}><Send className="h-4 w-4" />{t("actionSubmit")}</Button> : null}
          {selectedRecon.capabilities?.canApprove ? <Button onClick={() => setActionTarget({ record: selectedRecon, action: "APPROVE" })}><CheckCircle2 className="h-4 w-4" />{t("actionApprove")}</Button> : null}
          {selectedRecon.capabilities?.canReject ? <Button variant="outline" onClick={() => setActionTarget({ record: selectedRecon, action: "REJECT" })}><XCircle className="h-4 w-4" />{t("actionReject")}</Button> : null}
        </div>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("reference")} value={selectedRecon.number || selectedRecon.id} />
          <FinanceDetailValue label={t("financialAccount")} value={selectedRecon.financialAccount ? `${selectedRecon.financialAccount.code} · ${selectedRecon.financialAccount.name}` : selectedRecon.financialAccountId} />
          <FinanceDetailValue label={t("bankStatement")} value={selectedRecon.bankStatement?.reference || "—"} />
          {selectedRecon.physicalEvidenceJson ? <><FinanceDetailValue label={tx(locale,"Comptage physique","Physical count")} value={selectedRecon.physicalEvidenceJson.physicalCount} /><FinanceDetailValue label={tx(locale,"Justificatif","Evidence")} value={selectedRecon.physicalEvidenceJson.evidenceReference} /><FinanceDetailValue label={tx(locale,"Compté le","Counted at")} value={financeDate(selectedRecon.physicalEvidenceJson.countedAt,locale)} />{selectedRecon.physicalEvidenceJson.counts?.map(row=><FinanceDetailValue key={row.denomination} label={row.denomination+" "+(selectedRecon.physicalEvidenceJson?.currencyCode||"")} value={String(row.quantity)}/>)}</> : null}
          <FinanceDetailValue label={t("difference")} value={String(selectedRecon.differenceAmount ?? "—")} />
          <FinanceDetailValue label={t("revision")} value={String(selectedRecon.revision)} />
        </FinanceDetailGrid>
        {(selectedRecon.matches||[]).some(match=>match.status==="RESERVED")?<section className="grid gap-2 rounded-xl border border-dtsc-border p-3"><h3 className="font-semibold">{tx(locale,"Allocations réservées (avant approbation)","Reserved allocations (before approval)")}</h3>{(selectedRecon.matches||[]).filter(match=>match.status==="RESERVED").map(match=><div key={match.id} className="flex flex-wrap items-center justify-between gap-2"><span>{financeMoney(match.matchedAmount,selectedRecon.financialAccount?.currencyCode||"",locale)}</span>{selectedRecon.capabilities?.canCancel?<Button size="sm" variant="outline" onClick={()=>{setCancelTarget({record:selectedRecon,matchId:match.id});setDetail(null);}}>{tx(locale,"Libérer","Release")}</Button>:null}</div>)}</section>:null}
        {selectedRecon.capabilities?.canMatch && selectedRecon.bankStatementId ? <section className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <h3 className="font-black text-dtsc-ink">{tx(locale,"Correspondances exactes proposées","Suggested exact matches")}</h3>
          <p className="text-xs text-dtsc-muted">{tx(locale,"Référence, date, devise, sens et montant identiques; seules les correspondances uniques sont proposées. Chaque confirmation reste contrôlée par le serveur.","Identical reference, date, currency, direction and amount; only unique matches are suggested. The server rechecks each confirmation.")}</p>
          {selectedRecon.suggestionLimitExceeded ? <p role="status" className="text-sm text-dtsc-muted">{tx(locale,"Périmètre trop volumineux pour une analyse immédiate. Utilisez le rapprochement manuel.","This scope is too large for immediate analysis. Use manual matching.")}</p> : null}
          {!selectedRecon.suggestionLimitExceeded && !selectedRecon.exactSuggestions?.length ? <p className="text-sm text-dtsc-muted">{tx(locale,"Aucune correspondance exacte unique disponible.","No unique exact match available.")}</p> : null}
          {(selectedRecon.exactSuggestions || []).slice(0,25).map(suggestion => <div key={suggestion.bankStatementLineId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-dtsc-border p-3">
            <div className="min-w-0"><p className="break-words text-sm font-semibold text-dtsc-ink">{suggestion.reference}</p><p className="text-xs text-dtsc-muted">{financeDate(suggestion.transactionDate, locale)} · {financeMoney(suggestion.matchedAmount, suggestion.currencyCode, locale)}</p></div>
            <Button size="sm" disabled={busy} onClick={() => void confirmExactSuggestion(selectedRecon, suggestion)}>{t("confirm")}</Button>
          </div>)}
          {(selectedRecon.exactSuggestions?.length || 0) > 25 ? <p className="text-xs text-dtsc-muted">{tx(locale,"Les 25 premières suggestions sont affichées. La liste est recalculée après chaque confirmation.","The first 25 suggestions are displayed. The list refreshes after each confirmation.")}</p> : null}
        </section> : null}
      </div> : null}
    </Dialog>

    <Dialog open={createOpen} onClose={() => { if (!busy) { setCreateOpen(false); setCsvLines([]); setCsvName(""); setReconciliationAccountId(""); } }} title={primaryLabel} description={description} presentation="editor" className="max-w-4xl">
      {isCash ? <form onSubmit={openCashSession} className="grid gap-6">
        <ProfessionalFormSection title={t("opening")}>
          <Field label={t("cashAccount")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_CASH" kind="financial-account" name="financialAccountId" label={t("cashAccount")} locale={rawLocale} required disabled={busy} /></Field>
          <Field label={t("site")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_CASH" kind="site" name="siteId" label={t("site")} locale={rawLocale} disabled={busy} /></Field>
          <Field label={t("openingAmount")}><Input name="openingAmount" type="number" step="0.01" defaultValue="0" required disabled={busy} /></Field>
        </ProfessionalFormSection>
        <Button type="submit" disabled={busy}>{t("openCashSession")}</Button>
      </form> : null}
      {isBank ? <form onSubmit={importStatement} className="grid gap-6">
        <ProfessionalFormSection title={t("scope")}>
          <Field label={t("financialAccount")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_BANK" kind="financial-account" name="financialAccountId" label={t("financialAccount")} locale={rawLocale} required disabled={busy} onOptionChange={option=>setBankImportAccount(option?.id||"")} /></Field>
          <Field label={t("currency")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_BANK" kind="currency" name="currencyCode" label={t("currency")} locale={rawLocale} required disabled={busy} /></Field>
          <Field label={t("bankStatement")}><Input name="reference" required maxLength={120} disabled={busy} /></Field>
          <Field label={t("date")}><Input name="statementDate" type="date" required disabled={busy} /></Field>
          <Field label={tx(locale, "Début de période", "Period start")}><Input name="periodStart" type="date" required disabled={busy} /></Field>
          <Field label={tx(locale, "Fin de période", "Period end")}><Input name="periodEnd" type="date" required disabled={busy} /></Field>
          <Field label={t("openingBalance")}><Input name="openingBalance" type="number" step="0.01" required disabled={busy} /></Field>
          <Field label={tx(locale, "Solde de clôture", "Closing balance")}><Input name="closingBalance" type="number" step="0.01" required disabled={busy} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("preview")}>
          <div data-responsive-actions><Button type="button" variant="outline" disabled={busy} onClick={downloadBankImportTemplate}>{tx(locale,"Modèle CSV","CSV template")}</Button><Button type="button" variant="outline" disabled={busy} onClick={downloadBankImportXlsx}>{tx(locale,"Modèle Excel du compte","Account Excel template")}</Button></div>
          <Input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onCsv} disabled={busy} />
          <p className="text-sm text-dtsc-muted">{csvName || t("noFileAnalyzed")} · {csvLines.length} {t("linePlural")}</p>
          {csvLines.length ? <div className="grid min-w-0 gap-2">
            {csvLines.slice((previewPage-1)*20,previewPage*20).map((line,index)=><div key={(previewPage-1)*20+index} className="grid min-w-0 gap-1 rounded-xl border border-dtsc-border p-3"><p className="break-words text-sm font-semibold">{line.description}</p><p className="break-words text-xs text-dtsc-muted">{line.transactionDate} · {line.reference||"—"} · {Number(line.credit)>0?"+ "+line.credit:"− "+line.debit}</p><p className="text-xs text-dtsc-muted">{tx(locale,"Solde courant","Running balance")}: {line.runningBalance??"—"}</p></div>)}
            <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" size="sm" variant="outline" disabled={previewPage===1} onClick={()=>setPreviewPage(page=>page-1)}>{tx(locale,"Précédent","Previous")}</Button><span className="text-xs">{previewPage} / {Math.ceil(csvLines.length/20)}</span><Button type="button" size="sm" variant="outline" disabled={previewPage*20>=csvLines.length} onClick={()=>setPreviewPage(page=>page+1)}>{tx(locale,"Suivant","Next")}</Button></div>
          </div>:null}
        </ProfessionalFormSection>
        <Button type="submit" disabled={busy || !csvLines.length}><FileSpreadsheet className="h-4 w-4" />{t("confirmImport")}</Button>
      </form> : null}
      {!isCash && !isBank ? <form onSubmit={createReconciliation} className="grid gap-6">
        <ProfessionalFormSection title={t("scope")}>
          <Field label={t("financialAccount")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="financial-account" name="financialAccountId" label={t("financialAccount")} locale={rawLocale} required disabled={busy} onOptionChange={(option) => {setReconciliationAccountId(option?.id || "");setPhysicalCurrency(option?.currency||"");setPhysicalMode(option?.accountType==="CASH");}} /></Field>
          <label className="flex items-center gap-2"><input type="checkbox" checked={physicalMode} onChange={e=>setPhysicalMode(e.target.checked)} disabled={busy} />{tx(locale,"Comptage physique global de caisse","Account-wide physical cash count")}</label>
          {physicalMode ? <>
            <p className="text-sm text-dtsc-muted">{tx(locale,"Comptez la totalité des fonds du compte, après clôture et qualification de toutes les sessions. Ne cumulez pas les déclarations des caissiers.","Count all funds held in the account after every session and variance is resolved. Do not sum cashier declarations.")}</p>
            {reconciliationAccountId&&physicalCurrency?<ReconciliationPhysicalCount key={reconciliationAccountId} organizationId={organizationId} accountId={reconciliationAccountId} currency={physicalCurrency} locale={locale} disabled={busy}/>:<p className="text-sm text-dtsc-muted">{tx(locale,"Choisissez un compte de caisse.","Select a cash account.")}</p>}
            <Field label={tx(locale,"Référence du procès-verbal","Count evidence reference")}><Input name="evidenceReference" minLength={3} maxLength={200} required disabled={busy}/></Field>
            <label className="flex gap-2"><input type="checkbox" name="attest" required disabled={busy}/>{tx(locale,"J'atteste le comptage physique intégral.","I attest the complete physical count.")}</label>
          </> : <>
          <Field label={t("bankStatement")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="bank-statement" name="bankStatementId" label={t("bankStatement")} locale={rawLocale} parentId={reconciliationAccountId || undefined} disabled={busy} /></Field>
          <Field label={tx(locale, "Début de période", "Period start")}><Input name="periodStart" type="date" required disabled={busy} /></Field>
          <Field label={tx(locale, "Fin de période", "Period end")}><Input name="periodEnd" type="date" required disabled={busy} /></Field>
          </>}
        </ProfessionalFormSection>
        <Button type="submit" disabled={busy}>{t("prepare")}</Button>
      </form> : null}
    </Dialog>

    <Dialog open={Boolean(closeTarget)} onClose={() => { if (!busy) setCloseTarget(null); }} title={t("close")} description={t("cashSectionDescription")} presentation="editor" className="max-w-3xl">
      <form onSubmit={closeCashSession} className="grid gap-6">
        <ProfessionalFormSection title={tx(locale, "Comptage physique", "Physical count")}>
          <p className="text-sm text-dtsc-muted">{tx(locale, "Saisissez les coupures ou pièces réellement comptées. Le total de clôture est calculé depuis ces lignes et revalidé par le serveur.", "Enter the denominations actually counted. The closing total is calculated from these rows and revalidated by the server.")}</p>
          <div className="grid gap-3">
            {Array.from({ length: DENOMINATION_ROWS }, (_, index) => <div key={index} className="grid gap-2 sm:grid-cols-2">
              <Field label={tx(locale, "Dénomination", "Denomination")}><Input name={`denomination_${index}`} type="number" step="0.01" min="0" disabled={busy} /></Field>
              <Field label={t("quantityShort")}><Input name={`quantity_${index}`} type="number" step="1" min="0" disabled={busy} /></Field>
            </div>)}
          </div>
          <Field label={t("reason")}><Input name="closingReason" maxLength={1000} disabled={busy} /></Field>
          <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_CASH" locale={rawLocale} disabled={busy} />
        </ProfessionalFormSection>
        <Button type="submit" disabled={busy}>{t("actionSubmit")}</Button>
      </form>
    </Dialog>

    <Dialog open={Boolean(validateTarget)} onClose={() => { if (!busy) setValidateTarget(null); }} title={t("toValidate")} description={t("sodSelfApprovalBlocked")} presentation="editor">
      <form onSubmit={validateCashSession} className="grid gap-5">
        <NativeSelect name="decision" defaultValue="APPROVE" disabled={busy} items={[{ id: "APPROVE", label: t("actionApprove") }, { id: "REJECT", label: t("actionReject") }]} />
        <Field label={t("reason")}><Input name="reason" maxLength={1000} disabled={busy} /></Field>
        <Button type="submit" disabled={busy}>{t("confirm")}</Button>
      </form>
    </Dialog>

    <Dialog open={Boolean(matchTarget)} onClose={() => { if (!busy) setMatchTarget(null); }} title={t("toReconcile")} description={t("noReconciledLineReuse")} presentation="editor" className="max-w-4xl">
      <form onSubmit={matchReconciliation} className="grid gap-6">
        <ProfessionalFormSection title={tx(locale, "Correspondance", "Match")}>
          <Field label={tx(locale, "Ligne bancaire", "Bank line")}><NativeSelect name="bankStatementLineId" disabled={busy} items={[{ id: "", label: tx(locale, "Sélectionner…", "Select…") }, ...((matchTarget?.statementLines || []).filter((line) => line.id && line.reconciliationStatus === "UNMATCHED" && Number(line.remainingAmount ?? 1)>0).map((line) => ({ id: line.id!, label: `${financeDate(line.transactionDate, locale)} · ${line.description} · ${tx(locale,"Reste","Remaining")}: ${line.remainingAmount ?? String(Number(line.credit) || Number(line.debit))}` })))]} /></Field>
          <Field label={tx(locale, "Paiement confirmé", "Confirmed payment")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="reconciliation-payment" name="paymentId" label={tx(locale, "paiement", "payment")} locale={rawLocale} parentId={matchTarget?.financialAccountId} disabled={busy} /></Field>
          <Field label={tx(locale, "Transaction de trésorerie", "Treasury transaction")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="treasury-transaction" name="treasuryTransactionId" label={tx(locale, "transaction", "transaction")} locale={rawLocale} parentId={matchTarget?.financialAccountId} disabled={busy} /></Field>
          <Field label={tx(locale, "Écriture comptable", "Journal entry")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="journal-entry" name="journalEntryId" label={tx(locale, "écriture", "entry")} locale={rawLocale} parentId={matchTarget?.financialAccountId} disabled={busy} /></Field>
          <Field label={t("amount")}><Input name="matchedAmount" type="number" step="0.000001" min="0.000001" required disabled={busy} /><p className="text-xs text-dtsc-muted">{tx(locale,"Saisissez la part à rapprocher. Une ligne ou une transaction peut recevoir plusieurs allocations jusqu’à son montant total.","Enter the portion to match. A statement line or transaction can receive multiple allocations up to its full amount.")}</p></Field>
        </ProfessionalFormSection>
        <Button type="submit" disabled={busy}>{t("confirm")}</Button>
      </form>
    </Dialog>

    <Dialog open={Boolean(cancelTarget)} onClose={()=>{if(!busy)setCancelTarget(null);}} title={tx(locale,"Annulation motivée","Cancellation with reason")} presentation="editor">
      <form onSubmit={cancelReservation} className="grid gap-4"><p className="text-sm text-dtsc-muted">{tx(locale,"Les réservations seront libérées sans modifier les soldes ni effacer l’historique.","Reservations are released without changing balances or deleting history.")}</p><Field label={t("reason")}><Input name="reason" minLength={4} maxLength={500} required disabled={busy}/></Field><Button type="submit" disabled={busy}>{t("confirm")}</Button></form>
    </Dialog>
    <Dialog open={Boolean(actionTarget)} onClose={() => { if (!busy) setActionTarget(null); }} title={actionTarget ? financeStatusLabel(actionTarget.action, locale) : ""} description={t("sodSelfApprovalBlocked")} presentation="editor">
      <form onSubmit={reconciliationTransition} className="grid gap-5">
        {actionTarget?.record.physicalEvidenceJson && actionTarget.action === "APPROVE" ? <FinanceCriticalStepUpFields action="APPROVE" locale={rawLocale} /> : null}
        {actionTarget?.action === "SUBMIT" ? <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" locale={rawLocale} disabled={busy} /> : null}
        <Field label={t("reason")}><Input name="reason" required={actionTarget?.action === "REJECT"} maxLength={1000} disabled={busy} /></Field>
        <Button type="submit" disabled={busy}>{t("confirm")}</Button>
      </form>
    </Dialog>
  </ModuleWorkspace>;
}
