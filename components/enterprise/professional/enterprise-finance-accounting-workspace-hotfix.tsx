"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, CheckCircle2, Edit3, Plus, RefreshCw, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { EnterpriseAccountingOnboardingPanel } from "@/components/enterprise/professional/enterprise-accounting-onboarding-panel";
import { FinanceAccountingReferenceSelect } from "@/components/enterprise/core-v2/finance-accounting-reference-select";
import { AssignedApprovalSubmitPanel } from "@/components/enterprise/professional/assigned-approval-submit-panel";
import { ProfessionalError, ProfessionalFormSection, ProfessionalHelp, ProfessionalLoading, ProfessionalSearch, ProfessionalTabs } from "@/components/enterprise/professional/professional-erp-ui";
import { financeDate, financeEnumLabel, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { financeMutation, type FinanceRecord } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { getAccountingActionCopy, getAccountingWorkspaceCopy } from "@/lib/enterprise/accounting/accounting-workspace-copy";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
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

type TabKey = "setup" | "overview" | "charts" | "accounts" | "years" | "periods" | "journals" | "entries" | "ledger" | "trial" | "rules" | "anomalies";
type EntryCapabilities = { canSubmit?: boolean; canApprove?: boolean; canReject?: boolean; canPost?: boolean; canReverse?: boolean };
type Item = FinanceRecord & {
  nameFr?: string; nameEn?: string; accountType?: string; journalType?: string; isActive?: boolean; requiresApproval?: boolean;
  fiscalYear?: { id?: string; code?: string } | null; fiscalPeriod?: { id?: string; code?: string } | null; journal?: { id?: string; code?: string; nameFr?: string; nameEn?: string } | null;
  functionalCurrencyCode?: string; totalDebit?: string | number; totalCredit?: string | number; preparedByUserId?: string; capabilities?: EntryCapabilities;
};
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type Payload = { items?: Item[]; pagination?: Pagination; metrics?: Record<string, unknown>; charts?: Record<string, unknown>; disclaimer?: string };
type EntryAction = { item: Item; action: "APPROVE" | "REJECT" | "POST" | "REVERSE" };

const EMPTY_PAGINATION: Pagination = { page: 1, pageSize: 25, total: 0, pageCount: 1 };
const TABS: TabKey[] = ["setup", "overview", "charts", "accounts", "years", "periods", "journals", "entries", "ledger", "trial", "rules", "anomalies"];

function text(item: Item | null | undefined, key: string) { const value = item?.[key]; return value === null || value === undefined ? "" : String(value); }
function localName(item: Item, locale: FinanceLocale) { return locale === "en" ? item.nameEn || item.nameFr || "" : item.nameFr || item.nameEn || ""; }
function endpointFor(tab: TabKey) {
  if (tab === "charts") return { path: "charts-of-accounts" };
  if (tab === "accounts") return { path: "ledger-accounts" };
  if (tab === "years") return { path: "fiscal-years" };
  if (tab === "periods") return { path: "fiscal-periods" };
  if (tab === "journals") return { path: "journals" };
  if (tab === "entries") return { path: "journal-entries" };
  if (tab === "ledger") return { path: "accounting-professional", view: "general-ledger" };
  if (tab === "trial") return { path: "accounting-professional", view: "trial-balance" };
  if (tab === "rules") return { path: "accounting-professional", view: "posting-rules" };
  if (tab === "anomalies") return { path: "accounting-professional", view: "anomalies" };
  return { path: "accounting-professional", view: "overview" };
}
function recordTitle(item: Item, tab: TabKey, locale: FinanceLocale) {
  if (tab === "entries") return item.number || item.reference || item.id;
  if (tab === "ledger") return `${text(item, "accountCode")} · ${locale === "en" ? text(item, "accountNameEn") : text(item, "accountNameFr")}`;
  if (tab === "trial") return `${item.code || ""} · ${localName(item, locale)}`;
  if (tab === "rules") return text(item, "mappingKey") || item.reference || item.id;
  return item.code ? `${item.code} · ${localName(item, locale) || item.reference || ""}` : item.reference || item.id;
}
function recordSubtitle(item: Item, tab: TabKey, locale: FinanceLocale) {
  if (tab === "entries") return `${item.journal?.code || "—"} · ${item.fiscalPeriod?.code || "—"} · ${financeDate(item.accountingDate as string, locale)}`;
  if (tab === "accounts") return `${financeEnumLabel(item.accountType || "", locale)}${item.currencyCode ? ` · ${item.currencyCode}` : ""}`;
  if (tab === "journals") return `${financeEnumLabel(item.journalType || "", locale)} · ${item.requiresApproval ? (locale === "en" ? "Independent approval" : "Validation indépendante") : (locale === "en" ? "Direct workflow" : "Workflow direct")}`;
  if (tab === "years" || tab === "periods") return `${financeDate(item.startDate as string, locale)} → ${financeDate(item.endDate as string, locale)}`;
  return text(item, "description") || text(item, "sourceModule") || "";
}
function exactParam(tab: TabKey) {
  if (tab === "charts") return "chartId";
  if (tab === "accounts") return "accountId";
  if (tab === "years") return "fiscalYearId";
  if (tab === "periods") return "periodId";
  if (tab === "journals") return "journalId";
  if (tab === "entries") return "entryId";
  return "";
}

export function EnterpriseFinanceAccountingWorkspaceHotfix(props: Props) {
  const { organizationId, organizationName, definition, locale: rawLocale, canCreate, canSubmit, canWrite, canApprove, canManage } = props;
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const copy = getAccountingWorkspaceCopy(locale);
  const actions = getAccountingActionCopy(locale);
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as TabKey | null;
  const [tab, setTab] = useState<TabKey>(requestedTab && TABS.includes(requestedTab) ? requestedTab : "setup");
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [payload, setPayload] = useState<Payload>({});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Item | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<Item | null>(null);
  const [entryAction, setEntryAction] = useState<EntryAction | null>(null);
  const [chartId, setChartId] = useState("");
  const [accountType, setAccountType] = useState("ASSET");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  useToastMessage(message, "success"); useToastMessage(errorMessage, "error");

  const tabs = useMemo(() => [
    { id: "setup", label: copy.setup }, { id: "overview", label: copy.overview }, { id: "charts", label: copy.charts }, { id: "accounts", label: copy.accounts },
    { id: "years", label: copy.years }, { id: "periods", label: copy.periods }, { id: "journals", label: copy.journals }, { id: "entries", label: copy.entries },
    { id: "ledger", label: copy.ledger }, { id: "trial", label: copy.trial }, { id: "rules", label: copy.rules }, { id: "anomalies", label: copy.anomalies },
  ], [copy]);

  useEffect(() => {
    if (tab === "setup") return;
    const controller = new AbortController();
    const endpoint = endpointFor(tab);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (endpoint.view) params.set("view", endpoint.view);
    if (tab === "overview") params.set("range", "90");
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    setLoading(true); setErrorMessage("");
    fetch(`/api/enterprise/${organizationId}/${endpoint.path}?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const body = await response.json().catch(() => ({})) as Payload & { error?: string; message?: string }; if (!response.ok) throw new Error(body.message || body.error || copy.loadFailed); setPayload(body); setItems(Array.isArray(body.items) ? body.items : []); setPagination(body.pagination || { ...EMPTY_PAGINATION, total: Array.isArray(body.items) ? body.items.length : 0 }); })
      .catch((error) => { if (error instanceof DOMException && error.name === "AbortError") return; setItems([]); setPagination(EMPTY_PAGINATION); setErrorMessage(safeFinanceError(error, copy.loadFailed, locale)); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [copy.loadFailed, locale, organizationId, page, refreshKey, search, status, tab]);

  useEffect(() => {
    for (const candidate of ["charts", "accounts", "years", "periods", "journals", "entries"] as TabKey[]) {
      const param = exactParam(candidate); const id = param ? searchParams.get(param) : null; if (!id) continue;
      const endpoint = endpointFor(candidate);
      const query = new URLSearchParams({ page: "1", pageSize: "1", recordId: id });
      void fetch(`/api/enterprise/${organizationId}/${endpoint.path}?${query.toString()}`, { cache: "no-store" }).then(async (response) => { const body = await response.json().catch(() => ({})) as Payload; if (response.ok && Array.isArray(body.items) && body.items[0]) { setTab(candidate); setDetail(body.items[0]); } });
      break;
    }
  }, [organizationId, searchParams]);

  function changeTab(next: string) { setTab(next as TabKey); setSearch(""); setStatus(""); setPage(1); setDetail(null); setPayload({}); }
  function refresh(success?: string) { setDetail(null); setRefreshKey((value) => value + 1); if (success) setMessage(success); }
  function canCreateHere() {
    if (tab === "charts") return canManage;
    return canCreate && ["accounts", "years", "periods", "journals", "entries"].includes(tab);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try {
      const base = `/api/enterprise/${organizationId}`;
      if (editing && tab === "years") await financeMutation(`${base}/fiscal-years/${editing.id}`, { code: String(form.get("code") || ""), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || ""), revision: editing.revision }, "PATCH");
      else if (editing && tab === "periods") await financeMutation(`${base}/fiscal-periods/${editing.id}`, { fiscalYearId: String(form.get("fiscalYearId") || ""), code: String(form.get("code") || ""), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || ""), revision: editing.revision }, "PATCH");
      else if (editing && tab === "journals") await financeMutation(`${base}/journals/${editing.id}`, { code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || ""), journalType: String(form.get("journalType") || "GENERAL"), sequencePrefix: String(form.get("sequencePrefix") || "") || null, requiresApproval: form.get("requiresApproval") === "on", isActive: form.get("isActive") === "on", revision: editing.revision }, "PATCH");
      else if (tab === "charts") await financeMutation(`${base}/charts-of-accounts`, { code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || "") });
      else if (tab === "accounts") await financeMutation(`${base}/ledger-accounts`, { chartId: String(form.get("chartId") || ""), parentId: String(form.get("parentId") || "") || undefined, code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || ""), accountType: String(form.get("accountType") || "ASSET"), currencyCode: String(form.get("currencyCode") || "") || undefined, isControlAccount: false, isSystemAccount: false, allowDirectPosting: form.get("allowDirectPosting") === "on" });
      else if (tab === "years") await financeMutation(`${base}/fiscal-years`, { code: String(form.get("code") || ""), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") });
      else if (tab === "periods") await financeMutation(`${base}/fiscal-periods`, { fiscalYearId: String(form.get("fiscalYearId") || ""), code: String(form.get("code") || ""), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") });
      else if (tab === "journals") await financeMutation(`${base}/journals`, { code: String(form.get("code") || ""), nameFr: String(form.get("nameFr") || ""), nameEn: String(form.get("nameEn") || ""), journalType: String(form.get("journalType") || "GENERAL"), sequencePrefix: String(form.get("sequencePrefix") || "") || undefined, requiresApproval: form.get("requiresApproval") === "on" });
      else if (tab === "entries") {
        const amount = String(form.get("amount") || "0"); const currency = String(form.get("currencyCode") || "");
        await financeMutation(`${base}/journal-entries`, { journalId: String(form.get("journalId") || ""), fiscalPeriodId: String(form.get("fiscalPeriodId") || ""), accountingDate: String(form.get("accountingDate") || ""), reference: String(form.get("reference") || "") || undefined, description: String(form.get("description") || ""), idempotencyKey: `${organizationId}:manual-entry:${crypto.randomUUID()}`, lines: [{ ledgerAccountId: String(form.get("debitAccountId") || ""), debit: amount, credit: "0", transactionCurrencyCode: currency, transactionAmount: amount }, { ledgerAccountId: String(form.get("creditAccountId") || ""), debit: "0", credit: amount, transactionCurrencyCode: currency, transactionAmount: amount }] });
      }
      setFormOpen(false); setEditing(null); refresh(editing ? actions.updated : copy.successTitle);
    } catch (error) { setErrorMessage(safeFinanceError(error, copy.saveFailed, locale)); }
    finally { setBusy(false); }
  }

  async function submitApproval(approverUserId: string) {
    if (!approvalTarget) return; setBusy(true); setErrorMessage("");
    try { await financeMutation(`/api/enterprise/${organizationId}/journal-entries/${approvalTarget.id}/transition`, { action: "SUBMIT", revision: approvalTarget.revision, approverUserId }); setApprovalTarget(null); refresh(locale === "en" ? "Entry submitted for approval." : "Écriture soumise pour validation."); }
    catch (error) { setErrorMessage(safeFinanceError(error, copy.saveFailed, locale)); } finally { setBusy(false); }
  }

  async function submitEntryAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!entryAction) return; const form = new FormData(event.currentTarget); setBusy(true); setErrorMessage("");
    try {
      if (entryAction.action === "REVERSE") await financeMutation(`/api/enterprise/${organizationId}/journal-entries/${entryAction.item.id}/reverse`, { accountingDate: String(form.get("accountingDate") || ""), reason: String(form.get("reason") || "") });
      else await financeMutation(`/api/enterprise/${organizationId}/journal-entries/${entryAction.item.id}/transition`, { action: entryAction.action, revision: entryAction.item.revision, ...(entryAction.action === "REJECT" ? { reason: String(form.get("reason") || "") } : {}) });
      setEntryAction(null); refresh(locale === "en" ? "Journal workflow updated." : "Workflow de l’écriture mis à jour.");
    } catch (error) { setErrorMessage(safeFinanceError(error, copy.saveFailed, locale)); } finally { setBusy(false); }
  }

  async function deleteRecord() {
    if (!deleteTarget || !["years", "periods", "journals"].includes(tab)) return; setBusy(true); setErrorMessage("");
    const segment = tab === "years" ? "fiscal-years" : tab === "periods" ? "fiscal-periods" : "journals";
    try { await financeMutation(`/api/enterprise/${organizationId}/${segment}/${deleteTarget.id}`, { revision: deleteTarget.revision }, "DELETE"); setDeleteTarget(null); refresh(actions.deleted); }
    catch (error) { setErrorMessage(safeFinanceError(error, copy.saveFailed, locale)); } finally { setBusy(false); }
  }

  const overviewMetrics = payload.metrics || {};
  const detailCurrency = detail?.functionalCurrencyCode || detail?.currencyCode || "USD";

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`${copy.moduleEyebrow} · ${organizationName}`} title={locale === "en" ? definition.labelEn : definition.labelFr} description={copy.moduleDescription} count={tab === "setup" ? undefined : `${pagination.total}`} primaryAction={canCreateHere() ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" />{copy.newItem}</Button> : undefined} secondaryActions={tab !== "setup" ? <Button variant="outline" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{copy.refresh}</Button> : undefined} />
    <ProfessionalTabs value={tab} onChange={changeTab} items={tabs} label={copy.moduleEyebrow} />

    {tab === "setup" ? <ModuleContent><EnterpriseAccountingOnboardingPanel organizationId={organizationId} locale={rawLocale} canManage={canManage} /></ModuleContent> : <>
      {tab !== "overview" ? <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={copy.search} />} controls={<select className="h-11 min-w-40 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">{copy.allStatuses}</option>{["DRAFT", "OPEN", "ACTIVE", "INACTIVE", "PENDING_APPROVAL", "APPROVED", "POSTED", "CLOSED", "LOCKED", "FAILED"].map((value) => <option key={value} value={value}>{financeStatusLabel(value, locale)}</option>)}</select>} summary={`${pagination.total}`} /> : null}
      <ModuleContent>
        <ModuleSection title={tabs.find((item) => item.id === tab)?.label || copy.details} description={tab === "overview" ? copy.overviewDescription : tab === "entries" ? copy.entriesDescription : copy.formHelp} count={tab === "overview" ? undefined : pagination.total}>
          {tab === "overview" ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(overviewMetrics).slice(0, 8).map(([key, value]) => <div key={key} className="border-l-2 border-dtsc-blue pl-3"><p className="text-xs font-black uppercase tracking-wide text-dtsc-muted">{financeEnumLabel(key, locale)}</p><p className="mt-1 text-2xl font-black tabular-nums text-dtsc-ink">{String(value ?? 0)}</p></div>)}</div> : loading ? <ProfessionalLoading /> : errorMessage && !items.length ? <ProfessionalError message={errorMessage} /> : items.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center border-y border-dashed border-dtsc-border py-10 text-center"><BookOpen className="h-8 w-8 text-dtsc-muted" /><p className="mt-3 font-black">{copy.noData}</p><p className="mt-1 text-sm text-dtsc-muted">{copy.noDataHelp}</p></div> : <div className="divide-y divide-dtsc-border border-y border-dtsc-border">{items.map((item, index) => <article key={item.id || `${tab}-${index}`} className="py-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetail(item)}><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-black text-dtsc-ink">{recordTitle(item, tab, locale)}</h3>{item.status ? <StatusBadge tone={financeStatusTone(item.status)}>{financeStatusLabel(item.status, locale)}</StatusBadge> : null}</div><p className="mt-1 text-sm text-dtsc-muted">{recordSubtitle(item, tab, locale)}</p>{tab === "entries" ? <p className="mt-2 text-sm font-black tabular-nums">{financeMoney(item.totalDebit || 0, item.functionalCurrencyCode || "USD", locale)}</p> : null}</button><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setDetail(item)}>{copy.openDetails}</Button>{tab === "entries" && item.capabilities?.canSubmit ? <Button size="sm" variant="outline" onClick={() => setApprovalTarget(item)}><Send className="h-4 w-4" />{locale === "en" ? "Submit" : "Soumettre"}</Button> : null}{tab === "entries" && item.capabilities?.canApprove ? <Button size="sm" onClick={() => setEntryAction({ item, action: "APPROVE" })}><CheckCircle2 className="h-4 w-4" />{locale === "en" ? "Approve" : "Approuver"}</Button> : null}{tab === "entries" && item.capabilities?.canReject ? <Button size="sm" variant="outline" onClick={() => setEntryAction({ item, action: "REJECT" })}><XCircle className="h-4 w-4" />{locale === "en" ? "Reject" : "Refuser"}</Button> : null}{tab === "entries" && item.capabilities?.canPost ? <Button size="sm" onClick={() => setEntryAction({ item, action: "POST" })}>{locale === "en" ? "Post" : "Comptabiliser"}</Button> : null}{tab === "entries" && item.capabilities?.canReverse ? <Button size="sm" variant="outline" onClick={() => setEntryAction({ item, action: "REVERSE" })}><Undo2 className="h-4 w-4" />{locale === "en" ? "Reverse" : "Contrepasser"}</Button> : null}{canWrite && ["years", "periods", "journals"].includes(tab) ? <Button size="sm" variant="ghost" onClick={() => { setEditing(item); setFormOpen(true); }}><Edit3 className="h-4 w-4" />{copy.edit}</Button> : null}{canManage && ["years", "periods", "journals"].includes(tab) ? <Button size="icon" variant="ghost" aria-label={locale === "en" ? "Delete" : "Supprimer"} onClick={() => setDeleteTarget(item)}><Trash2 className="h-4 w-4" /></Button> : null}</div></div></article>)}</div>}
          {tab !== "overview" && pagination.pageCount > 1 ? <div className="mt-4 flex items-center justify-between gap-3"><Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button><span className="text-sm font-bold text-dtsc-muted">{pagination.page}/{pagination.pageCount}</span><Button variant="outline" disabled={page >= pagination.pageCount || loading} onClick={() => setPage((value) => Math.min(pagination.pageCount, value + 1))}>{copy.next}</Button></div> : null}
        </ModuleSection>
        <ProfessionalHelp moduleCode="FINANCE_ACCOUNTING" />
      </ModuleContent>
    </>}

    <Dialog open={formOpen} onClose={() => { if (!busy) { setFormOpen(false); setEditing(null); } }} title={editing ? `${copy.edit} · ${recordTitle(editing, tab, locale)}` : copy.newItem} description={copy.formHelp} presentation="editor" className="max-w-5xl">
      <form onSubmit={submitCreate} className="grid gap-6"><ProfessionalFormSection title={tabs.find((item) => item.id === tab)?.label || copy.newItem}>
        {tab === "charts" ? <><Input name="code" defaultValue={editing?.code || ""} placeholder={copy.code} required disabled={busy} /><Input name="nameFr" defaultValue={editing?.nameFr || ""} placeholder={copy.nameFr} required disabled={busy} /><Input name="nameEn" defaultValue={editing?.nameEn || ""} placeholder={copy.nameEn} required disabled={busy} /></> : null}
        {tab === "accounts" ? <><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="chart" name="chartId" label={copy.charts} locale={rawLocale} status="ACTIVE" required disabled={busy} onOptionChange={(option) => setChartId(option?.id || "")} /><Input name="code" placeholder={copy.code} required disabled={busy} /><Input name="nameFr" placeholder={copy.nameFr} required disabled={busy} /><Input name="nameEn" placeholder={copy.nameEn} required disabled={busy} /><select name="accountType" value={accountType} onChange={(event) => setAccountType(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3" disabled={busy}>{["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"].map((value) => <option key={value} value={value}>{financeEnumLabel(value, locale)}</option>)}</select><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="ledger-account" name="parentId" label={copy.parentAccount} locale={rawLocale} parentId={chartId} accountType={accountType} disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="currency" name="currencyCode" label={copy.currency} locale={rawLocale} disabled={busy} /><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="allowDirectPosting" defaultChecked />{copy.allowDirectPosting}</label></> : null}
        {tab === "years" ? <><Input name="code" defaultValue={editing?.code || ""} placeholder={copy.code} required disabled={busy} /><Input name="startDate" type="date" defaultValue={editing?.startDate ? new Date(String(editing.startDate)).toISOString().slice(0, 10) : ""} required disabled={busy} /><Input name="endDate" type="date" defaultValue={editing?.endDate ? new Date(String(editing.endDate)).toISOString().slice(0, 10) : ""} required disabled={busy} /></> : null}
        {tab === "periods" ? <><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="fiscal-year" name="fiscalYearId" label={copy.fiscalYear} locale={rawLocale} required disabled={busy} /><Input name="code" defaultValue={editing?.code || ""} placeholder={copy.code} required disabled={busy} /><Input name="startDate" type="date" defaultValue={editing?.startDate ? new Date(String(editing.startDate)).toISOString().slice(0, 10) : ""} required disabled={busy} /><Input name="endDate" type="date" defaultValue={editing?.endDate ? new Date(String(editing.endDate)).toISOString().slice(0, 10) : ""} required disabled={busy} /></> : null}
        {tab === "journals" ? <><Input name="code" defaultValue={editing?.code || ""} placeholder={copy.code} required disabled={busy} /><Input name="nameFr" defaultValue={editing?.nameFr || ""} placeholder={copy.nameFr} required disabled={busy} /><Input name="nameEn" defaultValue={editing?.nameEn || ""} placeholder={copy.nameEn} required disabled={busy} /><select name="journalType" defaultValue={editing?.journalType || "GENERAL"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3" disabled={busy}>{["GENERAL", "SALES", "PURCHASES", "CASH", "BANK", "MOBILE_MONEY", "PAYROLL", "INVENTORY", "ASSETS", "TAX", "OPENING", "ADJUSTMENT"].map((value) => <option key={value} value={value}>{financeEnumLabel(value, locale)}</option>)}</select><Input name="sequencePrefix" defaultValue={text(editing, "sequencePrefix")} placeholder={copy.sequencePrefix} disabled={busy} /><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="requiresApproval" defaultChecked={Boolean(editing?.requiresApproval)} disabled={busy} />{copy.approvalRequired}</label>{editing ? <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isActive" defaultChecked={editing.isActive !== false} disabled={busy} />{copy.active}</label> : null}</> : null}
        {tab === "entries" ? <><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="journal" name="journalId" label={copy.journal} locale={rawLocale} required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="fiscal-period" name="fiscalPeriodId" label={copy.period} locale={rawLocale} required disabled={busy} /><Input name="accountingDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required disabled={busy} /><Input name="reference" placeholder={copy.reference} disabled={busy} /><Input name="description" placeholder={copy.description} required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="ledger-account" name="debitAccountId" label={copy.debit} locale={rawLocale} directPosting required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="ledger-account" name="creditAccountId" label={copy.credit} locale={rawLocale} directPosting required disabled={busy} /><Input name="amount" type="number" step="0.01" min="0.01" placeholder={copy.amount} required disabled={busy} /><FinanceAccountingReferenceSelect organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" kind="currency" name="currencyCode" label={copy.currency} locale={rawLocale} required disabled={busy} /></> : null}
      </ProfessionalFormSection><Button type="submit" disabled={busy}>{busy ? copy.processing : copy.save}</Button></form>
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => { if (!busy) setDetail(null); }} title={detail ? recordTitle(detail, tab, locale) : copy.details} description={recordSubtitle(detail || ({} as Item), tab, locale)} presentation="editor" className="max-w-4xl">
      {detail ? <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.status}</p><StatusBadge tone={financeStatusTone(detail.status || "ACTIVE")}>{financeStatusLabel(detail.status || "ACTIVE", locale)}</StatusBadge></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.reference}</p><p className="font-bold">{detail.reference || detail.number || detail.code || detail.id}</p></div>{tab === "entries" ? <><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.debit}</p><p className="font-bold">{financeMoney(detail.totalDebit || 0, detailCurrency, locale)}</p></div><div><p className="text-xs font-black uppercase text-dtsc-muted">{copy.credit}</p><p className="font-bold">{financeMoney(detail.totalCredit || 0, detailCurrency, locale)}</p></div></> : null}</div> : null}
    </Dialog>

    <Dialog open={Boolean(approvalTarget)} onClose={() => { if (!busy) setApprovalTarget(null); }} title={locale === "en" ? "Assign approval" : "Affecter la validation"} description={locale === "en" ? "Choose the authorized approver for this journal entry." : "Choisissez l’approbateur autorisé pour cette écriture."} presentation="editor">
      {approvalTarget ? <AssignedApprovalSubmitPanel organizationId={organizationId} moduleCode="FINANCE_ACCOUNTING" locale={rawLocale} submitting={busy} onSubmit={submitApproval} onCancel={() => setApprovalTarget(null)} /> : null}
    </Dialog>

    <Dialog open={Boolean(entryAction)} onClose={() => { if (!busy) setEntryAction(null); }} title={entryAction ? financeEnumLabel(entryAction.action, locale) : copy.actions} description={copy.entriesDescription} presentation="editor">
      <form onSubmit={submitEntryAction} className="grid gap-4">{entryAction?.action === "REJECT" || entryAction?.action === "REVERSE" ? <Input name="reason" minLength={8} required placeholder={locale === "en" ? "Detailed reason" : "Motif détaillé"} disabled={busy} /> : null}{entryAction?.action === "REVERSE" ? <Input name="accountingDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required disabled={busy} /> : null}<Button type="submit" disabled={busy}>{locale === "en" ? "Confirm" : "Confirmer"}</Button></form>
    </Dialog>

    <Dialog open={Boolean(deleteTarget)} onClose={() => { if (!busy) setDeleteTarget(null); }} title={locale === "en" ? "Delete this item?" : "Supprimer cet élément ?"} description={locale === "en" ? "The server will refuse deletion when accounting history depends on it." : "Le serveur refusera la suppression si l’historique comptable en dépend."} presentation="editor"><Button variant="destructive" disabled={busy} onClick={() => void deleteRecord()}><Trash2 className="h-4 w-4" />{locale === "en" ? "Delete" : "Supprimer"}</Button></Dialog>
  </ModuleWorkspace>;
}
