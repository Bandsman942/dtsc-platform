"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, CheckCircle2, Edit3, Plus, Send, ShieldCheck, XCircle } from "lucide-react";
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
import { financeDate, financeEnumLabel, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateEnterpriseTreasury, type EnterpriseTreasuryCopyKey } from "@/lib/i18n/enterprise-treasury";

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

type AccountCapabilities = { canEdit?: boolean; canArchive?: boolean };
type TransferCapabilities = { canApprove?: boolean; canReject?: boolean; canConfirm?: boolean };

type Account = FinanceRecord & {
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  maskedReference?: string | null;
  openingBalance: string | number;
  operationalBalance: string | number;
  reconciledBalance: string | number;
  availableBalance?: string | number | null;
  ledgerAccountId: string;
  responsibleUserId?: string | null;
  siteId?: string | null;
  revision: number;
  capabilities?: AccountCapabilities;
};

type Transfer = FinanceRecord & {
  number: string;
  sourceFinancialAccountId: string;
  targetFinancialAccountId: string;
  sourceCurrencyCode: string;
  targetCurrencyCode: string;
  sourceAmount: string | number;
  targetAmount: string | number;
  exchangeRate?: string | number | null;
  transferDate: string;
  revision: number;
  sourceFinancialAccount?: { id: string; code: string; name: string; accountType: string; currencyCode: string } | null;
  targetFinancialAccount?: { id: string; code: string; name: string; accountType: string; currencyCode: string } | null;
  approval?: { id: string; approverUserId: string; approverName: string; status: string; canAct: boolean } | null;
  capabilities?: TransferCapabilities;
};

type HistoryItem = FinanceRecord & {
  transactionType: string;
  direction: string;
  currencyCode: string;
  amount: string | number;
  transactionDate: string;
  reference?: string | null;
  reconciliationStatus?: string | null;
  financialAccount?: { id: string; code: string; name: string; accountType: string; currencyCode: string } | null;
  payment?: { id: string; number: string; status: string; paymentType: string } | null;
  transfer?: { id: string; number: string; status: string; exchangeRate?: string | number | null } | null;
};

type TransferPreview = {
  sourceAccount: { id: string; code: string; name: string; accountType: string; currencyCode: string; operationalBalance: string };
  targetAccount: { id: string; code: string; name: string; accountType: string; currencyCode: string; operationalBalance: string };
  sourceAmount: string;
  targetAmount: string;
  transferDate: string;
  exchangeRate: { value: string; rateId: string | null; rateDate: string; source: string; direction: string };
};

type TransferDraft = { sourceFinancialAccountId: string; targetFinancialAccountId: string; sourceAmount: string; transferDate: string };
type TransferAction = { record: Transfer; action: "APPROVE" | "REJECT" | "CONFIRM" };

type HistoryFilters = { accountId: string; transactionType: string; direction: string; currencyCode: string; from: string; to: string };
const EMPTY_HISTORY_FILTERS: HistoryFilters = { accountId: "", transactionType: "", direction: "", currencyCode: "", from: "", to: "" };

async function requestJson(endpoint: string, payload: unknown) {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => null) as { error?: string; message?: string; [key: string]: unknown } | null;
  if (!response.ok) throw new Error(body?.message || body?.error || "TREASURY_OPERATION_FAILED");
  return body || {};
}

