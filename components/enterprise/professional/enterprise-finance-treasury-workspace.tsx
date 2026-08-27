"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, ArrowRightLeft, Edit3, Eye, Landmark, Plus, Power, ShieldCheck } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  FinanceDetailGrid,
  FinanceDetailValue,
  FinancePaginationControls,
  FinanceRecordList,
  type FinancePagination,
  type FinanceRecord,
} from "@/components/enterprise/professional/finance-professional-workspace-shared";
import {
  ProfessionalError,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
} from "@/components/enterprise/professional/professional-erp-ui";
import {
  financeDate,
  financeEnumLabel,
  financeMoney,
  financeStatusLabel,
  financeStatusTone,
  safeFinanceError,
  type FinanceLocale,
} from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ContextActions } from "@/components/workspace/context-actions";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { translateExchangeRate, type ExchangeRateCopyKey } from "@/lib/i18n/enterprise-exchange-rates";
import { translateEnterpriseTreasury, type EnterpriseTreasuryCopyKey } from "@/lib/i18n/enterprise-treasury";

type Props = { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition; locale?: string | null; canManage: boolean };
type TreasuryTab = "accounts" | "transfers" | "history";
type Account = FinanceRecord & { code: string; name: string; accountType: string; currencyCode: string; maskedReference?: string | null; openingBalance: string | number; operationalBalance: string | number; reconciledBalance: string | number; availableBalance?: string | number | null; ledgerAccountId: string; responsibleUserId?: string | null; siteId?: string | null; status: string; revision: number };
type Transfer = FinanceRecord & { number: string; sourceFinancialAccountId: string; targetFinancialAccountId: string; sourceCurrencyCode: string; targetCurrencyCode: string; sourceAmount: string | number; targetAmount: string | number; exchangeRate?: string | number | null; transferDate: string; status: string; revision: number; sourceFinancialAccount?: { id: string; code: string; name: string; accountType: string; currencyCode: string } | null; targetFinancialAccount?: { id: string; code: string; name: string; accountType: string; currencyCode: string } | null };
type HistoryItem = FinanceRecord & { transactionType: string; direction: string; currencyCode: string; amount: string | number; transactionDate: string; reference?: string | null; status: string; reconciliationStatus: string; financialAccount: { id: string; code: string; name: string; accountType: string; currencyCode: string }; payment?: { id: string; number: string; status: string; paymentType: string } | null; transfer?: { id: string; number: string; status: string; exchangeRate?: string | number | null } | null };
type LookupPayload = {
  accounts: Array<{ id: string; code: string; name: string; accountType: string; currencyCode: string; operationalBalance: string | number; availableBalance?: string | number | null; status: string; revision: number }>;
  ledgerAccounts: Array<{ id: string; code: string; nameFr: string; nameEn: string; accountType: string; accountSubtype?: string | null; currencyCode?: string | null }>;
  currencies: Array<{ code: string; name: string; symbol?: string | null; precision: number }>;
  members: Array<{ id: string; label: string; email?: string; role?: string; positionTitle?: string | null }>;
  sites: Array<{ id: string; code: string; name: string }>;
};
type TransferPreview = { sourceAccount: { id: string; code: string; name: string; accountType: string; currencyCode: string; operationalBalance: string }; targetAccount: { id: string; code: string; name: string; accountType: string; currencyCode: string; operationalBalance: string }; sourceAmount: string; targetAmount: string; transferDate: string; exchangeRate: { value: string; rateId: string | null; rateDate: string; source: string; direction: string } };
type HistoryFilters = { accountId: string; transactionType: string; direction: string; currencyCode: string; from: string; to: string };

const EMPTY_PAGINATION: FinancePagination = { page: 1, pageSize: 25, total: 0, pageCount: 1 };
const EMPTY_LOOKUPS: LookupPayload = { accounts: [], ledgerAccounts: [], currencies: [], members: [], sites: [] };
const EMPTY_HISTORY_FILTERS: HistoryFilters = { accountId: "", transactionType: "", direction: "", currencyCode: "", from: "", to: "" };

