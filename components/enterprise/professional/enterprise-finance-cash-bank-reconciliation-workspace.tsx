"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Banknote, CheckCircle2, FileSpreadsheet, LockKeyhole, Plus, Scale, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  FinanceCollaboration,
  FinanceDetailGrid,
  FinanceDetailValue,
  FinancePaginationControls,
  FinanceRecordList,
  financeMutation,
  useFinanceCollection,
  useFinanceLookups,
  type FinanceRecord,
} from "@/components/enterprise/professional/finance-professional-workspace-shared";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
} from "@/components/enterprise/professional/professional-erp-ui";
import {
  financeDate,
  financeMoney,
  financeStatusLabel,
  financeStatusTone,
  safeFinanceError,
  type FinanceLocale,
} from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

type CashSession = FinanceRecord & {
  financialAccountId: string;
  financialAccount?: { id: string; code: string; name: string; currencyCode: string };
  openingAmount: string | number;
  theoreticalClosingAmount?: string | number | null;
  countedClosingAmount?: string | number | null;
  discrepancyAmount?: string | number | null;
  openedAt: string;
  closedAt?: string | null;
  revision: number;
  _count?: { movements: number; counts: number; discrepancies: number };
};
type BankStatementLine = {
  id: string;
  transactionDate: string;
  valueDate?: string | null;
  description: string;
  reference?: string | null;
  counterparty?: string | null;
  debit: string | number;
  credit: string | number;
  runningBalance?: string | number | null;
  reconciliationStatus?: string;
};
type BankStatement = FinanceRecord & {
  reference: string;
  financialAccountId: string;
  financialAccount?: { id: string; code: string; name: string; currencyCode: string };
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  openingBalance: string | number;
  closingBalance: string | number;
  lines?: BankStatementLine[];
  _count?: { lines: number };
};
type Reconciliation = FinanceRecord & {
  financialAccountId: string;
  bankStatementId?: string | null;
  financialAccount?: { id: string; code: string; name: string; currencyCode: string };
  bankStatement?: BankStatement | null;
  periodStart: string;
  periodEnd: string;
  differenceAmount?: string | number;
  matchedAmount?: string | number;
  revision: number;
  matches?: Array<{
    id: string;
    bankStatementLineId?: string | null;
    paymentId?: string | null;
    treasuryTransactionId?: string | null;
    journalEntryId?: string | null;
    matchedAmount: string | number;
    status: string;
  }>;
  statementLines?: BankStatementLine[];
  _count?: { matches: number };
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

const cashT = (locale: FinanceLocale, key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);

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
  if (rows.length < 2) throw new Error(cashT(locale, "cashCsvNoRows"));
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
  if (indexes.transactionDate < 0 || indexes.description < 0 || (indexes.debit < 0 && indexes.credit < 0)) {
    throw new Error(cashT(locale, "cashCsvRequiredColumns"));
  }
  return rows.slice(1).map((row, rowIndex) => {
    const cells = parseCsvRow(row);
    const transactionDate = cells[indexes.transactionDate] || "";
    const description = safeText(cells[indexes.description] || "");
    if (!transactionDate || !description) throw new Error(`${rowIndex + 2}: ${cashT(locale, "lineIncomplete")}`);
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

export function EnterpriseFinanceCashBankReconciliationWorkspace({
  organizationId,
  organizationName,
  definition,
  locale: requestedLocale,
  canManage,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canManage: boolean;
}) {
  const locale: FinanceLocale = requestedLocale === "en" ? "en" : "fr";
  const t = (key: EnterpriseFinanceKey) => cashT(locale, key);
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashSession | null>(null);
  const [validateTarget, setValidateTarget] = useState<CashSession | null>(null);
  const [matchTarget, setMatchTarget] = useState<Reconciliation | null>(null);
  const [csvLines, setCsvLines] = useState<ParsedBankLine[]>([]);
  const [csvName, setCsvName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const endpoint = isCash ? "cash-sessions" : isBank ? "bank-statements" : "reconciliations";
  const effectiveStatus = status || (tab === "pending" ? (isCash ? "PENDING_VALIDATION" : "SUBMITTED") : tab === "open" ? "OPEN" : "");
  const collection = useFinanceCollection<FinanceRecord>({ endpoint: `/api/enterprise/${organizationId}/${endpoint}`, page, search, status: effectiveStatus, refreshKey });
  const lookupData = useFinanceLookups(organizationId, moduleCode, refreshKey);

  const openDetail = useCallback(async (record: FinanceRecord) => {
    if (isCash) { setDetail(record); return; }
    setDetailLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/${isBank ? "bank-statements" : "reconciliations"}/${record.id}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { statement?: BankStatement; reconciliation?: Reconciliation; message?: string; error?: string } | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || cashT(locale, "cashDetailUnavailable"));
      setDetail((isBank ? body.statement : body.reconciliation) || record);
    } catch (detailError) {
      setError(safeFinanceError(detailError, cashT(locale, "cashDetailUnavailable")));
      setDetail(record);
    } finally { setDetailLoading(false); }
  }, [isBank, isCash, locale, organizationId]);

  useEffect(() => {
    const key = isCash ? "cashSessionId" : isBank ? "statementId" : "reconciliationId";
    const deepId = searchParams.get(key);
    if (!deepId) return;
    const found = collection.items.find((item) => item.id === deepId);
    if (found) void openDetail(found);
  }, [collection.items, isBank, isCash, openDetail, searchParams]);

  async function openCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions`, { financialAccountId: String(form.get("financialAccountId") || ""), siteId: String(form.get("siteId") || "") || undefined, openingAmount: String(form.get("openingAmount") || "0") });
      setCreateOpen(false); setRefreshKey((value) => value + 1); setMessage(t("cashSessionOpened"));
    } catch (cashError) { setError(safeFinanceError(cashError, t("openingFailed"))); }
  }

  async function closeCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!closeTarget) return;
    const form = new FormData(event.currentTarget);
    const denominations = ["100", "50", "20", "10", "5", "1"];
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions/${closeTarget.id}/close`, {
        countedClosingAmount: String(form.get("countedClosingAmount") || "0"), closingReason: String(form.get("closingReason") || "") || undefined,
        counts: denominations.map((denomination) => ({ denomination, quantity: Number(form.get(`denomination_${denomination}`) || 0) })).filter((item) => item.quantity > 0), revision: closeTarget.revision,
      });
      setCloseTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("cashCloseSubmitted"));
    } catch (cashError) { setError(safeFinanceError(cashError, t("closeFailed"))); }
  }

  async function validateCashSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateTarget) return;
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/cash-sessions/${validateTarget.id}/validate`, { approve: form.get("approve") === "true", reason: String(form.get("reason") || "") || undefined, revision: validateTarget.revision });
      setValidateTarget(null); setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("cashDecisionRecorded"));
    } catch (cashError) { setError(safeFinanceError(cashError, t("validationFailed"))); }
  }

  async function onCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setCsvLines([]); setCsvName("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") || !["text/csv", "application/vnd.ms-excel", ""].includes(file.type)) { setError(t("selectValidCsv")); return; }
    if (file.size > 5 * 1024 * 1024) { setError(t("fileExceeds5Mb")); return; }
    try {
      const parsed = parseBankCsv(await file.text(), locale);
      if (parsed.length > 10_000) throw new Error(t("bankStatementTooManyRows"));
      setCsvLines(parsed); setCsvName(file.name); setError("");
    } catch (parseError) { setError(safeFinanceError(parseError, t("csvParsingFailed"))); }
  }

  async function importStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!csvLines.length) { setError(t("previewCsvBeforeConfirm")); return; }
    try {
      await financeMutation(`/api/enterprise/${organizationId}/bank-statements`, {
        financialAccountId: String(form.get("financialAccountId") || ""), reference: String(form.get("reference") || ""), statementDate: String(form.get("statementDate") || ""),
        periodStart: String(form.get("periodStart") || ""), periodEnd: String(form.get("periodEnd") || ""), currencyCode: String(form.get("currencyCode") || "USD").toUpperCase(),
        openingBalance: String(form.get("openingBalance") || "0"), closingBalance: String(form.get("closingBalance") || "0"), lines: csvLines,
      });
      setCreateOpen(false); setCsvLines([]); setCsvName(""); setRefreshKey((value) => value + 1); setMessage(t("statementImported"));
    } catch (bankError) { setError(safeFinanceError(bankError, t("importFailed"))); }
  }

  async function createReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/reconciliations`, { financialAccountId: String(form.get("financialAccountId") || ""), bankStatementId: String(form.get("bankStatementId") || "") || undefined, periodStart: String(form.get("periodStart") || ""), periodEnd: String(form.get("periodEnd") || "") });
      setCreateOpen(false); setRefreshKey((value) => value + 1); setMessage(t("reconciliationPrepared"));
    } catch (reconciliationError) { setError(safeFinanceError(reconciliationError, t("creationFailed"))); }
  }

  async function createMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matchTarget) return;
    const form = new FormData(event.currentTarget);
    try {
      await financeMutation(`/api/enterprise/${organizationId}/reconciliations/${matchTarget.id}/matches`, { bankStatementLineId: String(form.get("bankStatementLineId") || "") || undefined, paymentId: String(form.get("paymentId") || "") || undefined, matchedAmount: String(form.get("matchedAmount") || "0") });
      setMatchTarget(null); setRefreshKey((value) => value + 1); setMessage(t("matchRecorded"));
    } catch (matchError) { setError(safeFinanceError(matchError, t("matchingFailed"))); }
  }

  async function completeReconciliation(record: Reconciliation) {
    try {
      await financeMutation(`/api/enterprise/${organizationId}/reconciliations/${record.id}/complete`, { revision: record.revision });
      setDetail(null); setRefreshKey((value) => value + 1); setMessage(t("reconciliationCompleted"));
    } catch (completeError) { setError(safeFinanceError(completeError, t("completionFailed"))); }
  }

  const cashTabs = [{ id: "all", label: t("allSessions") }, { id: "open", label: t("openSessions") }, { id: "pending", label: t("toValidate") }, { id: "closed", label: t("closedSessions") }];
  const bankTabs = [{ id: "all", label: t("allStatements") }, { id: "pending", label: t("toReconcile") }];
  const reconciliationTabs = [{ id: "all", label: t("allSessions") }, { id: "pending", label: t("toValidate") }, { id: "closed", label: t("closedSessions") }];
  const tabs = isCash ? cashTabs : isBank ? bankTabs : reconciliationTabs;
  const openCount = collection.items.filter((item) => ["OPEN", "PREPARED", "IN_PROGRESS"].includes(String(item.status))).length;
  const pendingCount = collection.items.filter((item) => ["PENDING_VALIDATION", "SUBMITTED"].includes(String(item.status))).length;
  const cashAccounts = lookupData.accounts.filter((account) => account.accountType === "CASH");
  const bankAccounts = lookupData.accounts.filter((account) => account.accountType === "BANK");

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={`${t(isCash ? "cashOperations" : isBank ? "bankAndStatements" : "financialReconciliation")} · ${organizationName}`}
      title={t(isCash ? "professionalCash" : isBank ? "bankStatementsTitle" : "bankFinanceReconciliationTitle")}
      description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
      count={`${collection.pagination.total}`}
      primaryAction={canManage ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t(isCash ? "openCashSession" : isBank ? "importStatement" : "newReconciliation")}</Button> : undefined}
    />
    <ModuleMetrics label={t("operationalMetrics")}>
      <ModuleMetric label={t("total")} value={collection.pagination.total} />
      <ModuleMetric label={t("openLabel")} value={openCount} />
      <ModuleMetric label={t("toValidate")} value={pendingCount} />
      <ModuleMetric label={t("compatibleAccounts")} value={isCash ? cashAccounts.length : bankAccounts.length} />
    </ModuleMetrics>
    <ModuleToolbar
      search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("cashSearchPlaceholder")} />}
      controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={tabs} label={t("moduleViews")} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("allStatuses") }, ...["OPEN", "PENDING_VALIDATION", "VALIDATED", "CLOSED", "IMPORTED", "PREPARED", "IN_PROGRESS", "SUBMITTED", "COMPLETED"].map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} /></div>}
      summary={t("noReconciledLineReuse")}
    />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
      {error ? <ProfessionalError message={error} /> : null}
      {lookupData.error ? <ProfessionalError message={lookupData.error} /> : null}
      <ModuleSection title={tabs.find((item) => item.id === tab)?.label || ""} description={t(isCash ? "cashSectionDescription" : isBank ? "bankSectionDescription" : "reconciliationSectionDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : <FinanceRecordList items={collection.items} locale={locale} emptyTitle={t("noItem")} emptyDescription={t("createFirstOperationOrFilters")} onOpen={(record) => void openDetail(record)} />}
        <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} />
      </ModuleSection>
      <ProfessionalHelp moduleCode={moduleCode} />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t(isCash ? "openCashSessionTitle" : isBank ? "importBankStatementTitle" : "newReconciliation")} className="h-[94dvh] max-w-5xl">
      {isCash ? <form onSubmit={openCashSession} className="grid gap-5">
        <ProfessionalFormSection title={t("opening")}>
          <Field label={t("cashAccount")}><NativeSelect name="financialAccountId" required items={cashAccounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
          <Field label={t("site")}><NativeSelect name="siteId" items={lookupData.lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))} /></Field>
          <Field label={t("openingAmount")}><Input name="openingAmount" type="number" inputMode="decimal" min="0" step="0.01" required /></Field>
        </ProfessionalFormSection>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button><Button type="submit"><Banknote className="h-4 w-4" />{t("confirmOpening")}</Button></div>
      </form> : isBank ? <form onSubmit={importStatement} className="grid gap-6">
        <ProfessionalFormSection title={t("accountAndFile")}>
          <Field label={t("bankAccount")}><NativeSelect name="financialAccountId" required items={bankAccounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
          <Field label="CSV"><Input type="file" accept=".csv,text/csv" onChange={(event) => void onCsv(event)} required /></Field>
          <Field label={t("statementReference")}><Input name="reference" required /></Field>
          <Field label={t("currency")}><Input name="currencyCode" defaultValue="USD" maxLength={3} required /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("periodAndBalances")}>
          <Field label={t("statementDate")}><Input name="statementDate" type="date" required /></Field><Field label={t("start")}><Input name="periodStart" type="date" required /></Field><Field label={t("end")}><Input name="periodEnd" type="date" required /></Field>
          <Field label={t("openingBalance")}><Input name="openingBalance" type="number" inputMode="decimal" step="0.01" required /></Field><Field label={t("closingBalance")}><Input name="closingBalance" type="number" inputMode="decimal" step="0.01" required /></Field>
        </ProfessionalFormSection>
        <section className="rounded-xl border border-dtsc-border p-4"><div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-dtsc-blue" /><h3 className="font-black text-dtsc-ink">{t("preview")}</h3></div><p className="mt-2 text-sm text-dtsc-muted">{csvName ? `${csvName} · ${csvLines.length} ${t("linePlural")}` : t("noFileAnalyzed")}</p>{csvLines.length ? <div className="mt-3 max-h-48 overflow-y-auto"><BusinessList ariaLabel="CSV preview">{csvLines.slice(0, 20).map((line, index) => <BusinessListItem key={`${line.transactionDate}-${index}`} title={line.description} meta={`${line.transactionDate} · ${line.reference || "—"}`} status={<StatusBadge>{Number(line.credit) > 0 ? `+${line.credit}` : `-${line.debit}`}</StatusBadge>} />)}</BusinessList></div> : null}</section>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button><Button type="submit" disabled={!csvLines.length}>{t("confirmImport")}</Button></div>
      </form> : <form onSubmit={createReconciliation} className="grid gap-5">
        <ProfessionalFormSection title={t("scope")}>
          <Field label={t("bankAccount")}><NativeSelect name="financialAccountId" required items={bankAccounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${account.currencyCode}` }))} /></Field>
          <Field label={t("bankStatement")}><NativeSelect name="bankStatementId" items={lookupData.bankStatements.map((statement) => ({ id: statement.id, label: `${statement.reference} · ${financeDate(statement.statementDate, locale)} · ${statement.currencyCode}` }))} /></Field>
          <Field label={t("start")}><Input name="periodStart" type="date" required /></Field><Field label={t("end")}><Input name="periodEnd" type="date" required /></Field>
        </ProfessionalFormSection>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button><Button type="submit"><Scale className="h-4 w-4" />{t("prepare")}</Button></div>
      </form>}
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? String(detail.reference || detail.number || t("financeDetails")) : ""} className="h-[94dvh] max-w-5xl">
      {detailLoading ? <ProfessionalLoading /> : detail ? <div className="grid gap-5">
        <div className="flex flex-wrap gap-2">{detail.status ? <StatusBadge tone={financeStatusTone(detail.status)}>{financeStatusLabel(detail.status, locale)}</StatusBadge> : null}{detail.currencyCode ? <StatusBadge>{String(detail.currencyCode)}</StatusBadge> : null}</div>
        <FinanceDetailGrid>
          {detail.openingAmount !== undefined ? <FinanceDetailValue label={t("opening")}>{financeMoney(detail.openingAmount, String((detail as CashSession).financialAccount?.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.theoreticalClosingAmount !== undefined ? <FinanceDetailValue label={t("theoretical")}>{financeMoney(detail.theoreticalClosingAmount, String((detail as CashSession).financialAccount?.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.countedClosingAmount !== undefined ? <FinanceDetailValue label={t("counted")}>{financeMoney(detail.countedClosingAmount, String((detail as CashSession).financialAccount?.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.discrepancyAmount !== undefined ? <FinanceDetailValue label={t("variance")}>{financeMoney(detail.discrepancyAmount, String((detail as CashSession).financialAccount?.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.openingBalance !== undefined ? <FinanceDetailValue label={t("openingBalance")}>{financeMoney(detail.openingBalance, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.closingBalance !== undefined ? <FinanceDetailValue label={t("closingBalance")}>{financeMoney(detail.closingBalance, String(detail.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
          {detail.differenceAmount !== undefined ? <FinanceDetailValue label={t("difference")}>{financeMoney(detail.differenceAmount, String((detail as Reconciliation).financialAccount?.currencyCode || "USD"), locale)}</FinanceDetailValue> : null}
        </FinanceDetailGrid>
        {isBank && Array.isArray((detail as BankStatement).lines) ? <BusinessList ariaLabel={t("statementLines")}>{((detail as BankStatement).lines || []).map((line) => <BusinessListItem key={line.id} title={line.description} meta={`${financeDate(line.transactionDate, locale)} · ${line.reference || "—"}`} status={<StatusBadge tone={line.reconciliationStatus === "RECONCILED" ? "success" : "warning"}>{line.reconciliationStatus === "RECONCILED" ? t("reconciled") : financeMoney(Number(line.credit) - Number(line.debit), String(detail.currencyCode || "USD"), locale)}</StatusBadge>} />)}</BusinessList> : null}
        {!isCash && !isBank && Array.isArray((detail as Reconciliation).matches) ? <BusinessList ariaLabel={t("matches")}>{((detail as Reconciliation).matches || []).map((match) => <BusinessListItem key={match.id} title={t("financialMatch")} meta={financeMoney(match.matchedAmount, String((detail as Reconciliation).financialAccount?.currencyCode || "USD"), locale)} status={<StatusBadge tone={financeStatusTone(match.status)}>{financeStatusLabel(match.status, locale)}</StatusBadge>} />)}</BusinessList> : null}
        {canManage && isCash && detail.status === "OPEN" ? <Button onClick={() => setCloseTarget(detail as CashSession)}><LockKeyhole className="h-4 w-4" />{t("closeCashSession")}</Button> : null}
        {canManage && isCash && detail.status === "PENDING_VALIDATION" ? <Button onClick={() => setValidateTarget(detail as CashSession)}><ShieldCheck className="h-4 w-4" />{t("validateClose")}</Button> : null}
        {canManage && !isCash && !isBank && !["COMPLETED", "CLOSED"].includes(String(detail.status)) ? <div data-responsive-actions><Button onClick={() => setMatchTarget(detail as Reconciliation)}><Scale className="h-4 w-4" />{t("addMatch")}</Button><Button variant="outline" onClick={() => void completeReconciliation(detail as Reconciliation)}><CheckCircle2 className="h-4 w-4" />{t("completeReconciliation")}</Button></div> : null}
        <FinanceCollaboration organizationId={organizationId} moduleCode={moduleCode} record={detail} locale={locale} />
      </div> : null}
    </Dialog>

    <Dialog open={Boolean(closeTarget)} onClose={() => setCloseTarget(null)} title={t("cashCloseAssistant")} className="h-[90dvh] max-w-3xl">
      {closeTarget ? <form onSubmit={closeCashSession} className="grid gap-5"><ProfessionalFormSection title={t("physicalCount")}>
        {["100", "50", "20", "10", "5", "1"].map((denomination) => <Field key={denomination} label={`${t("notesCoinsOf")} ${denomination}`}><Input name={`denomination_${denomination}`} type="number" inputMode="numeric" min="0" defaultValue="0" /></Field>)}
        <Field label={t("physicalTotal")}><Input name="countedClosingAmount" type="number" inputMode="decimal" min="0" step="0.01" required /></Field>
        <Field label={t("varianceExplanation")}><textarea name="closingReason" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field>
      </ProfessionalFormSection><p className="text-sm text-dtsc-muted">{t("cashCloseSod")}</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCloseTarget(null)}>{t("cancel")}</Button><Button type="submit">{t("submitClose")}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(validateTarget)} onClose={() => setValidateTarget(null)} title={t("independentValidation")} className="max-w-xl">
      {validateTarget ? <form onSubmit={validateCashSession} className="grid gap-4"><Field label={t("decision")}><NativeSelect name="approve" required items={[{ id: "true", label: t("approveClose") }, { id: "false", label: t("rejectRequestCorrection") }]} /></Field><Field label={t("reason")}><textarea name="reason" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setValidateTarget(null)}>{t("cancel")}</Button><Button type="submit">{t("saveDecision")}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(matchTarget)} onClose={() => setMatchTarget(null)} title={t("newMatch")} description={t("matchDescription")} className="max-w-3xl">
      {matchTarget ? <form onSubmit={createMatch} className="grid gap-5"><ProfessionalFormSection title={t("lineAndOperation")}>
        <Field label={t("bankLine")}><NativeSelect name="bankStatementLineId" required items={(matchTarget.statementLines || []).filter((line) => line.reconciliationStatus !== "RECONCILED").map((line) => ({ id: line.id, label: `${financeDate(line.transactionDate, locale)} · ${line.description} · ${financeMoney(Number(line.credit) - Number(line.debit), matchTarget.financialAccount?.currencyCode || "USD", locale)}` }))} /></Field>
        <Field label={t("confirmedPayment")}><NativeSelect name="paymentId" required items={lookupData.payments.map((payment) => ({ id: payment.id, label: `${String(payment.number || payment.reference || t("payment"))} · ${financeMoney(payment.amount, String(payment.currencyCode || "USD"), locale)}` }))} /></Field>
        <Field label={t("matchedAmount")}><Input name="matchedAmount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></Field>
      </ProfessionalFormSection><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMatchTarget(null)}>{t("cancel")}</Button><Button type="submit">{t("saveMatch")}</Button></div></form> : null}
    </Dialog>
  </ModuleWorkspace>;
}
