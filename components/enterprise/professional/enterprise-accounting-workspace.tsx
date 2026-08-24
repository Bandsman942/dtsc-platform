"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { BarChart3, BookOpen, Ellipsis, Plus, RefreshCw, Save, Search, Settings2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EnterpriseAccountingOnboardingPanel } from "@/components/enterprise/professional/enterprise-accounting-onboarding-panel";
import { ProfessionalFormSection, ProfessionalLoading, ProfessionalTabs } from "@/components/enterprise/professional/professional-erp-ui";
import { financeDate, financeEnumLabel, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ForegroundToast } from "@/components/ui/foreground-toast";
import { Input } from "@/components/ui/input";
import { BusinessDetail, BusinessDetailField, BusinessDetailGrid, BusinessDetailHeader, BusinessDetailSection } from "@/components/workspace/business-detail";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { getAccountingWorkspaceCopy } from "@/lib/enterprise/accounting/accounting-workspace-copy";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type TabKey = "setup" | "overview" | "charts" | "accounts" | "years" | "periods" | "journals" | "entries" | "ledger" | "trial" | "rules" | "anomalies";
type Item = Record<string, unknown> & { id: string; status?: string; revision?: number };
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type ChartDatum = { key: string; label: string; value: number; amount?: string; currencyCode?: string };
type Payload = {
  items?: Item[];
  metrics?: Record<string, number>;
  pagination?: Pagination;
  charts?: { workflow?: ChartDatum[]; journals?: ChartDatum[] };
  range?: string;
};
type LookupState = { charts: Item[]; years: Item[]; periods: Item[]; journals: Item[]; accounts: Item[] };
type FormState = Record<string, string | boolean>;
type ToastState = { tone: "error" | "success"; title: string; message: string } | null;
type Props = { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition; locale?: string | null; canManage: boolean };

const EMPTY_ITEMS: Item[] = [];
const EMPTY_LOOKUPS: LookupState = { charts: [], years: [], periods: [], journals: [], accounts: [] };
const DEFAULT_FORM: FormState = {
  code: "", nameFr: "", nameEn: "", startDate: "", endDate: "", fiscalYearId: "", chartId: "", parentId: "",
  accountType: "ASSET", accountSubtype: "", currencyCode: "USD", isControlAccount: false, allowDirectPosting: true,
  journalType: "GENERAL", sequencePrefix: "", requiresApproval: true, journalId: "", fiscalPeriodId: "", accountingDate: new Date().toISOString().slice(0, 10),
  reference: "", description: "", debitAccountId: "", creditAccountId: "", amount: "",
};

function stringValue(item: Item | null | undefined, key: string) {
  const value = item?.[key];
  return value === null || value === undefined ? "" : String(value);
}
function nestedValue(item: Item | null | undefined, parent: string, key: string) {
  const value = item?.[parent];
  return value && typeof value === "object" && key in value ? String((value as Record<string, unknown>)[key] ?? "") : "";
}
function booleanValue(item: Item | null | undefined, key: string) { return Boolean(item?.[key]); }
function localName(item: Item, locale: FinanceLocale) { return locale === "fr" ? stringValue(item, "nameFr") : stringValue(item, "nameEn"); }

async function requestJson(url: string, fallback: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null) as ({ message?: string; error?: string } & Record<string, unknown>) | null;
  if (!response.ok || !body) throw new Error(body?.message || body?.error || fallback);
  return body;
}

function endpointFor(tab: TabKey, range: string) {
  if (tab === "overview") return `accounting-professional?view=overview&range=${range}`;
  if (tab === "charts") return "charts-of-accounts";
  if (tab === "accounts") return "ledger-accounts";
  if (tab === "years") return "fiscal-years";
  if (tab === "periods") return "fiscal-periods";
  if (tab === "journals") return "journals";
  if (tab === "entries") return "journal-entries";
  if (tab === "ledger") return "accounting-professional?view=general-ledger";
  if (tab === "trial") return "accounting-professional?view=trial-balance";
  if (tab === "rules") return "accounting-professional?view=posting-rules";
  if (tab === "anomalies") return "accounting-professional?view=anomalies";
  return "";
}