async function requestJson(endpoint: string, method: "GET" | "POST" | "PATCH" | "DELETE" = "GET", body?: unknown) {
  const response = await fetch(endpoint, { method, cache: "no-store", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as { message?: string; error?: string; [key: string]: unknown } | null;
  if (!response.ok) throw new Error(payload?.error || payload?.message || "TREASURY_OPERATION_FAILED");
  return payload || {};
}

const today = () => new Date().toISOString().slice(0, 10);

export function EnterpriseFinanceTreasuryWorkspace({ organizationId, organizationName, locale: rawLocale, canManage }: Props) {
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const t = useCallback((key: EnterpriseTreasuryCopyKey) => translateEnterpriseTreasury(locale, key), [locale]);
  const fxT = useCallback((key: ExchangeRateCopyKey) => translateExchangeRate(locale, key), [locale]);
  const rateSourceLabel = useCallback((source: string, direction: string) => {
    if (direction === "IDENTITY") return "—";
    const keyBySource: Record<string, ExchangeRateCopyKey> = {
      MANUAL: "manual",
      CENTRAL_BANK: "centralBank",
      COMMERCIAL_BANK: "commercialBank",
      PROVIDER: "provider",
      CONTRACTUAL: "contractual",
      IMPORTED: "imported",
    };
    const key = keyBySource[source];
    return key ? fxT(key) : source;
  }, [fxT]);
  const [tab, setTab] = useState<TreasuryTab>("accounts");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>(EMPTY_HISTORY_FILTERS);
  const [items, setItems] = useState<FinanceRecord[]>([]);
  const [pagination, setPagination] = useState<FinancePagination>(EMPTY_PAGINATION);
  const [lookups, setLookups] = useState<LookupPayload>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(true);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<FinanceRecord | null>(null);
  const [accountDialog, setAccountDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [archiveAccount, setArchiveAccount] = useState<Account | null>(null);
  const [transferDialog, setTransferDialog] = useState(false);
  const [transferPreview, setTransferPreview] = useState<TransferPreview | null>(null);
  const [transferPayload, setTransferPayload] = useState<{ sourceFinancialAccountId: string; targetFinancialAccountId: string; sourceAmount: string; transferDate: string } | null>(null);
  const [accountType, setAccountType] = useState("CASH");
  const [accountCurrency, setAccountCurrency] = useState("");

  const loadLookups = useCallback(async () => {
    setLookupLoading(true);
    try { setLookups(await requestJson(`/api/enterprise/${organizationId}/treasury-lookups`) as unknown as LookupPayload); }
    catch (loadError) { setError(safeFinanceError(loadError, t("loadError"), locale)); }
    finally { setLookupLoading(false); }
  }, [organizationId, t, locale]);

  const listEndpoint = useMemo(() => {
    const base = tab === "accounts" ? `/api/enterprise/${organizationId}/financial-accounts` : tab === "transfers" ? `/api/enterprise/${organizationId}/account-transfers` : `/api/enterprise/${organizationId}/treasury-history`;
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (tab === "history") for (const [key, value] of Object.entries(historyFilters)) if (value) params.set(key, value);
    return `${base}?${params.toString()}`;
  }, [historyFilters, organizationId, page, search, status, tab]);

  const loadList = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const payload = await requestJson(listEndpoint);
      setItems(Array.isArray(payload.items) ? payload.items as FinanceRecord[] : []);
      setPagination((payload.pagination as FinancePagination | undefined) || EMPTY_PAGINATION);
    } catch (loadError) { setItems([]); setError(safeFinanceError(loadError, t("loadError"), locale)); }
    finally { setLoading(false); }
  }, [listEndpoint, t, locale]);

  useEffect(() => { void loadLookups(); }, [loadLookups, refreshKey]);
  useEffect(() => { void loadList(); }, [loadList, refreshKey]);

  const refresh = useCallback((message?: string) => { if (message) setNotice(message); setRefreshKey((value) => value + 1); }, []);
  const changeTab = (next: TreasuryTab) => { setTab(next); setPage(1); setSearch(""); setStatus(""); setHistoryFilters(EMPTY_HISTORY_FILTERS); setSelected(null); };
  const accounts = lookups.accounts;
  const accountChoices = accounts.map((account) => ({ id: account.id, label: `${account.code} · ${account.name} · ${financeEnumLabel(account.accountType, locale)} · ${account.currencyCode}` }));
  const currencies = lookups.currencies.map((currency) => ({ id: currency.code, label: `${currency.code} · ${currency.name}` }));
  const members = lookups.members.map((member) => ({ id: member.id, label: `${member.label}${member.positionTitle ? ` · ${member.positionTitle}` : ""}` }));
  const sites = lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }));
  const compatibleLedgers = lookups.ledgerAccounts.filter((account) => account.accountSubtype === accountType && (!account.currencyCode || !accountCurrency || account.currencyCode === accountCurrency));
  const ledgers = compatibleLedgers.map((account) => ({ id: account.id, label: `${account.code} · ${locale === "fr" ? account.nameFr : account.nameEn}${account.currencyCode ? ` · ${account.currencyCode}` : ""}` }));
  const accountTypes = ["CASH", "BANK", "MOBILE_MONEY", "CLEARING"].map((id) => ({ id, label: financeEnumLabel(id, locale) }));

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/financial-accounts`, "POST", { name: String(form.get("name") || ""), accountType: String(form.get("accountType") || ""), currencyCode: String(form.get("currencyCode") || ""), ledgerAccountId: String(form.get("ledgerAccountId") || ""), openingBalance: String(form.get("openingBalance") || "0"), maskedReference: String(form.get("maskedReference") || "") || undefined });
      setAccountDialog(false); setAccountType("CASH"); setAccountCurrency(""); refresh(t("accountCreated"));
    } catch (mutationError) { setError(safeFinanceError(mutationError, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function updateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !editingAccount) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/financial-accounts/${editingAccount.id}`, "PATCH", { name: String(form.get("name") || ""), maskedReference: String(form.get("maskedReference") || "") || null, responsibleUserId: String(form.get("responsibleUserId") || "") || null, siteId: String(form.get("siteId") || "") || null, revision: editingAccount.revision });
      setEditingAccount(null); refresh(t("accountUpdated"));
    } catch (mutationError) { setError(safeFinanceError(mutationError, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function setAccountStatus(account: Account, nextStatus: "ACTIVE" | "INACTIVE") {
    if (busy) return; setBusy(true); setError("");
    try { await requestJson(`/api/enterprise/${organizationId}/financial-accounts/${account.id}`, "PATCH", { status: nextStatus, revision: account.revision }); refresh(t("accountUpdated")); }
    catch (mutationError) { setError(safeFinanceError(mutationError, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function archiveSelectedAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !archiveAccount) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try { await requestJson(`/api/enterprise/${organizationId}/financial-accounts/${archiveAccount.id}`, "DELETE", { reason: String(form.get("reason") || ""), revision: archiveAccount.revision }); setArchiveAccount(null); setSelected(null); refresh(t("accountArchived")); }
    catch (mutationError) { setError(safeFinanceError(mutationError, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function previewTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    const payload = { sourceFinancialAccountId: String(form.get("sourceFinancialAccountId") || ""), targetFinancialAccountId: String(form.get("targetFinancialAccountId") || ""), sourceAmount: String(form.get("sourceAmount") || ""), transferDate: String(form.get("transferDate") || "") };
    setBusy(true); setError("");
    try { const body = await requestJson(`/api/enterprise/${organizationId}/account-transfers/preview`, "POST", payload); setTransferPayload(payload); setTransferPreview(body.preview as TransferPreview); }
    catch (mutationError) { setError(safeFinanceError(mutationError, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function prepareTransfer() {
    if (busy || !transferPayload) return; setBusy(true); setError("");
    try { await requestJson(`/api/enterprise/${organizationId}/account-transfers`, "POST", transferPayload); setTransferDialog(false); setTransferPreview(null); setTransferPayload(null); setTab("transfers"); setPage(1); refresh(t("transferCreated")); }
    catch (mutationError) { setError(safeFinanceError(mutationError, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  async function transitionTransfer(transfer: Transfer, action: "APPROVE" | "CONFIRM") {
    if (busy) return; setBusy(true); setError("");
    try { await requestJson(`/api/enterprise/${organizationId}/account-transfers/${transfer.id}/transition`, "POST", { action, revision: transfer.revision }); setSelected(null); refresh(); }
    catch (mutationError) { setError(safeFinanceError(mutationError, t("operationError"), locale)); }
    finally { setBusy(false); }
  }

  function accountActions(account: Account) {
    return <ContextActions label={`${t("actions")} · ${account.code}`} actions={[
      { id: "details", label: t("details"), icon: Eye, onSelect: () => setSelected(account) },
      { id: "edit", label: t("editAccount"), icon: Edit3, hidden: !canManage, onSelect: () => setEditingAccount(account) },
      { id: "status", label: account.status === "ACTIVE" ? t("deactivate") : t("activate"), icon: Power, hidden: !canManage, onSelect: () => void setAccountStatus(account, account.status === "ACTIVE" ? "INACTIVE" : "ACTIVE") },
      { id: "archive", label: t("archive"), icon: Archive, destructive: true, separatorBefore: true, hidden: !canManage, onSelect: () => setArchiveAccount(account) },
    ]} />;
  }

  const accountItems = items as Account[];
  const transferItems = items as Transfer[];
  const historyItems = items as HistoryItem[];
  const statusChoices = tab === "accounts" ? ["ACTIVE", "INACTIVE"] : ["DRAFT", "APPROVED", "CONFIRMED", "CANCELLED"];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`${t("eyebrow")} · ${organizationName}`} title={t("title")} description={t("description")}
      primaryAction={canManage ? <Button onClick={() => { setTransferDialog(true); setTransferPreview(null); setTransferPayload(null); }}><ArrowRightLeft className="h-4 w-4" />{t("newTransfer")}</Button> : undefined}
      secondaryActions={<div className="flex flex-wrap gap-2">{canManage ? <Button variant="outline" onClick={() => setAccountDialog(true)}><Plus className="h-4 w-4" />{t("newAccount")}</Button> : null}<Link href="/enterprise-modules/FINANCE_TREASURY/exchange-rates"><Button variant="outline">{fxT("title")}</Button></Link></div>} />
    <ModuleContent>
      {notice ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{notice}</div> : null}
      {error ? <ProfessionalError message={error} /> : null}
      <ProfessionalTabs value={tab} onChange={changeTab} items={[{ id: "accounts", label: t("accounts") }, { id: "transfers", label: t("transfers") }, { id: "history", label: t("history") }]} />
      <ModuleMetrics label={t("title")}><ModuleMetric label={t("activeAccounts")} value={accounts.length} /><ModuleMetric label={tab === "history" ? t("totalMovements") : t("pendingTransfers")} value={tab === "history" ? pagination.total : transferItems.filter((item) => !["CONFIRMED", "CANCELLED"].includes(item.status)).length} /><ModuleMetric label="Page" value={`${pagination.page}/${pagination.pageCount}`} /></ModuleMetrics>
      <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={tab === "accounts" ? t("searchAccounts") : tab === "transfers" ? t("searchTransfers") : t("searchHistory")} />}
        controls={tab === "history" ? <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-6"><NativeSelect items={[{ id: "", label: t("allAccounts") }, ...accountChoices]} value={historyFilters.accountId} onChange={(value) => { setHistoryFilters((current) => ({ ...current, accountId: value })); setPage(1); }} /><NativeSelect items={[{ id: "", label: t("allTypes") }, { id: "TRANSFER", label: financeEnumLabel("TRANSFER", locale) }, { id: "PAYMENT", label: t("payment") }]} value={historyFilters.transactionType} onChange={(value) => { setHistoryFilters((current) => ({ ...current, transactionType: value })); setPage(1); }} /><NativeSelect items={[{ id: "", label: t("allDirections") }, { id: "INBOUND", label: t("inbound") }, { id: "OUTBOUND", label: t("outbound") }]} value={historyFilters.direction} onChange={(value) => { setHistoryFilters((current) => ({ ...current, direction: value })); setPage(1); }} /><NativeSelect items={[{ id: "", label: t("allCurrencies") }, ...currencies]} value={historyFilters.currencyCode} onChange={(value) => { setHistoryFilters((current) => ({ ...current, currencyCode: value })); setPage(1); }} /><Input type="date" aria-label={t("dateFrom")} value={historyFilters.from} onChange={(event) => { setHistoryFilters((current) => ({ ...current, from: event.target.value })); setPage(1); }} /><Input type="date" aria-label={t("dateTo")} value={historyFilters.to} onChange={(event) => { setHistoryFilters((current) => ({ ...current, to: event.target.value })); setPage(1); }} /></div>
          : <NativeSelect items={[{ id: "", label: t("allStatuses") }, ...statusChoices.map((id) => ({ id, label: financeStatusLabel(id, locale) }))]} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />} summary={`${pagination.total}`} />
      <ModuleSection title={tab === "accounts" ? t("financialAccounts") : tab === "transfers" ? t("transferList") : t("historyTitle")} description={tab === "history" ? t("historyDescription") : undefined} count={pagination.total}>
        {loading ? <ProfessionalLoading rows={5} /> : tab === "accounts" ? <FinanceRecordList items={accountItems} locale={locale} emptyTitle={t("noItems")} emptyDescription={t("noItemsDescription")} onOpen={setSelected} actions={(item) => accountActions(item)} /> : tab === "transfers" ? <FinanceRecordList items={transferItems} locale={locale} emptyTitle={t("noItems")} emptyDescription={t("noItemsDescription")} onOpen={setSelected} /> : historyItems.length ? <div className="grid gap-2">{historyItems.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item)} className="grid min-w-0 gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left transition hover:bg-dtsc-soft sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-dtsc-ink">{item.financialAccount.code} · {item.financialAccount.name}</strong><StatusBadge tone={financeStatusTone(item.status)}>{financeStatusLabel(item.status, locale)}</StatusBadge></span><span className="mt-1 block text-xs font-semibold text-dtsc-muted">{financeDate(item.transactionDate, locale)} · {item.transactionType === "PAYMENT" ? t("payment") : financeEnumLabel(item.transactionType, locale)} · {item.direction === "INBOUND" ? t("inbound") : t("outbound")} · {item.reference || "—"}</span></span><strong className="text-dtsc-ink">{item.direction === "OUTBOUND" ? "−" : "+"}{financeMoney(item.amount, item.currencyCode, locale)}</strong></button>)}</div> : <p className="rounded-xl border border-dashed border-dtsc-border p-6 text-center text-sm font-semibold text-dtsc-muted">{t("noItemsDescription")}</p>}
        <FinancePaginationControls pagination={pagination} page={page} onPage={setPage} locale={locale} />
      </ModuleSection>
      <ProfessionalHelp moduleCode="FINANCE_TREASURY" />
    </ModuleContent>

    <Dialog open={accountDialog} onClose={() => setAccountDialog(false)} title={t("newAccount")} description={t("generatedCodeNotice")} className="h-[94dvh] w-[min(96vw,64rem)] max-w-4xl overflow-x-hidden">
      <form onSubmit={createAccount} className="grid gap-5"><div className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-3 text-sm font-semibold text-dtsc-muted"><ShieldCheck className="mr-2 inline h-4 w-4 text-cyan-600" />{t("generatedCodeNotice")}</div><div className="grid gap-4 md:grid-cols-2"><Field label={t("accountName")} help={t("accountNameHelp")} required><Input name="name" required minLength={2} maxLength={160} /></Field><Field label={t("accountType")} help={t("accountTypeHelp")} required><NativeSelect name="accountType" items={accountTypes} value={accountType} onChange={setAccountType} required /></Field><Field label={t("currency")} help={t("currencyHelp")} required><NativeSelect name="currencyCode" items={currencies} value={accountCurrency} onChange={setAccountCurrency} required disabled={lookupLoading || !currencies.length} /></Field><Field label={t("ledgerAccount")} help={ledgers.length ? t("ledgerAccountHelp") : t("ledgerUnavailable")} required><NativeSelect name="ledgerAccountId" items={ledgers} required disabled={!ledgers.length} /></Field><Field label={t("openingBalance")} help={t("openingBalanceHelp")} required><Input name="openingBalance" type="number" inputMode="decimal" step="0.000001" defaultValue="0" required /></Field>{accountType === "BANK" || accountType === "MOBILE_MONEY" ? <Field label={t("maskedReference")} help={t("maskedReferenceHelp")}><Input name="maskedReference" maxLength={120} placeholder="•••• 1234" /></Field> : null}</div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface/95 py-3"><Button type="button" variant="outline" onClick={() => setAccountDialog(false)}>{t("cancel")}</Button><Button type="submit" disabled={busy || !currencies.length || !ledgers.length}><Plus className="h-4 w-4" />{t("createAccount")}</Button></div></form>
    </Dialog>

    <Dialog open={Boolean(editingAccount)} onClose={() => setEditingAccount(null)} title={t("editAccount")} description={t("editMutableOnly")} className="h-[94dvh] w-[min(96vw,56rem)] max-w-3xl overflow-x-hidden">
      {editingAccount ? <form onSubmit={updateAccount} className="grid gap-5"><div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm leading-6 text-dtsc-muted"><strong className="text-dtsc-ink">{editingAccount.code}</strong><br />{t("immutableStructure")}</div><div className="grid gap-4 md:grid-cols-2"><Field label={t("accountName")} help={t("accountNameHelp")} required><Input name="name" defaultValue={editingAccount.name} required /></Field><Field label={t("maskedReference")} help={t("maskedReferenceHelp")}><Input name="maskedReference" defaultValue={editingAccount.maskedReference || ""} /></Field><Field label={t("responsible")} help={t("responsibleHelp")}><NativeSelect name="responsibleUserId" items={members} defaultValue={editingAccount.responsibleUserId || ""} /></Field><Field label={t("site")} help={t("siteHelp")}><NativeSelect name="siteId" items={sites} defaultValue={editingAccount.siteId || ""} /></Field></div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface/95 py-3"><Button type="button" variant="outline" onClick={() => setEditingAccount(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{t("save")}</Button></div></form> : null}
    </Dialog>

    <Dialog open={Boolean(archiveAccount)} onClose={() => setArchiveAccount(null)} title={t("archiveAccount")} description={t("archiveWarning")} className="w-[min(96vw,42rem)] max-w-xl overflow-x-hidden">{archiveAccount ? <form onSubmit={archiveSelectedAccount} className="grid gap-4"><Field label={t("archiveReason")} help={t("archiveReasonHelp")} required><Input name="reason" required minLength={4} maxLength={1000} /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setArchiveAccount(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}><Archive className="h-4 w-4" />{t("archive")}</Button></div></form> : null}</Dialog>

    <Dialog open={transferDialog} onClose={() => { setTransferDialog(false); setTransferPreview(null); setTransferPayload(null); }} title={transferPreview ? t("transferPreview") : t("newTransfer")} description={transferPreview ? t("transferPreviewHelp") : t("transferRateNotice")} className="h-[94dvh] w-[min(98vw,72rem)] max-w-5xl overflow-x-hidden">
      {!transferPreview ? <form onSubmit={previewTransfer} className="grid gap-5"><div className="grid gap-4 md:grid-cols-2"><Field label={t("sourceAccount")} help={t("sourceAccountHelp")} required><NativeSelect name="sourceFinancialAccountId" items={accountChoices} required /></Field><Field label={t("targetAccount")} help={t("targetAccountHelp")} required><NativeSelect name="targetFinancialAccountId" items={accountChoices} required /></Field><Field label={t("sourceAmount")} help={t("sourceAmountHelp")} required><Input name="sourceAmount" type="number" inputMode="decimal" min="0.000001" step="0.000001" required /></Field><Field label={t("transferDate")} help={t("transferDateHelp")} required><Input name="transferDate" type="date" defaultValue={today()} required /></Field></div><div className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-4 text-sm font-semibold text-dtsc-muted"><ArrowRightLeft className="mr-2 inline h-4 w-4 text-cyan-600" />{t("transferRateNotice")}</div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface/95 py-3"><Button type="button" variant="outline" onClick={() => setTransferDialog(false)}>{t("cancel")}</Button><Button type="submit" disabled={busy || accounts.length < 2}><Eye className="h-4 w-4" />{t("previewTransfer")}</Button></div></form> : <div className="grid gap-5"><div className="grid gap-3 sm:grid-cols-2"><article className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{t("debit")}</p><p className="mt-2 text-lg font-black text-dtsc-ink">{transferPreview.sourceAccount.code} · {transferPreview.sourceAccount.name}</p><p className="mt-1 text-sm text-dtsc-muted">{financeEnumLabel(transferPreview.sourceAccount.accountType, locale)} · {financeMoney(transferPreview.sourceAmount, transferPreview.sourceAccount.currencyCode, locale)}</p></article><article className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase text-dtsc-muted">{t("credit")}</p><p className="mt-2 text-lg font-black text-dtsc-ink">{transferPreview.targetAccount.code} · {transferPreview.targetAccount.name}</p><p className="mt-1 text-sm text-dtsc-muted">{financeEnumLabel(transferPreview.targetAccount.accountType, locale)} · {financeMoney(transferPreview.targetAmount, transferPreview.targetAccount.currencyCode, locale)}</p></article></div><FinanceDetailGrid><FinanceDetailValue label={t("exchangeRate")}>1 {transferPreview.sourceAccount.currencyCode} = {transferPreview.exchangeRate.value} {transferPreview.targetAccount.currencyCode}</FinanceDetailValue><FinanceDetailValue label={t("rateDate")}>{financeDate(transferPreview.exchangeRate.rateDate, locale)}</FinanceDetailValue><FinanceDetailValue label={t("rateSource")}>{rateSourceLabel(transferPreview.exchangeRate.source, transferPreview.exchangeRate.direction)}</FinanceDetailValue><FinanceDetailValue label={t("transferDate")}>{financeDate(transferPreview.transferDate, locale)}</FinanceDetailValue></FinanceDetailGrid><div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-dtsc-muted"><ShieldCheck className="mr-2 inline h-4 w-4 text-emerald-600" />{t("transferPreviewHelp")}</div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface/95 py-3"><Button type="button" variant="outline" onClick={() => setTransferPreview(null)}>{t("editTransfer")}</Button><Button type="button" disabled={busy} onClick={() => void prepareTransfer()}><ArrowRightLeft className="h-4 w-4" />{t("prepareTransfer")}</Button></div></div>}
    </Dialog>

    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} title={tab === "accounts" ? t("accountDetails") : tab === "transfers" ? t("transfer") : t("history")} className="h-[94dvh] w-[min(96vw,64rem)] max-w-4xl overflow-x-hidden">
      {selected && tab === "accounts" ? (() => { const account = selected as Account; return <div className="grid gap-5"><FinanceDetailGrid><FinanceDetailValue label={t("code")}>{account.code}</FinanceDetailValue><FinanceDetailValue label={t("accountName")}>{account.name}</FinanceDetailValue><FinanceDetailValue label={t("accountType")}>{financeEnumLabel(account.accountType, locale)}</FinanceDetailValue><FinanceDetailValue label={t("currency")}>{account.currencyCode}</FinanceDetailValue><FinanceDetailValue label={t("opening")}>{financeMoney(account.openingBalance, account.currencyCode, locale)}</FinanceDetailValue><FinanceDetailValue label={t("operationalBalance")}>{financeMoney(account.operationalBalance, account.currencyCode, locale)}</FinanceDetailValue><FinanceDetailValue label={t("reconciledBalance")}>{financeMoney(account.reconciledBalance, account.currencyCode, locale)}</FinanceDetailValue><FinanceDetailValue label={t("status")}><StatusBadge tone={financeStatusTone(account.status)}>{financeStatusLabel(account.status, locale)}</StatusBadge></FinanceDetailValue></FinanceDetailGrid><div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted"><Landmark className="mr-2 inline h-4 w-4" />{t("immutableStructure")}</div>{canManage ? <div className="flex justify-end">{accountActions(account)}</div> : null}</div>; })() : null}
      {selected && tab === "transfers" ? (() => { const transfer = selected as Transfer; return <div className="grid gap-5"><FinanceDetailGrid><FinanceDetailValue label={t("reference")}>{transfer.number}</FinanceDetailValue><FinanceDetailValue label={t("sourceAccount")}>{transfer.sourceFinancialAccount?.name || transfer.sourceFinancialAccountId}</FinanceDetailValue><FinanceDetailValue label={t("targetAccount")}>{transfer.targetFinancialAccount?.name || transfer.targetFinancialAccountId}</FinanceDetailValue><FinanceDetailValue label={t("debit")}>{financeMoney(transfer.sourceAmount, transfer.sourceCurrencyCode, locale)}</FinanceDetailValue><FinanceDetailValue label={t("credit")}>{financeMoney(transfer.targetAmount, transfer.targetCurrencyCode, locale)}</FinanceDetailValue><FinanceDetailValue label={t("exchangeRate")}>{transfer.exchangeRate ? String(transfer.exchangeRate) : "1"}</FinanceDetailValue><FinanceDetailValue label={t("transferDate")}>{financeDate(transfer.transferDate, locale)}</FinanceDetailValue><FinanceDetailValue label={t("status")}><StatusBadge tone={financeStatusTone(transfer.status)}>{financeStatusLabel(transfer.status, locale)}</StatusBadge></FinanceDetailValue></FinanceDetailGrid>{canManage && transfer.status === "DRAFT" ? <Button disabled={busy} onClick={() => void transitionTransfer(transfer, "APPROVE")}>{t("approve")}</Button> : null}{canManage && transfer.status === "APPROVED" ? <Button disabled={busy} onClick={() => void transitionTransfer(transfer, "CONFIRM")}>{t("confirm")}</Button> : null}</div>; })() : null}
      {selected && tab === "history" ? (() => { const movement = selected as HistoryItem; return <FinanceDetailGrid><FinanceDetailValue label={t("account")}>{movement.financialAccount.code} · {movement.financialAccount.name}</FinanceDetailValue><FinanceDetailValue label={t("transactionType")}>{movement.transactionType === "PAYMENT" ? t("payment") : financeEnumLabel(movement.transactionType, locale)}</FinanceDetailValue><FinanceDetailValue label={t("direction")}>{movement.direction === "INBOUND" ? t("inbound") : t("outbound")}</FinanceDetailValue><FinanceDetailValue label={t("amount")}>{financeMoney(movement.amount, movement.currencyCode, locale)}</FinanceDetailValue><FinanceDetailValue label={t("reference")}>{movement.reference || "—"}</FinanceDetailValue><FinanceDetailValue label={t("transfer")}>{movement.transfer?.number || "—"}</FinanceDetailValue><FinanceDetailValue label={t("payment")}>{movement.payment?.number || "—"}</FinanceDetailValue><FinanceDetailValue label={t("status")}><StatusBadge tone={financeStatusTone(movement.status)}>{financeStatusLabel(movement.status, locale)}</StatusBadge></FinanceDetailValue></FinanceDetailGrid>; })() : null}
    </Dialog>
  </ModuleWorkspace>;
}
