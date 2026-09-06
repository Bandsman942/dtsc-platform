"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { CheckCircle2, FileSpreadsheet, Plus, Scale, Send, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { FinanceReferenceSelect } from "@/components/enterprise/core-v2/finance-reference-select";
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
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

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
  periodStart: string;
  periodEnd: string;
  differenceAmount?: string | number | null;
  matchedAmount?: string | number | null;
  revision: number;
  capabilities?: RecordCapabilities;
  statementLines?: BankStatementLine[];
  matches?: Array<{ id: string; matchedAmount: string | number; status: string }>;
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

export function EnterpriseFinanceCashBankReconciliationWorkspaceHotfix(props: Props) {
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
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detail, setDetail] = useState<FinanceRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashSession | null>(null);
  const [validateTarget, setValidateTarget] = useState<CashSession | null>(null);
  const [matchTarget, setMatchTarget] = useState<Reconciliation | null>(null);
  const [actionTarget, setActionTarget] = useState<ReconciliationAction | null>(null);
  const [csvLines, setCsvLines] = useState<ParsedBankLine[]>([]);
  const [csvName, setCsvName] = useState("");
  const [reconciliationAccountId, setReconciliationAccountId] = useState("");
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
    refreshKey,
  });

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
    void loadExact(id).then((record) => { if (record) setDetail(record); }).catch((error) => setErrorMessage(safeFinanceError(error, t("cashDetailUnavailable"))));
  }, [isBank, isCash, loadExact, searchParams, t]);

  async function openDetail(record: FinanceRecord) {
    setErrorMessage("");
    try { setDetail(await loadExact(record.id) || record); }
    catch (error) { setDetail(record); setErrorMessage(safeFinanceError(error, t("cashDetailUnavailable"))); }
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
    } catch (error) { setErrorMessage(safeFinanceError(error, t("openingFailed"))); }
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
    } catch (error) { setErrorMessage(safeFinanceError(error, t("closeFailed"))); }
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
    } catch (error) { setErrorMessage(safeFinanceError(error, t("validationFailed"))); }
    finally { setBusy(false); }
  }

  async function onCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setCsvLines([]); setCsvName("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") || !["text/csv", "application/vnd.ms-excel", ""].includes(file.type)) { setErrorMessage(t("selectValidCsv")); return; }
    if (file.size > 5 * 1024 * 1024) { setErrorMessage(t("fileExceeds5Mb")); return; }
    try {
      const parsed = parseBankCsv(await file.text(), locale);
      if (parsed.length > 10_000) throw new Error(t("bankStatementTooManyRows"));
      setCsvLines(parsed); setCsvName(file.name); setErrorMessage("");
    } catch (error) { setErrorMessage(safeFinanceError(error, t("csvParsingFailed"))); }
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
    } catch (error) { setErrorMessage(safeFinanceError(error, t("importFailed"))); }
    finally { setBusy(false); }
  }

  async function createReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/reconciliations`, {
        financialAccountId: String(form.get("financialAccountId") || ""),
        bankStatementId: String(form.get("bankStatementId") || "") || undefined,
        periodStart: String(form.get("periodStart") || ""),
        periodEnd: String(form.get("periodEnd") || ""),
      });
      setCreateOpen(false); setReconciliationAccountId(""); mutationSuccess(t("reconciliationPrepared"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("creationFailed"))); }
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
    } catch (error) { setErrorMessage(safeFinanceError(error, t("matchingFailed"))); }
    finally { setBusy(false); }
  }

  async function reconciliationTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionTarget) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/reconciliations/${actionTarget.record.id}/complete`, {
        action: actionTarget.action,
        revision: actionTarget.record.revision,
        reason: String(form.get("reason") || "") || undefined,
        ...(actionTarget.action === "SUBMIT" ? { approverUserId: String(form.get("approverUserId") || "") } : {}),
      });
      setActionTarget(null); mutationSuccess(t("reconciliationCompleted"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("completionFailed"))); }
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
          {selectedRecon.capabilities?.canMatch ? <Button onClick={() => setMatchTarget(selectedRecon)}><Scale className="h-4 w-4" />{t("toReconcile")}</Button> : null}
          {selectedRecon.capabilities?.canSubmit ? <Button onClick={() => setActionTarget({ record: selectedRecon, action: "SUBMIT" })}><Send className="h-4 w-4" />{t("actionSubmit")}</Button> : null}
          {selectedRecon.capabilities?.canApprove ? <Button onClick={() => setActionTarget({ record: selectedRecon, action: "APPROVE" })}><CheckCircle2 className="h-4 w-4" />{t("actionApprove")}</Button> : null}
          {selectedRecon.capabilities?.canReject ? <Button variant="outline" onClick={() => setActionTarget({ record: selectedRecon, action: "REJECT" })}><XCircle className="h-4 w-4" />{t("actionReject")}</Button> : null}
        </div>
        <FinanceDetailGrid>
          <FinanceDetailValue label={t("reference")} value={selectedRecon.number || selectedRecon.id} />
          <FinanceDetailValue label={t("financialAccount")} value={selectedRecon.financialAccount ? `${selectedRecon.financialAccount.code} · ${selectedRecon.financialAccount.name}` : selectedRecon.financialAccountId} />
          <FinanceDetailValue label={t("bankStatement")} value={selectedRecon.bankStatement?.reference || "—"} />
          <FinanceDetailValue label={t("difference")} value={String(selectedRecon.differenceAmount ?? "—")} />
          <FinanceDetailValue label={t("revision")} value={String(selectedRecon.revision)} />
        </FinanceDetailGrid>
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
          <Field label={t("financialAccount")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_BANK" kind="financial-account" name="financialAccountId" label={t("financialAccount")} locale={rawLocale} required disabled={busy} /></Field>
          <Field label={t("currency")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_BANK" kind="currency" name="currencyCode" label={t("currency")} locale={rawLocale} required disabled={busy} /></Field>
          <Field label={t("bankStatement")}><Input name="reference" required maxLength={120} disabled={busy} /></Field>
          <Field label={t("date")}><Input name="statementDate" type="date" required disabled={busy} /></Field>
          <Field label={tx(locale, "Début de période", "Period start")}><Input name="periodStart" type="date" required disabled={busy} /></Field>
          <Field label={tx(locale, "Fin de période", "Period end")}><Input name="periodEnd" type="date" required disabled={busy} /></Field>
          <Field label={t("openingBalance")}><Input name="openingBalance" type="number" step="0.01" required disabled={busy} /></Field>
          <Field label={tx(locale, "Solde de clôture", "Closing balance")}><Input name="closingBalance" type="number" step="0.01" required disabled={busy} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("preview")}>
          <Input type="file" accept=".csv,text/csv" onChange={onCsv} disabled={busy} />
          <p className="text-sm text-dtsc-muted">{csvName || t("noFileAnalyzed")} · {csvLines.length} {t("linePlural")}</p>
        </ProfessionalFormSection>
        <Button type="submit" disabled={busy || !csvLines.length}><FileSpreadsheet className="h-4 w-4" />{t("confirmImport")}</Button>
      </form> : null}
      {!isCash && !isBank ? <form onSubmit={createReconciliation} className="grid gap-6">
        <ProfessionalFormSection title={t("scope")}>
          <Field label={t("financialAccount")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="financial-account" name="financialAccountId" label={t("financialAccount")} locale={rawLocale} required disabled={busy} onOptionChange={(option) => setReconciliationAccountId(option?.id || "")} /></Field>
          <Field label={t("bankStatement")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="bank-statement" name="bankStatementId" label={t("bankStatement")} locale={rawLocale} parentId={reconciliationAccountId || undefined} disabled={busy} /></Field>
          <Field label={tx(locale, "Début de période", "Period start")}><Input name="periodStart" type="date" required disabled={busy} /></Field>
          <Field label={tx(locale, "Fin de période", "Period end")}><Input name="periodEnd" type="date" required disabled={busy} /></Field>
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
          <Field label={tx(locale, "Ligne bancaire", "Bank line")}><NativeSelect name="bankStatementLineId" disabled={busy} items={[{ id: "", label: tx(locale, "Sélectionner…", "Select…") }, ...((matchTarget?.statementLines || []).filter((line) => line.id && line.reconciliationStatus === "UNMATCHED").map((line) => ({ id: line.id!, label: `${financeDate(line.transactionDate, locale)} · ${line.description}` })))]} /></Field>
          <Field label={tx(locale, "Paiement confirmé", "Confirmed payment")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="reconciliation-payment" name="paymentId" label={tx(locale, "paiement", "payment")} locale={rawLocale} parentId={matchTarget?.financialAccountId} disabled={busy} /></Field>
          <Field label={tx(locale, "Transaction de trésorerie", "Treasury transaction")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="treasury-transaction" name="treasuryTransactionId" label={tx(locale, "transaction", "transaction")} locale={rawLocale} parentId={matchTarget?.financialAccountId} disabled={busy} /></Field>
          <Field label={tx(locale, "Écriture comptable", "Journal entry")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" kind="journal-entry" name="journalEntryId" label={tx(locale, "écriture", "entry")} locale={rawLocale} parentId={matchTarget?.financialAccountId} disabled={busy} /></Field>
          <Field label={t("amount")}><Input name="matchedAmount" type="number" step="0.01" min="0.01" required disabled={busy} /></Field>
        </ProfessionalFormSection>
        <Button type="submit" disabled={busy}>{t("confirm")}</Button>
      </form>
    </Dialog>

    <Dialog open={Boolean(actionTarget)} onClose={() => { if (!busy) setActionTarget(null); }} title={actionTarget ? financeStatusLabel(actionTarget.action, locale) : ""} description={t("sodSelfApprovalBlocked")} presentation="editor">
      <form onSubmit={reconciliationTransition} className="grid gap-5">
        {actionTarget?.action === "SUBMIT" ? <EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_RECONCILIATION" locale={rawLocale} disabled={busy} /> : null}
        <Field label={t("reason")}><Input name="reason" required={actionTarget?.action === "REJECT"} maxLength={1000} disabled={busy} /></Field>
        <Button type="submit" disabled={busy}>{t("confirm")}</Button>
      </form>
    </Dialog>
  </ModuleWorkspace>;
}