export function EnterpriseFinanceTreasuryWorkspaceHotfix(props: Props) {
  const { organizationId, organizationName, definition, locale: rawLocale, canCreate } = props;
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const t = (key: EnterpriseTreasuryCopyKey) => translateEnterpriseTreasury(locale, key);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"accounts" | "transfers" | "history">((searchParams.get("tab") as "accounts" | "transfers" | "history") || "accounts");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>(EMPTY_HISTORY_FILTERS);
  const [detail, setDetail] = useState<FinanceRecord | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [transferPreview, setTransferPreview] = useState<TransferPreview | null>(null);
  const [transferDraft, setTransferDraft] = useState<TransferDraft | null>(null);
  const [transferAction, setTransferAction] = useState<TransferAction | null>(null);
  const [accountType, setAccountType] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  useToastMessage(message, "success");
  useToastMessage(errorMessage, "error");

  const endpoint = tab === "accounts" ? "financial-accounts" : tab === "transfers" ? "account-transfers" : "treasury-history";
  const filters = useMemo<Record<string, string | boolean | undefined>>(() => tab === "history" ? historyFilters : {}, [historyFilters, tab]);
  const collection = useOperationalFinanceCollection<FinanceRecord>({ endpoint: `/api/enterprise/${organizationId}/${endpoint}`, page, search, status, filters, refreshKey });

  useEffect(() => {
    const accountId = searchParams.get("accountId");
    const transferId = searchParams.get("transferId");
    if (!accountId && !transferId) return;
    const targetEndpoint = accountId ? "financial-accounts" : "account-transfers";
    const id = accountId || transferId || "";
    void fetchOperationalFinanceRecord<FinanceRecord>(`/api/enterprise/${organizationId}/${targetEndpoint}`, id)
      .then((record) => { if (record) { setTab(accountId ? "accounts" : "transfers"); setDetail(record); } })
      .catch((error) => setErrorMessage(safeFinanceError(error, t("loadError"), locale)));
  }, [organizationId, searchParams]);

  function refresh(success: string) {
    setDetail(null); setRefreshKey((value) => value + 1); setMessage(success);
  }

  function changeTab(next: string) {
    setTab(next as "accounts" | "transfers" | "history"); setPage(1); setSearch(""); setStatus(""); setHistoryFilters(EMPTY_HISTORY_FILTERS); setDetail(null);
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/financial-accounts`, {
        name: String(form.get("name") || ""), accountType: String(form.get("accountType") || "CASH"), currencyCode: String(form.get("currencyCode") || "").toUpperCase(), ledgerAccountId: String(form.get("ledgerAccountId") || ""), openingBalance: String(form.get("openingBalance") || "0"), maskedReference: String(form.get("maskedReference") || "") || undefined, responsibleUserId: String(form.get("responsibleUserId") || "") || undefined, siteId: String(form.get("siteId") || "") || undefined,
      });
      setAccountOpen(false); setAccountType("CASH"); refresh(t("accountCreated"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function updateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingAccount) return; const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/financial-accounts/${editingAccount.id}`, { name: String(form.get("name") || editingAccount.name), maskedReference: String(form.get("maskedReference") || "") || null, status: String(form.get("status") || editingAccount.status), revision: editingAccount.revision }, "PATCH");
      setEditingAccount(null); refresh(t("accountUpdated"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function archiveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!archiveTarget) return; const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/financial-accounts/${archiveTarget.id}`, { reason: String(form.get("reason") || ""), revision: archiveTarget.revision }, "DELETE");
      setArchiveTarget(null); refresh(t("accountArchived"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function previewTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const draft = { sourceFinancialAccountId: sourceAccountId, targetFinancialAccountId: targetAccountId, sourceAmount: String(form.get("sourceAmount") || "0"), transferDate: String(form.get("transferDate") || "") };
    setBusy(true); setErrorMessage("");
    try {
      const body = await requestJson(`/api/enterprise/${organizationId}/account-transfers/preview`, draft) as { preview?: TransferPreview };
      if (!body.preview) throw new Error(t("operationError"));
      setTransferDraft(draft); setTransferPreview(body.preview);
    } catch (error) { setErrorMessage(safeFinanceError(error, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!transferDraft) return; const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/account-transfers`, { ...transferDraft, approverUserId: String(form.get("approverUserId") || "") });
      setTransferOpen(false); setTransferPreview(null); setTransferDraft(null); setSourceAccountId(""); setTargetAccountId(""); refresh(t("transferCreated"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function transitionTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!transferAction) return; const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/account-transfers/${transferAction.record.id}/transition`, { action: transferAction.action, revision: transferAction.record.revision, ...(transferAction.action === "REJECT" ? { reason: String(form.get("reason") || "") } : {}) });
      setTransferAction(null); refresh(transferAction.action === "CONFIRM" ? t("confirm") : transferAction.action === "APPROVE" ? t("approve") : t("operationError"));
    } catch (error) { setErrorMessage(safeFinanceError(error, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  const selectedAccount = tab === "accounts" ? detail as Account | null : null;
  const selectedTransfer = tab === "transfers" ? detail as Transfer | null : null;
  const selectedHistory = tab === "history" ? detail as HistoryItem | null : null;
  const tabItems = [{ id: "accounts", label: t("accounts") }, { id: "transfers", label: t("transfers") }, { id: "history", label: t("history") }];
  const sectionTitle = tab === "accounts" ? t("financialAccounts") : tab === "transfers" ? t("transferList") : t("historyTitle");
  const placeholder = tab === "accounts" ? t("searchAccounts") : tab === "transfers" ? t("searchTransfers") : t("searchHistory");

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`${t("eyebrow")} · ${organizationName}`} title={t("title")} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={`${collection.pagination.total}`} primaryAction={canCreate ? <div className="flex flex-wrap gap-2">{tab === "accounts" ? <Button onClick={() => setAccountOpen(true)}><Plus className="h-4 w-4" />{t("newAccount")}</Button> : tab === "transfers" ? <Button onClick={() => setTransferOpen(true)}><Send className="h-4 w-4" />{t("newTransfer")}</Button> : null}</div> : undefined} />
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={placeholder} />} controls={<div className="grid min-w-0 gap-2"><ProfessionalTabs value={tab} onChange={changeTab} items={tabItems} label={t("title")} />{tab !== "history" ? <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: t("allStatuses") }, ...["ACTIVE", "INACTIVE", "DRAFT", "APPROVED", "CONFIRMED"].map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} /> : <div className="grid gap-2 md:grid-cols-3"><NativeSelect value={historyFilters.transactionType} onChange={(value) => { setHistoryFilters((current) => ({ ...current, transactionType: value })); setPage(1); }} items={[{ id: "", label: t("allTypes") }, ...["PAYMENT", "TRANSFER", "CASH", "ADJUSTMENT"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))]} /><NativeSelect value={historyFilters.direction} onChange={(value) => { setHistoryFilters((current) => ({ ...current, direction: value })); setPage(1); }} items={[{ id: "", label: t("allDirections") }, { id: "INBOUND", label: t("inbound") }, { id: "OUTBOUND", label: t("outbound") }]} /><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="financial-account" name="historyAccountId" label={t("account")} locale={rawLocale} onOptionChange={(option) => { setHistoryFilters((current) => ({ ...current, accountId: option?.id || "" })); setPage(1); }} /></div>}</div>} summary={tab === "history" ? t("historyDescription") : t("immutableStructure")} />
    <ModuleContent>
      <ModuleSection title={sectionTitle} description={tab === "history" ? t("historyDescription") : t("description")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : <FinanceRecordList items={collection.items} locale={locale} emptyTitle={t("noItems")} emptyDescription={t("noItemsDescription")} onOpen={(record) => setDetail(record)} />}
        <FinancePaginationControls pagination={collection.pagination} page={page} onPage={setPage} locale={locale} />
      </ModuleSection>
      <ProfessionalHelp moduleCode="FINANCE_TREASURY" />
    </ModuleContent>

    <Dialog open={Boolean(detail)} onClose={() => { if (!busy) setDetail(null); }} title={t("details")} description={tab === "history" ? t("historyDescription") : t("description")} presentation="editor" className="max-w-4xl">
      {selectedAccount ? <div className="grid gap-5"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={financeStatusTone(selectedAccount.status)}>{financeStatusLabel(selectedAccount.status, locale)}</StatusBadge>{selectedAccount.capabilities?.canEdit ? <Button variant="outline" onClick={() => setEditingAccount(selectedAccount)}><Edit3 className="h-4 w-4" />{t("editAccount")}</Button> : null}{selectedAccount.capabilities?.canArchive ? <Button variant="outline" onClick={() => setArchiveTarget(selectedAccount)}><Archive className="h-4 w-4" />{t("archive")}</Button> : null}</div><FinanceDetailGrid><FinanceDetailValue label={t("code")} value={selectedAccount.code} /><FinanceDetailValue label={t("accountName")} value={selectedAccount.name} /><FinanceDetailValue label={t("accountType")} value={financeEnumLabel(selectedAccount.accountType, locale)} /><FinanceDetailValue label={t("currency")} value={selectedAccount.currencyCode} /><FinanceDetailValue label={t("opening")} value={financeMoney(selectedAccount.openingBalance, selectedAccount.currencyCode, locale)} /><FinanceDetailValue label={t("operationalBalance")} value={financeMoney(selectedAccount.operationalBalance, selectedAccount.currencyCode, locale)} /><FinanceDetailValue label={t("reconciledBalance")} value={financeMoney(selectedAccount.reconciledBalance, selectedAccount.currencyCode, locale)} /><FinanceDetailValue label={t("maskedReference")} value={selectedAccount.maskedReference || "—"} /></FinanceDetailGrid></div> : null}
      {selectedTransfer ? <div className="grid gap-5"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={financeStatusTone(selectedTransfer.status)}>{financeStatusLabel(selectedTransfer.status, locale)}</StatusBadge>{selectedTransfer.capabilities?.canApprove ? <Button onClick={() => setTransferAction({ record: selectedTransfer, action: "APPROVE" })}><CheckCircle2 className="h-4 w-4" />{t("approve")}</Button> : null}{selectedTransfer.capabilities?.canReject ? <Button variant="outline" onClick={() => setTransferAction({ record: selectedTransfer, action: "REJECT" })}><XCircle className="h-4 w-4" />{locale === "en" ? "Reject" : "Refuser"}</Button> : null}{selectedTransfer.capabilities?.canConfirm ? <Button onClick={() => setTransferAction({ record: selectedTransfer, action: "CONFIRM" })}><ShieldCheck className="h-4 w-4" />{t("confirm")}</Button> : null}</div><FinanceDetailGrid><FinanceDetailValue label={t("reference")} value={selectedTransfer.number} /><FinanceDetailValue label={t("sourceAccount")} value={selectedTransfer.sourceFinancialAccount ? `${selectedTransfer.sourceFinancialAccount.code} · ${selectedTransfer.sourceFinancialAccount.name}` : selectedTransfer.sourceFinancialAccountId} /><FinanceDetailValue label={t("targetAccount")} value={selectedTransfer.targetFinancialAccount ? `${selectedTransfer.targetFinancialAccount.code} · ${selectedTransfer.targetFinancialAccount.name}` : selectedTransfer.targetFinancialAccountId} /><FinanceDetailValue label={t("debit")} value={financeMoney(selectedTransfer.sourceAmount, selectedTransfer.sourceCurrencyCode, locale)} /><FinanceDetailValue label={t("credit")} value={financeMoney(selectedTransfer.targetAmount, selectedTransfer.targetCurrencyCode, locale)} /><FinanceDetailValue label={t("exchangeRate")} value={String(selectedTransfer.exchangeRate || "1")} /><FinanceDetailValue label={t("transferDate")} value={financeDate(selectedTransfer.transferDate, locale)} /><FinanceDetailValue label={t("validator")} value={selectedTransfer.approval?.approverName || "—"} /></FinanceDetailGrid></div> : null}
      {selectedHistory ? <FinanceDetailGrid><FinanceDetailValue label={t("transactionType")} value={financeEnumLabel(selectedHistory.transactionType, locale)} /><FinanceDetailValue label={t("direction")} value={financeEnumLabel(selectedHistory.direction, locale)} /><FinanceDetailValue label={t("amount")} value={financeMoney(selectedHistory.amount, selectedHistory.currencyCode, locale)} /><FinanceDetailValue label={t("transferDate")} value={financeDate(selectedHistory.transactionDate, locale)} /><FinanceDetailValue label={t("reference")} value={selectedHistory.reference || "—"} /><FinanceDetailValue label={t("account")} value={selectedHistory.financialAccount ? `${selectedHistory.financialAccount.code} · ${selectedHistory.financialAccount.name}` : "—"} /></FinanceDetailGrid> : null}
    </Dialog>

    <Dialog open={accountOpen} onClose={() => { if (!busy) { setAccountOpen(false); setAccountType("CASH"); } }} title={t("newAccount")} description={t("generatedCodeNotice")} presentation="editor" className="max-w-4xl">
      <form onSubmit={createAccount} className="grid gap-6"><ProfessionalFormSection title={t("accountDetails")}><Field label={t("accountName")} help={t("accountNameHelp")}><Input name="name" required maxLength={160} disabled={busy} /></Field><Field label={t("accountType")} help={t("accountTypeHelp")}><NativeSelect name="accountType" value={accountType} onChange={setAccountType} required disabled={busy} items={["CASH", "BANK", "MOBILE_MONEY", "CLEARING"].map((id) => ({ id, label: financeEnumLabel(id, locale) }))} /></Field><Field label={t("currency")} help={t("currencyHelp")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="currency" name="currencyCode" label={t("currency")} locale={rawLocale} required disabled={busy} /></Field><Field label={t("ledgerAccount")} help={t("ledgerAccountHelp")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="ledger-account" name="ledgerAccountId" label={t("ledgerAccount")} locale={rawLocale} parentId={accountType} required disabled={busy} /></Field><Field label={t("openingBalance")} help={t("openingBalanceHelp")}><Input name="openingBalance" type="number" step="0.01" defaultValue="0" required disabled={busy} /></Field><Field label={t("maskedReference")} help={t("maskedReferenceHelp")}><Input name="maskedReference" maxLength={120} disabled={busy} /></Field><Field label={t("responsible")} help={t("responsibleHelp")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="member" name="responsibleUserId" label={t("responsible")} locale={rawLocale} disabled={busy} /></Field><Field label={t("site")} help={t("siteHelp")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="site" name="siteId" label={t("site")} locale={rawLocale} disabled={busy} /></Field></ProfessionalFormSection><Button type="submit" disabled={busy}>{t("createAccount")}</Button></form>
    </Dialog>

    <Dialog open={Boolean(editingAccount)} onClose={() => { if (!busy) setEditingAccount(null); }} title={t("editAccount")} description={t("editMutableOnly")} presentation="editor">
      {editingAccount ? <form onSubmit={updateAccount} className="grid gap-5"><Field label={t("accountName")}><Input name="name" defaultValue={editingAccount.name} required maxLength={160} disabled={busy} /></Field><Field label={t("maskedReference")}><Input name="maskedReference" defaultValue={editingAccount.maskedReference || ""} maxLength={120} disabled={busy} /></Field><Field label={t("status")}><NativeSelect name="status" defaultValue={editingAccount.status} disabled={busy} items={[{ id: "ACTIVE", label: t("active") }, { id: "INACTIVE", label: t("inactive") }]} /></Field><Button type="submit" disabled={busy}>{t("save")}</Button></form> : null}
    </Dialog>

    <Dialog open={Boolean(archiveTarget)} onClose={() => { if (!busy) setArchiveTarget(null); }} title={t("archiveAccount")} description={t("archiveWarning")} presentation="editor">
      <form onSubmit={archiveAccount} className="grid gap-5"><Field label={t("archiveReason")} help={t("archiveReasonHelp")}><Input name="reason" required minLength={4} maxLength={1000} disabled={busy} /></Field><Button type="submit" disabled={busy}>{t("archive")}</Button></form>
    </Dialog>

    <Dialog open={transferOpen} onClose={() => { if (!busy) { setTransferOpen(false); setTransferPreview(null); setTransferDraft(null); setSourceAccountId(""); setTargetAccountId(""); } }} title={t("newTransfer")} description={t("transferRateNotice")} presentation="editor" className="max-w-4xl">
      {!transferPreview ? <form onSubmit={previewTransfer} className="grid gap-6"><ProfessionalFormSection title={t("transferPreview")}><Field label={t("sourceAccount")} help={t("sourceAccountHelp")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="financial-account" name="sourceFinancialAccountId" label={t("sourceAccount")} locale={rawLocale} required disabled={busy} onOptionChange={(option) => setSourceAccountId(option?.id || "")} /></Field><Field label={t("targetAccount")} help={t("targetAccountHelp")}><FinanceReferenceSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" kind="financial-account" name="targetFinancialAccountId" label={t("targetAccount")} locale={rawLocale} required disabled={busy} onOptionChange={(option) => setTargetAccountId(option?.id || "")} /></Field><Field label={t("sourceAmount")} help={t("sourceAmountHelp")}><Input name="sourceAmount" type="number" step="0.01" min="0.01" required disabled={busy} /></Field><Field label={t("transferDate")} help={t("transferDateHelp")}><Input name="transferDate" type="date" required disabled={busy} /></Field></ProfessionalFormSection><Button type="submit" disabled={busy || !sourceAccountId || !targetAccountId}>{t("previewTransfer")}</Button></form> : <form onSubmit={createTransfer} className="grid gap-6"><FinanceDetailGrid><FinanceDetailValue label={t("debit")} value={`${transferPreview.sourceAmount} ${transferPreview.sourceAccount.currencyCode}`} /><FinanceDetailValue label={t("credit")} value={`${transferPreview.targetAmount} ${transferPreview.targetAccount.currencyCode}`} /><FinanceDetailValue label={t("exchangeRate")} value={transferPreview.exchangeRate.value} /><FinanceDetailValue label={t("rateDate")} value={financeDate(transferPreview.exchangeRate.rateDate, locale)} /></FinanceDetailGrid><EnterpriseApproverSelect organizationId={organizationId} moduleCode="FINANCE_TREASURY" locale={rawLocale} label={t("validator")} disabled={busy} /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setTransferPreview(null); setTransferDraft(null); }}>{t("editTransfer")}</Button><Button type="submit" disabled={busy}>{t("prepareTransfer")}</Button></div></form>}
    </Dialog>

    <Dialog open={Boolean(transferAction)} onClose={() => { if (!busy) setTransferAction(null); }} title={transferAction?.action === "APPROVE" ? t("approve") : transferAction?.action === "CONFIRM" ? t("confirm") : (locale === "en" ? "Reject transfer" : "Refuser le transfert")} description={t("transferPreviewHelp")} presentation="editor">
      <form onSubmit={transitionTransfer} className="grid gap-5">{transferAction?.action === "REJECT" ? <Field label={t("reason")}><Input name="reason" required minLength={4} maxLength={1000} disabled={busy} /></Field> : null}<Button type="submit" disabled={busy}>{transferAction?.action === "APPROVE" ? t("approve") : transferAction?.action === "CONFIRM" ? t("confirm") : (locale === "en" ? "Reject" : "Refuser")}</Button></form>
    </Dialog>
  </ModuleWorkspace>;
}