export function EnterpriseAccountingWorkspace({ organizationId, organizationName, definition, locale: rawLocale, canManage }: Props) {
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const copy = getAccountingWorkspaceCopy(locale);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const validTabs: TabKey[] = ["setup", "overview", "charts", "accounts", "years", "periods", "journals", "entries", "ledger", "trial", "rules", "anomalies"];
  const requestedTab = searchParams.get("tab") as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(requestedTab && validTabs.includes(requestedTab) ? requestedTab : "setup");
  const [payload, setPayload] = useState<Payload>({ items: [] });
  const [lookups, setLookups] = useState<LookupState>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [range, setRange] = useState("90");
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const tabs = useMemo(() => [
    { id: "setup" as const, label: copy.setup }, { id: "overview" as const, label: copy.overview }, { id: "charts" as const, label: copy.charts },
    { id: "accounts" as const, label: copy.accounts }, { id: "years" as const, label: copy.years }, { id: "periods" as const, label: copy.periods },
    { id: "journals" as const, label: copy.journals }, { id: "entries" as const, label: copy.entries }, { id: "ledger" as const, label: copy.ledger },
    { id: "trial" as const, label: copy.trial }, { id: "rules" as const, label: copy.rules }, { id: "anomalies" as const, label: copy.anomalies },
  ], [copy]);

  useEffect(() => {
    const next = requestedTab && validTabs.includes(requestedTab) ? requestedTab : "setup";
    if (next !== activeTab) setActiveTab(next);
  }, [activeTab, requestedTab]);

  const selectTab = useCallback((tab: TabKey) => {
    setActiveTab(tab); setSearch(""); setStatus(""); setPage(1); setDetailItem(null); setOpenMenuId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadLookups = useCallback(async () => {
    const base = `/api/enterprise/${organizationId}`;
    const results = await Promise.allSettled([
      requestJson(`${base}/charts-of-accounts`, copy.loadFailed), requestJson(`${base}/fiscal-years`, copy.loadFailed),
      requestJson(`${base}/fiscal-periods`, copy.loadFailed), requestJson(`${base}/journals`, copy.loadFailed),
      requestJson(`${base}/ledger-accounts?page=1&pageSize=500`, copy.loadFailed),
    ]);
    const items = (index: number) => results[index].status === "fulfilled" && Array.isArray((results[index] as PromiseFulfilledResult<Record<string, unknown>>).value.items) ? (results[index] as PromiseFulfilledResult<Record<string, unknown>>).value.items as Item[] : [];
    setLookups({ charts: items(0), years: items(1), periods: items(2), journals: items(3), accounts: items(4) });
  }, [copy.loadFailed, organizationId]);

  const load = useCallback(async () => {
    if (activeTab === "setup") return;
    setLoading(true);
    try {
      const base = endpointFor(activeTab, range);
      const separator = base.includes("?") ? "&" : "?";
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (status.trim()) params.set("status", status.trim());
      const body = await requestJson(`/api/enterprise/${organizationId}/${base}${separator}${params.toString()}`, copy.loadFailed) as unknown as Payload;
      setPayload({ ...body, items: Array.isArray(body.items) ? body.items : [] });
    } catch (error) {
      setToast({ tone: "error", title: copy.errorTitle, message: safeFinanceError(error, copy.loadFailed, locale) });
      setPayload({ items: [] });
    } finally { setLoading(false); }
  }, [activeTab, copy.errorTitle, copy.loadFailed, locale, organizationId, page, range, search, status]);

  useEffect(() => { void loadLookups(); }, [loadLookups]);
  useEffect(() => { void load(); }, [load]);

  const allItems = payload.items || EMPTY_ITEMS;
  const filteredItems = useMemo(() => {
    if (["accounts", "entries", "ledger", "trial", "rules", "anomalies", "overview"].includes(activeTab)) return allItems;
    const query = search.trim().toLowerCase();
    return allItems.filter((item) => {
      const matchesSearch = !query || ["code", "nameFr", "nameEn", "reference", "description"].some((key) => stringValue(item, key).toLowerCase().includes(query));
      const itemStatus = item.status ? String(item.status) : booleanValue(item, "isActive") ? "ACTIVE" : "INACTIVE";
      return matchesSearch && (!status || itemStatus === status);
    });
  }, [activeTab, allItems, search, status]);
  const pagination = payload.pagination || { page: 1, pageSize: 25, total: filteredItems.length, pageCount: 1 };
  const canCreate = canManage && ["charts", "accounts", "years", "periods", "journals", "entries"].includes(activeTab);
  const sectionDescription = descriptionFor(activeTab, copy);

  function updateForm(key: string, value: string | boolean) { setForm((current) => ({ ...current, [key]: value })); }
  function openCreateForm() { setForm({ ...DEFAULT_FORM, accountingDate: new Date().toISOString().slice(0, 10) }); setFormOpen(true); }

  async function submitForm(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    const base = `/api/enterprise/${organizationId}`;
    try {
      if (activeTab === "charts") await requestJson(`${base}/charts-of-accounts`, copy.saveFailed, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: form.code, nameFr: form.nameFr, nameEn: form.nameEn }) });
      else if (activeTab === "accounts") await requestJson(`${base}/ledger-accounts`, copy.saveFailed, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chartId: form.chartId, parentId: form.parentId || undefined, code: form.code, nameFr: form.nameFr, nameEn: form.nameEn, accountType: form.accountType, accountSubtype: form.accountSubtype || undefined, currencyCode: form.currencyCode || undefined, isControlAccount: Boolean(form.isControlAccount), isSystemAccount: false, allowDirectPosting: Boolean(form.allowDirectPosting) }) });
      else if (activeTab === "years") await requestJson(`${base}/fiscal-years`, copy.saveFailed, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: form.code, startDate: form.startDate, endDate: form.endDate }) });
      else if (activeTab === "periods") await requestJson(`${base}/fiscal-periods`, copy.saveFailed, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fiscalYearId: form.fiscalYearId, code: form.code, startDate: form.startDate, endDate: form.endDate }) });
      else if (activeTab === "journals") await requestJson(`${base}/journals`, copy.saveFailed, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: form.code, nameFr: form.nameFr, nameEn: form.nameEn, journalType: form.journalType, sequencePrefix: form.sequencePrefix || undefined, requiresApproval: Boolean(form.requiresApproval) }) });
      else if (activeTab === "entries") await requestJson(`${base}/journal-entries`, copy.saveFailed, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ journalId: form.journalId, fiscalPeriodId: form.fiscalPeriodId, accountingDate: form.accountingDate, reference: form.reference || undefined, description: form.description, idempotencyKey: `${organizationId}:manual-entry:${Date.now()}`, lines: [{ ledgerAccountId: form.debitAccountId, debit: form.amount, credit: "0", transactionCurrencyCode: form.currencyCode, transactionAmount: form.amount }, { ledgerAccountId: form.creditAccountId, debit: "0", credit: form.amount, transactionCurrencyCode: form.currencyCode, transactionAmount: form.amount }] }) });
      setFormOpen(false);
      setToast({ tone: "success", title: copy.successTitle, message: copy.successTitle });
      await Promise.all([load(), loadLookups()]);
    } catch (error) {
      setToast({ tone: "error", title: copy.errorTitle, message: safeFinanceError(error, copy.saveFailed, locale) });
    } finally { setSaving(false); }
  }

  async function openFiscalYear(item: Item) {
    setSaving(true);
    try {
      await requestJson(`/api/enterprise/${organizationId}/fiscal-years/${item.id}/open`, copy.saveFailed, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: item.revision }) });
      setToast({ tone: "success", title: copy.successTitle, message: copy.configurationReady }); setOpenMenuId(null); await Promise.all([load(), loadLookups()]);
    } catch (error) { setToast({ tone: "error", title: copy.errorTitle, message: safeFinanceError(error, copy.saveFailed, locale) }); }
    finally { setSaving(false); }
  }

  return (
    <ModuleWorkspace>
      <ForegroundToast open={Boolean(toast)} tone={toast?.tone || "success"} title={toast?.title || ""} message={toast?.message || ""} closeLabel={copy.closeToast} onClose={() => setToast(null)} />
      <ModuleHeader
        eyebrow={`${copy.moduleEyebrow} · ${organizationName}`}
        title={locale === "fr" ? definition.labelFr : definition.labelEn}
        description={copy.moduleDescription}
        primaryAction={canCreate ? <Button onClick={openCreateForm}><Plus className="h-4 w-4" />{copy.newItem}</Button> : undefined}
        secondaryActions={<Button variant="outline" onClick={() => void load()} disabled={loading || activeTab === "setup"}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{copy.refresh}</Button>}
      />

      <ProfessionalTabs value={activeTab} onChange={selectTab} items={tabs} label={copy.moduleEyebrow} />

      {activeTab === "setup" ? <ModuleContent><EnterpriseAccountingOnboardingPanel organizationId={organizationId} locale={rawLocale} canManage={canManage} /></ModuleContent> : (
        <>
          {activeTab !== "overview" ? <ModuleToolbar
            search={<div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" /><Input className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={copy.search} /></div>}
            controls={<div className="flex min-w-0 flex-wrap gap-2"><select className="min-h-11 min-w-40 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">{copy.allStatuses}</option>{["DRAFT", "OPEN", "ACTIVE", "INACTIVE", "PENDING_APPROVAL", "POSTED", "CLOSED", "LOCKED", "FAILED"].map((value) => <option key={value} value={value}>{financeStatusLabel(value, locale)}</option>)}</select><Button variant="outline" onClick={() => { setSearch(""); setStatus(""); setPage(1); }}>{copy.reset}</Button></div>}
            summary={`${pagination.total}`}
          /> : null}
          <ModuleContent>
            <ModuleSection title={tabs.find((tab) => tab.id === activeTab)?.label || copy.details} description={sectionDescription} count={pagination.total}>
              {activeTab === "overview" ? <OverviewView payload={payload} range={range} setRange={setRange} locale={locale} copy={copy} selectTab={selectTab} /> : loading ? <ProfessionalLoading /> : filteredItems.length === 0 ? <EmptyState copy={copy} /> : isTableTab(activeTab) ? <AccountingTable tab={activeTab} items={filteredItems} locale={locale} copy={copy} onOpen={setDetailItem} /> : <BusinessList tab={activeTab} items={filteredItems} locale={locale} copy={copy} canManage={canManage} openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} onOpen={setDetailItem} onOpenFiscalYear={openFiscalYear} saving={saving} />}
              {pagination.pageCount > 1 ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-dtsc-border pt-4"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy.previous}</Button><span className="text-sm font-bold text-dtsc-muted">{pagination.page} / {pagination.pageCount}</span><Button variant="outline" disabled={page >= pagination.pageCount} onClick={() => setPage((value) => Math.min(pagination.pageCount, value + 1))}>{copy.next}</Button></div> : null}
            </ModuleSection>
          </ModuleContent>
        </>
      )}

      <Dialog open={formOpen} title={copy.newItem} description={sectionDescription} onClose={() => setFormOpen(false)} className="h-[92dvh] sm:max-w-5xl" footer={<><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>{copy.cancel}</Button><Button type="submit" form="accounting-professional-form" disabled={saving}><Save className="h-4 w-4" />{saving ? copy.processing : copy.save}</Button></>}>
        <form id="accounting-professional-form" onSubmit={submitForm} className="min-w-0 space-y-5"><p className="text-sm leading-6 text-dtsc-muted">{copy.formHelp}</p><AccountingFormFields tab={activeTab} form={form} updateForm={updateForm} lookups={lookups} locale={locale} copy={copy} /></form>
      </Dialog>

      <Dialog open={Boolean(detailItem)} title={detailItem ? itemTitle(detailItem, activeTab, locale, copy) : copy.details} description={sectionDescription} onClose={() => setDetailItem(null)} className="h-[94dvh] sm:max-w-6xl">
        {detailItem ? <AccountingDetail tab={activeTab} item={detailItem} organizationId={organizationId} locale={locale} copy={copy} /> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}

function descriptionFor(tab: TabKey, copy: ReturnType<typeof getAccountingWorkspaceCopy>) {
  const map: Record<TabKey, string> = { setup: copy.setupDescription, overview: copy.overviewDescription, charts: copy.chartsDescription, accounts: copy.accountsDescription, years: copy.yearsDescription, periods: copy.periodsDescription, journals: copy.journalsDescription, entries: copy.entriesDescription, ledger: copy.ledgerDescription, trial: copy.trialDescription, rules: copy.rulesDescription, anomalies: copy.anomaliesDescription };
  return map[tab];
}
function isTableTab(tab: TabKey) { return ["entries", "ledger", "trial"].includes(tab); }

function EmptyState({ copy }: { copy: ReturnType<typeof getAccountingWorkspaceCopy> }) {
  return <div className="flex min-h-48 flex-col items-center justify-center border-y border-dashed border-dtsc-border py-10 text-center"><BookOpen className="h-8 w-8 text-dtsc-muted" /><p className="mt-3 font-black text-dtsc-ink">{copy.noData}</p><p className="mt-1 max-w-xl text-sm text-dtsc-muted">{copy.noDataHelp}</p></div>;
}

function OverviewView({ payload, range, setRange, locale, copy, selectTab }: { payload: Payload; range: string; setRange: (value: string) => void; locale: FinanceLocale; copy: ReturnType<typeof getAccountingWorkspaceCopy>; selectTab: (tab: TabKey) => void }) {
  const metrics = payload.metrics || {};
  const workflow = payload.charts?.workflow || [
    { key: "DRAFT", label: financeStatusLabel("DRAFT", locale), value: Number(metrics.draftEntries || 0) },
    { key: "PENDING_APPROVAL", label: financeStatusLabel("PENDING_APPROVAL", locale), value: Number(metrics.pendingApproval || 0) },
    { key: "POSTED", label: financeStatusLabel("POSTED", locale), value: Number(metrics.postedEntries || 0) },
    { key: "FAILED", label: financeStatusLabel("FAILED", locale), value: Number(metrics.failedPostings || 0) },
  ];
  const maxWorkflow = Math.max(1, ...workflow.map((item) => item.value));
  const interpretations: Array<{ text: string; tab?: TabKey }> = [];
  if (Number(metrics.failedPostings || 0) > 0) interpretations.push({ text: copy.failedInterpretation, tab: "anomalies" });
  else interpretations.push({ text: copy.healthyInterpretation });
  if (Number(metrics.pendingApproval || 0) > 0) interpretations.push({ text: copy.pendingInterpretation, tab: "entries" });
  if (Number(metrics.openPeriods || 0) === 0) interpretations.push({ text: copy.noOpenPeriodInterpretation, tab: "periods" });

  return <div className="min-w-0 space-y-6">
    <div className="flex min-w-0 flex-wrap items-end gap-3"><label className="text-sm font-black text-dtsc-ink">{copy.range}<select className="mt-2 block min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={range} onChange={(event) => setRange(event.target.value)}><option value="30">{copy.range30}</option><option value="90">{copy.range90}</option><option value="365">{copy.range365}</option><option value="all">{copy.rangeAll}</option></select></label></div>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <div className="min-w-0 border-y border-dtsc-border py-5"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-dtsc-blue" /><h3 className="font-black text-dtsc-ink">{copy.workflow}</h3></div><div className="mt-5 space-y-4">{workflow.map((item) => <button key={item.key} type="button" onClick={() => selectTab(item.key === "FAILED" ? "anomalies" : "entries")} className="block w-full text-left"><div className="flex justify-between gap-3 text-sm"><span className="font-bold text-dtsc-ink">{item.label}</span><span className="font-black tabular-nums">{item.value}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-dtsc-soft"><div className="h-full rounded-full bg-dtsc-blue transition-[width]" style={{ width: `${Math.max(3, Math.round((item.value / maxWorkflow) * 100))}%` }} /></div></button>)}</div></div>
      <div className="min-w-0 border-y border-dtsc-border py-5"><h3 className="font-black text-dtsc-ink">{copy.activityByJournal}</h3>{payload.charts?.journals?.length ? <div className="mt-5 space-y-4">{payload.charts.journals.map((item) => <div key={item.key}><div className="flex min-w-0 justify-between gap-3 text-sm"><span className="min-w-0 truncate font-bold text-dtsc-ink">{item.label}</span><span className="shrink-0 font-black tabular-nums">{item.value}</span></div>{item.amount ? <p className="mt-1 text-xs font-bold text-dtsc-muted">{financeMoney(item.amount, item.currencyCode || "USD", locale)}</p> : null}</div>)}</div> : <p className="mt-4 text-sm text-dtsc-muted">{copy.noDataHelp}</p>}</div>
    </div>
    <div className="border-t border-dtsc-border pt-5"><h3 className="font-black text-dtsc-ink">{copy.interpretation}</h3><div className="mt-3 grid gap-2">{interpretations.map((item, index) => item.tab ? <button key={index} type="button" className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-left text-sm leading-6 text-dtsc-ink hover:bg-dtsc-soft" onClick={() => selectTab(item.tab!)}>{item.text}</button> : <p key={index} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm leading-6 text-dtsc-ink">{item.text}</p>)}</div></div>
  </div>;
}

function BusinessList({ tab, items, locale, copy, canManage, openMenuId, setOpenMenuId, onOpen, onOpenFiscalYear, saving }: { tab: TabKey; items: Item[]; locale: FinanceLocale; copy: ReturnType<typeof getAccountingWorkspaceCopy>; canManage: boolean; openMenuId: string | null; setOpenMenuId: (id: string | null) => void; onOpen: (item: Item) => void; onOpenFiscalYear: (item: Item) => void; saving: boolean }) {
  return <div className="divide-y divide-dtsc-border border-y border-dtsc-border">{items.map((item) => <article key={item.id} className="relative min-w-0 py-4"><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item)}><div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="min-w-0 break-words font-black text-dtsc-ink">{itemTitle(item, tab, locale, copy)}</h3><StatusBadge tone={financeStatusTone(itemStatus(item))}>{financeStatusLabel(itemStatus(item), locale)}</StatusBadge></div><p className="mt-1 text-sm leading-6 text-dtsc-muted">{itemSubtitle(item, tab, locale, copy)}</p></button><div data-responsive-actions className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onOpen(item)}>{copy.openDetails}</Button>{canManage && ["years", "periods", "journals"].includes(tab) ? <div className="relative"><Button size="icon" variant="ghost" aria-label={copy.moreActions} title={copy.moreActions} aria-expanded={openMenuId === item.id} onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}><Ellipsis className="h-4 w-4" /></Button>{openMenuId === item.id ? <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-dtsc-border bg-dtsc-surface p-1 shadow-xl"><button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-dtsc-soft" onClick={() => { onOpen(item); setOpenMenuId(null); }}>{copy.openDetails}</button>{tab === "years" && itemStatus(item) === "DRAFT" ? <button type="button" disabled={saving} className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-dtsc-soft disabled:opacity-50" onClick={() => void onOpenFiscalYear(item)}>{copy.openFiscalYear}</button> : null}{tab === "periods" ? <Link className="block rounded-lg px-3 py-2 text-sm font-bold hover:bg-dtsc-soft" href="/enterprise-modules/FINANCE_CLOSE">{copy.operationalControls}</Link> : null}</div> : null}</div> : null}</div></div></article>)}</div>;
}

function AccountingTable({ tab, items, locale, copy, onOpen }: { tab: TabKey; items: Item[]; locale: FinanceLocale; copy: ReturnType<typeof getAccountingWorkspaceCopy>; onOpen: (item: Item) => void }) {
  return <div className="min-w-0"><p className="mb-3 text-xs leading-5 text-dtsc-muted">{copy.compactTableHint}</p><div data-horizontal-rail className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-dtsc-border"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-dtsc-page text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted"><tr>{tableHeaders(tab, copy).map((header) => <th key={header} className="whitespace-nowrap border-b border-dtsc-border px-3 py-3">{header}</th>)}<th className="border-b border-dtsc-border px-3 py-3">{copy.details}</th></tr></thead><tbody className="divide-y divide-dtsc-border">{items.map((item) => <tr key={item.id} className="hover:bg-dtsc-soft/60">{tableCells(item, tab, locale, copy).map((cell, index) => <td key={index} className="max-w-72 px-3 py-3 align-top text-dtsc-ink">{cell}</td>)}<td className="px-3 py-2"><Button size="sm" variant="ghost" onClick={() => onOpen(item)}>{copy.open}</Button></td></tr>)}</tbody></table></div></div>;
}

function tableHeaders(tab: TabKey, copy: ReturnType<typeof getAccountingWorkspaceCopy>) {
  if (tab === "entries") return [copy.date, copy.number, copy.journal, copy.period, copy.reference, copy.description, copy.debit, copy.credit, copy.status];
  if (tab === "ledger") return [copy.date, copy.account, copy.journal, copy.period, copy.reference, copy.description, copy.debit, copy.credit];
  return [copy.account, copy.type, copy.debit, copy.credit, copy.balance, copy.status];
}
function tableCells(item: Item, tab: TabKey, locale: FinanceLocale, copy: ReturnType<typeof getAccountingWorkspaceCopy>): ReactNode[] {
  const currency = stringValue(item, "currencyCode") || stringValue(item, "functionalCurrencyCode") || "USD";
  if (tab === "entries") return [financeDate(item.accountingDate, locale), stringValue(item, "number"), nestedValue(item, "journal", "code"), nestedValue(item, "fiscalPeriod", "code"), stringValue(item, "reference") || "—", stringValue(item, "description"), financeMoney(item.totalDebit, currency, locale), financeMoney(item.totalCredit, currency, locale), <StatusBadge key="status" tone={financeStatusTone(itemStatus(item))}>{financeStatusLabel(itemStatus(item), locale)}</StatusBadge>];
  if (tab === "ledger") return [financeDate(item.accountingDate, locale), `${stringValue(item, "accountCode")} · ${locale === "fr" ? stringValue(item, "accountNameFr") : stringValue(item, "accountNameEn")}`, stringValue(item, "journalCode"), stringValue(item, "periodCode"), stringValue(item, "reference") || "—", stringValue(item, "description"), financeMoney(item.debit, currency, locale), financeMoney(item.credit, currency, locale)];
  return [`${stringValue(item, "code")} · ${locale === "fr" ? stringValue(item, "nameFr") : stringValue(item, "nameEn")}`, financeEnumLabel(stringValue(item, "accountType"), locale), financeMoney(item.debit, currency, locale), financeMoney(item.credit, currency, locale), financeMoney(item.balance, currency, locale), <StatusBadge key="status" tone={financeStatusTone(itemStatus(item))}>{financeStatusLabel(itemStatus(item), locale)}</StatusBadge>];
}

function AccountingFormFields({ tab, form, updateForm, lookups, locale, copy }: { tab: TabKey; form: FormState; updateForm: (key: string, value: string | boolean) => void; lookups: LookupState; locale: FinanceLocale; copy: ReturnType<typeof getAccountingWorkspaceCopy> }) {
  const option = <option value="">{copy.select}</option>;
  const field = (label: string, help: string, child: ReactNode) => <label className="min-w-0 text-sm font-bold text-dtsc-ink">{label}<div className="mt-2">{child}</div><span className="mt-1.5 block text-xs leading-5 text-dtsc-muted">{help}</span></label>;
  if (tab === "charts") return <ProfessionalFormSection title={copy.charts} description={copy.chartsDescription}>{field(copy.code, copy.chartCodeHelp, <Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value.toUpperCase())} required />)}{field(copy.nameFr, copy.chartNameHelp, <Input value={String(form.nameFr)} onChange={(event) => updateForm("nameFr", event.target.value)} required />)}{field(copy.nameEn, copy.chartNameHelp, <Input value={String(form.nameEn)} onChange={(event) => updateForm("nameEn", event.target.value)} required />)}</ProfessionalFormSection>;
  if (tab === "years") return <ProfessionalFormSection title={copy.years} description={copy.yearHelp}>{field(copy.code, copy.yearHelp, <Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value.toUpperCase())} required />)}{field(copy.startDate, copy.yearHelp, <Input type="date" value={String(form.startDate)} onChange={(event) => updateForm("startDate", event.target.value)} required />)}{field(copy.endDate, copy.yearHelp, <Input type="date" value={String(form.endDate)} onChange={(event) => updateForm("endDate", event.target.value)} required />)}</ProfessionalFormSection>;
  if (tab === "periods") return <ProfessionalFormSection title={copy.periods} description={copy.periodHelp}>{field(copy.fiscalYear, copy.periodHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.fiscalYearId)} onChange={(event) => updateForm("fiscalYearId", event.target.value)} required>{option}{lookups.years.map((item) => <option key={item.id} value={item.id}>{stringValue(item, "code")} · {financeStatusLabel(itemStatus(item), locale)}</option>)}</select>)}{field(copy.code, copy.periodHelp, <Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value.toUpperCase())} required />)}{field(copy.startDate, copy.periodHelp, <Input type="date" value={String(form.startDate)} onChange={(event) => updateForm("startDate", event.target.value)} required />)}{field(copy.endDate, copy.periodHelp, <Input type="date" value={String(form.endDate)} onChange={(event) => updateForm("endDate", event.target.value)} required />)}</ProfessionalFormSection>;
  if (tab === "journals") return <ProfessionalFormSection title={copy.journals} description={copy.journalHelp}>{field(copy.code, copy.journalHelp, <Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value.toUpperCase())} required />)}{field(copy.nameFr, copy.journalHelp, <Input value={String(form.nameFr)} onChange={(event) => updateForm("nameFr", event.target.value)} required />)}{field(copy.nameEn, copy.journalHelp, <Input value={String(form.nameEn)} onChange={(event) => updateForm("nameEn", event.target.value)} required />)}{field(copy.journalType, copy.journalHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.journalType)} onChange={(event) => updateForm("journalType", event.target.value)}>{["GENERAL", "SALES", "PURCHASES", "CASH", "BANK", "MOBILE_MONEY", "PAYROLL", "INVENTORY", "ASSETS", "TAX", "OPENING", "ADJUSTMENT"].map((value) => <option key={value} value={value}>{financeEnumLabel(value, locale)}</option>)}</select>)}{field(copy.sequencePrefix, copy.journalHelp, <Input value={String(form.sequencePrefix)} onChange={(event) => updateForm("sequencePrefix", event.target.value)} />)}<label className="flex min-h-11 items-center gap-3 text-sm font-bold"><input type="checkbox" checked={Boolean(form.requiresApproval)} onChange={(event) => updateForm("requiresApproval", event.target.checked)} />{copy.approvalRequired}</label></ProfessionalFormSection>;
  if (tab === "accounts") return <ProfessionalFormSection title={copy.accounts} description={copy.createAccountHelp}>{field(copy.charts, copy.createAccountHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.chartId)} onChange={(event) => updateForm("chartId", event.target.value)} required>{option}{lookups.charts.map((item) => <option key={item.id} value={item.id}>{stringValue(item, "code")} · {localName(item, locale)}</option>)}</select>)}{field(copy.code, copy.createAccountHelp, <Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value)} required />)}{field(copy.nameFr, copy.accountMeaning, <Input value={String(form.nameFr)} onChange={(event) => updateForm("nameFr", event.target.value)} required />)}{field(copy.nameEn, copy.accountMeaning, <Input value={String(form.nameEn)} onChange={(event) => updateForm("nameEn", event.target.value)} required />)}{field(copy.accountType, copy.accountMeaning, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.accountType)} onChange={(event) => updateForm("accountType", event.target.value)}>{["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"].map((value) => <option key={value} value={value}>{financeEnumLabel(value, locale)}</option>)}</select>)}{field(copy.parentAccount, copy.createAccountHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.parentId)} onChange={(event) => updateForm("parentId", event.target.value)}><option value="">—</option>{lookups.accounts.filter((item) => stringValue(item, "accountType") === String(form.accountType)).map((item) => <option key={item.id} value={item.id}>{stringValue(item, "code")} · {localName(item, locale)}</option>)}</select>)}{field(copy.currency, copy.formHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.currencyCode)} onChange={(event) => updateForm("currencyCode", event.target.value)}><option value="USD">USD</option><option value="CDF">CDF</option><option value="EUR">EUR</option></select>)}<label className="flex min-h-11 items-center gap-3 text-sm font-bold"><input type="checkbox" checked={Boolean(form.allowDirectPosting)} onChange={(event) => updateForm("allowDirectPosting", event.target.checked)} />{copy.allowDirectPosting}</label></ProfessionalFormSection>;
  if (tab === "entries") return <ProfessionalFormSection title={copy.entries} description={copy.entriesDescription}>{field(copy.journal, copy.journalHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.journalId)} onChange={(event) => updateForm("journalId", event.target.value)} required>{option}{lookups.journals.filter((item) => item.isActive !== false).map((item) => <option key={item.id} value={item.id}>{stringValue(item, "code")} · {localName(item, locale)}</option>)}</select>)}{field(copy.period, copy.periodHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.fiscalPeriodId)} onChange={(event) => updateForm("fiscalPeriodId", event.target.value)} required>{option}{lookups.periods.filter((item) => ["OPEN", "SOFT_CLOSED"].includes(itemStatus(item))).map((item) => <option key={item.id} value={item.id}>{stringValue(item, "code")} · {financeStatusLabel(itemStatus(item), locale)}</option>)}</select>)}{field(copy.date, copy.entriesDescription, <Input type="date" value={String(form.accountingDate)} onChange={(event) => updateForm("accountingDate", event.target.value)} required />)}{field(copy.reference, copy.entriesDescription, <Input value={String(form.reference)} onChange={(event) => updateForm("reference", event.target.value)} />)}{field(copy.description, copy.entriesDescription, <Input value={String(form.description)} onChange={(event) => updateForm("description", event.target.value)} required />)}{field(copy.debit, copy.formHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.debitAccountId)} onChange={(event) => updateForm("debitAccountId", event.target.value)} required>{option}{lookups.accounts.filter((item) => item.isActive !== false && item.allowDirectPosting !== false).map((item) => <option key={item.id} value={item.id}>{stringValue(item, "code")} · {localName(item, locale)}</option>)}</select>)}{field(copy.credit, copy.formHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.creditAccountId)} onChange={(event) => updateForm("creditAccountId", event.target.value)} required>{option}{lookups.accounts.filter((item) => item.isActive !== false && item.allowDirectPosting !== false).map((item) => <option key={item.id} value={item.id}>{stringValue(item, "code")} · {localName(item, locale)}</option>)}</select>)}{field(copy.amount, copy.entriesDescription, <Input inputMode="decimal" value={String(form.amount)} onChange={(event) => updateForm("amount", event.target.value)} required />)}{field(copy.currency, copy.formHelp, <select className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base" value={String(form.currencyCode)} onChange={(event) => updateForm("currencyCode", event.target.value)}><option value="USD">USD</option><option value="CDF">CDF</option><option value="EUR">EUR</option></select>)}</ProfessionalFormSection>;
  return null;
}

function AccountingDetail({ tab, item, organizationId, locale, copy }: { tab: TabKey; item: Item; organizationId: string; locale: FinanceLocale; copy: ReturnType<typeof getAccountingWorkspaceCopy> }) {
  const [chartAccounts, setChartAccounts] = useState<Item[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  useEffect(() => {
    if (tab !== "charts") return;
    setLoadingAccounts(true);
    requestJson(`/api/enterprise/${organizationId}/ledger-accounts?page=1&pageSize=500&chartId=${encodeURIComponent(item.id)}`, copy.loadFailed)
      .then((body) => setChartAccounts(Array.isArray(body.items) ? body.items as Item[] : []))
      .catch(() => setChartAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [copy.loadFailed, item.id, organizationId, tab]);
  const currency = stringValue(item, "currencyCode") || stringValue(item, "functionalCurrencyCode") || "USD";
  return <BusinessDetail>
    <BusinessDetailHeader eyebrow={copy.moduleEyebrow} title={itemTitle(item, tab, locale, copy)} summary={itemSubtitle(item, tab, locale, copy)} status={<StatusBadge tone={financeStatusTone(itemStatus(item))}>{financeStatusLabel(itemStatus(item), locale)}</StatusBadge>} />
    <BusinessDetailSection title={copy.details}><BusinessDetailGrid>{detailFields(item, tab, locale, copy, currency).map(([label, value]) => <BusinessDetailField key={label} label={label} value={value || "—"} />)}</BusinessDetailGrid></BusinessDetailSection>
    {tab === "charts" ? <BusinessDetailSection title={copy.chartAccounts} description={copy.chartsDescription}>{loadingAccounts ? <ProfessionalLoading rows={3} /> : chartAccounts.length ? <div className="divide-y divide-dtsc-border border-y border-dtsc-border">{chartAccounts.map((account) => <div key={account.id} className="py-3"><p className="font-black text-dtsc-ink">{stringValue(account, "code")} · {localName(account, locale)}</p><p className="mt-1 text-sm text-dtsc-muted">{accountMeaning(stringValue(account, "accountType"), locale)} · {financeEnumLabel(stringValue(account, "accountType"), locale)}</p></div>)}</div> : <p className="text-sm text-dtsc-muted">{copy.noAccountsInChart}</p>}</BusinessDetailSection> : null}
    {tab === "accounts" ? <BusinessDetailSection title={copy.accountMeaning} description={accountMeaning(stringValue(item, "accountType"), locale)}><p className="text-sm leading-6 text-dtsc-ink">{accountUsage(item, locale, copy)}</p></BusinessDetailSection> : null}
    {tab === "rules" ? <BusinessDetailSection title={copy.ruleExplanation} description={copy.rulesDescription}><p className="text-sm leading-6 text-dtsc-ink">{copy.ruleExplanation}</p></BusinessDetailSection> : null}
  </BusinessDetail>;
}

function detailFields(item: Item, tab: TabKey, locale: FinanceLocale, copy: ReturnType<typeof getAccountingWorkspaceCopy>, currency: string): Array<[string, ReactNode]> {
  if (tab === "charts") return [[copy.code, stringValue(item, "code")], [copy.template, stringValue(item, "templateCode") || "—"], [copy.status, financeStatusLabel(itemStatus(item), locale)], [copy.chartAccounts, nestedValue(item, "_count", "accounts") || "0"]];
  if (tab === "accounts") return [[copy.code, stringValue(item, "code")], [copy.type, financeEnumLabel(stringValue(item, "accountType"), locale)], [copy.subtype, stringValue(item, "accountSubtype") ? financeEnumLabel(stringValue(item, "accountSubtype"), locale) : "—"], [copy.parentAccount, nestedValue(item, "parent", "code") || "—"], [copy.currency, stringValue(item, "currencyCode") || "—"], [copy.directPosting, booleanValue(item, "allowDirectPosting") ? copy.yes : copy.no], [copy.controlAccount, booleanValue(item, "isControlAccount") ? copy.yes : copy.no], [copy.systemAccount, booleanValue(item, "isSystemAccount") ? copy.yes : copy.no]];
  if (tab === "years") return [[copy.code, stringValue(item, "code")], [copy.startDate, financeDate(item.startDate, locale)], [copy.endDate, financeDate(item.endDate, locale)], [copy.status, financeStatusLabel(itemStatus(item), locale)], [copy.periodsCount, Array.isArray(item.periods) ? item.periods.length : 0]];
  if (tab === "periods") return [[copy.code, stringValue(item, "code")], [copy.fiscalYear, nestedValue(item, "fiscalYear", "code")], [copy.startDate, financeDate(item.startDate, locale)], [copy.endDate, financeDate(item.endDate, locale)], [copy.status, financeStatusLabel(itemStatus(item), locale)]];
  if (tab === "journals") return [[copy.code, stringValue(item, "code")], [copy.journalType, financeEnumLabel(stringValue(item, "journalType"), locale)], [copy.sequencePrefix, stringValue(item, "sequencePrefix") || "—"], [copy.approvalRequired, booleanValue(item, "requiresApproval") ? copy.yes : copy.no], [copy.status, booleanValue(item, "isActive") ? copy.active : copy.inactive]];
  if (tab === "rules") return [[copy.mappingKey, stringValue(item, "mappingKey")], [copy.sourceModule, stringValue(item, "sourceModule") || "—"], [copy.mappedAccount, `${stringValue(item, "accountCode")} · ${locale === "fr" ? stringValue(item, "accountNameFr") : stringValue(item, "accountNameEn")}`], [copy.effectiveFrom, financeDate(item.effectiveFrom, locale)], [copy.effectiveTo, financeDate(item.effectiveTo, locale)], [copy.status, financeStatusLabel(itemStatus(item), locale)]];
  if (tab === "entries") return [[copy.number, stringValue(item, "number")], [copy.date, financeDate(item.accountingDate, locale)], [copy.journal, nestedValue(item, "journal", "code")], [copy.period, nestedValue(item, "fiscalPeriod", "code")], [copy.reference, stringValue(item, "reference") || "—"], [copy.debit, financeMoney(item.totalDebit, currency, locale)], [copy.credit, financeMoney(item.totalCredit, currency, locale)], [copy.status, financeStatusLabel(itemStatus(item), locale)]];
  if (tab === "ledger") return [[copy.date, financeDate(item.accountingDate, locale)], [copy.account, `${stringValue(item, "accountCode")} · ${locale === "fr" ? stringValue(item, "accountNameFr") : stringValue(item, "accountNameEn")}`], [copy.journal, stringValue(item, "journalCode")], [copy.period, stringValue(item, "periodCode")], [copy.debit, financeMoney(item.debit, currency, locale)], [copy.credit, financeMoney(item.credit, currency, locale)]];
  if (tab === "trial") return [[copy.account, `${stringValue(item, "code")} · ${locale === "fr" ? stringValue(item, "nameFr") : stringValue(item, "nameEn")}`], [copy.type, financeEnumLabel(stringValue(item, "accountType"), locale)], [copy.debit, financeMoney(item.debit, currency, locale)], [copy.credit, financeMoney(item.credit, currency, locale)], [copy.balance, financeMoney(item.balance, currency, locale)]];
  return Object.entries(item).filter(([key, value]) => !["id", "organizationId"].includes(key) && ["string", "number", "boolean"].includes(typeof value)).slice(0, 12).map(([key, value]) => [financeEnumLabel(key, locale), String(value)]);
}

function itemStatus(item: Item) { return item.status ? String(item.status) : item.isActive === false ? "INACTIVE" : "ACTIVE"; }
function itemTitle(item: Item, tab: TabKey, locale: FinanceLocale, copy: ReturnType<typeof getAccountingWorkspaceCopy>) {
  if (tab === "rules") return stringValue(item, "mappingKey") || copy.rules;
  if (tab === "ledger") return `${stringValue(item, "accountCode")} · ${locale === "fr" ? stringValue(item, "accountNameFr") : stringValue(item, "accountNameEn")}`;
  if (tab === "trial") return `${stringValue(item, "code")} · ${locale === "fr" ? stringValue(item, "nameFr") : stringValue(item, "nameEn")}`;
  return stringValue(item, "number") || stringValue(item, "code") || localName(item, locale) || stringValue(item, "reference") || copy.details;
}
function itemSubtitle(item: Item, tab: TabKey, locale: FinanceLocale, copy: ReturnType<typeof getAccountingWorkspaceCopy>) {
  if (tab === "accounts") return `${financeEnumLabel(stringValue(item, "accountType"), locale)} · ${accountMeaning(stringValue(item, "accountType"), locale)}`;
  if (tab === "years") return `${financeDate(item.startDate, locale)} → ${financeDate(item.endDate, locale)} · ${copy.periodsCount}: ${Array.isArray(item.periods) ? item.periods.length : 0}`;
  if (tab === "periods") return `${nestedValue(item, "fiscalYear", "code")} · ${financeDate(item.startDate, locale)} → ${financeDate(item.endDate, locale)}`;
  if (tab === "journals") return `${financeEnumLabel(stringValue(item, "journalType"), locale)} · ${copy.approvalRequired}: ${booleanValue(item, "requiresApproval") ? copy.yes : copy.no}`;
  if (tab === "rules") return `${stringValue(item, "sourceModule") || "—"} → ${stringValue(item, "accountCode")} · ${locale === "fr" ? stringValue(item, "accountNameFr") : stringValue(item, "accountNameEn")}`;
  return stringValue(item, "description") || copy.openDetails;
}
function accountMeaning(type: string, locale: FinanceLocale) {
  const meanings: Record<string, [string, string]> = {
    ASSET: ["Ressources contrôlées par l’entreprise et avantages économiques attendus.", "Resources controlled by the company with expected economic benefits."],
    LIABILITY: ["Obligations de l’entreprise envers des tiers.", "Obligations owed by the company to third parties."],
    EQUITY: ["Intérêt résiduel des propriétaires après déduction des dettes.", "Owners’ residual interest after liabilities."],
    REVENUE: ["Produits générés par l’activité et les opérations de l’entreprise.", "Income generated by company activity and operations."],
    EXPENSE: ["Charges consommées pour faire fonctionner l’activité.", "Costs consumed to operate the business."],
    OTHER_INCOME: ["Produits hors activité principale classés séparément.", "Income outside the main activity classified separately."],
    OTHER_EXPENSE: ["Charges hors activité principale classées séparément.", "Expenses outside the main activity classified separately."],
  };
  return (meanings[type] || ["Compte du référentiel comptable de l’entreprise.", "Account in the company accounting reference."])[locale === "en" ? 1 : 0];
}
function accountUsage(item: Item, locale: FinanceLocale, copy: ReturnType<typeof getAccountingWorkspaceCopy>) {
  const posting = booleanValue(item, "allowDirectPosting") ? (locale === "fr" ? "Ce compte accepte des écritures directes lorsque le workflow l’autorise." : "This account accepts direct entries when the workflow allows it.") : (locale === "fr" ? "Ce compte n’accepte pas de saisie directe ; il est alimenté par des règles ou sous-comptes autorisés." : "This account does not accept direct posting; it is fed by rules or authorized child accounts.");
  return `${accountMeaning(stringValue(item, "accountType"), locale)} ${posting} ${copy.accountHierarchy}: ${stringValue(item, "level") || "1"}.`;
}
