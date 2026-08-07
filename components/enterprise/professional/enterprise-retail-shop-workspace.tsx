"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CheckCircle2, ClipboardCheck, Printer, RadioTower, RefreshCw, RotateCcw, Search, Settings2, Share2, ShoppingCart, Smartphone, XCircle } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalLoading, ProfessionalTabs } from "@/components/enterprise/professional/professional-erp-ui";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { getRetailUserGuide } from "@/lib/user-guides/retail-telco-mobile-money-guides";

type RetailModuleCode = "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS" | "RETAIL_DAILY_CLOSE";
type Account = { id: string; code: string; name: string; accountType: string; currencyCode: string; operationalBalance: string | number; siteId: string | null };
type Provider = { id: string; providerCode: string; label: string; providerType: "MOBILE_MONEY" | "TELCO" | string; mobileMoneyFloatAccountId: string | null; telcoFloatAccountId: string | null; isActive: boolean };
type CatalogItem = { id: string; code: string; sku: string | null; name: string; itemType: string; indicativeSalePrice: string | number | null; indicativeCost: string | number | null; currency: string | null; trackInventory: boolean };
type InventoryItem = { id: string; catalogItemId: string; balances: Array<{ warehouseId: string; storageLocationId: string | null; stockLotId: string | null; quantityOnHand: string | number; quantityReserved: string | number }> };
type Warehouse = { id: string; code: string; name: string; site: { id: string; name: string }; storageLocations: Array<{ id: string; code: string; name: string }> };
type Sale = { id: string; number: string; status: string; revision: number; currencyCode: string; grandTotal: string | number; soldAt: string; lines: Array<{ id: string; description: string; quantity: string | number; unitPrice: string | number; discountAmount: string | number; taxAmount: string | number; lineTotal: string | number }>; tenders: Array<{ id: string; methodType: string; amount: string | number }> };
type MobileMoney = { id: string; number: string; providerCode: string; transactionType: string; customerPhoneMasked?: string; currencyCode: string; principalAmount: string | number; customerFeeAmount: string | number; providerCommissionAmount: string | number; externalReference: string | null; status: string; occurredAt: string; revision: number };
type Topup = { id: string; number: string; providerCode: string; destinationPhoneMasked?: string; offerLabel: string; currencyCode: string; saleAmount: string | number; operatorCost: string | number; marginAmount: string | number; externalReference: string | null; status: string; occurredAt: string; revision: number };
type DailyClose = { id: string; number: string; businessDate: string; status: string; revision: number; lines: Array<{ id: string; accountType: string; currencyCode: string; systemClosingBalance: string | number; declaredBalance: string | number; differenceAmount: string | number; varianceReason: string | null }> };
type CashSession = { id: string; number: string; status: string; openingAmount: string | number; openedAt: string; financialAccountId: string; financialAccount: { id: string; code: string; name: string; currencyCode: string; operationalBalance: string | number }; _count: { movements: number; counts: number; discrepancies: number } };
type Readiness = { items: Array<{ code: string; label: string; complete: boolean; deepLink: string }>; completed: number; total: number; readyForFirstSale: boolean; readyForMobileMoney: boolean; readyForTelco: boolean };
type Dashboard = {
  configuration: { profileCode: string; baseCurrencyCode: string; status: string } | null;
  access: { canWrite: boolean; canManage: boolean };
  accounts: Account[];
  providers?: Provider[];
  warehouses?: Warehouse[];
  catalogItems?: CatalogItem[];
  inventoryItems?: InventoryItem[];
  cashSession: CashSession | null;
  readiness: Readiness;
  metricsByCurrency: {
    sales?: Array<{ currencyCode: string; count: number; amount: string }>;
    mobileMoney?: Array<{ currencyCode: string; count: number; deposits: string; withdrawals: string; commission: string }>;
    telco?: Array<{ currencyCode: string; count: number; revenue: string; margin: string }>;
  };
  recent: { sales?: Sale[]; mobileMoney?: MobileMoney[]; topups?: Topup[]; closes?: DailyClose[] };
  range: { from: string; to: string };
};
type CartLine = { catalogItemId: string; name: string; quantity: number; unitPrice: number; discountAmount: number; taxAmount: number; currencyCode: string; inventoryItemId: string | null };
type Tab = "OPERATE" | "HISTORY" | "CONFIG" | "REPORTS";

function moneyValue(value: string | number | null | undefined, currency?: string) {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "0"}${currency ? ` ${currency}` : ""}`;
}

function normalizePhonePreview(value: string) {
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (!phone.startsWith("+") && phone.startsWith("0")) phone = `+243${phone.slice(1)}`;
  return phone;
}

function statusTone(status: string) {
  if (["COMPLETED", "CONFIRMED", "SUCCESS", "APPROVED", "CLOSED", "OPEN"].includes(status)) return "success" as const;
  if (["SUBMITTED", "PENDING_VALIDATION", "CLOSING"].includes(status)) return "warning" as const;
  if (["REVERSED", "FAILED", "REJECTED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function parseDenominations(value: string) {
  return value.split(",").map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const [denomination, quantity] = chunk.split(/[x×*]/).map((part) => part.trim());
    return { denomination: Number(denomination || 0), quantity: Number(quantity || 0) };
  }).filter((item) => item.denomination > 0 && Number.isInteger(item.quantity) && item.quantity >= 0);
}

function Select({ name, value, defaultValue, required, disabled, onChange, children }: { name: string; value?: string; defaultValue?: string; required?: boolean; disabled?: boolean; onChange?: (value: string) => void; children: React.ReactNode }) {
  return <select name={name} value={value} defaultValue={value === undefined ? defaultValue : undefined} required={required} disabled={disabled} onChange={(event) => onChange?.(event.target.value)} className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">{children}</select>;
}

export function EnterpriseRetailShopWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useAppLocale() === "en" ? "en" : "fr";
  const moduleCode = definition.code as RetailModuleCode;
  const [tab, setTab] = useState<Tab>("OPERATE");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [period, setPeriod] = useState<"TODAY" | "7D" | "30D">("TODAY");
  const mutationKeys = useRef<Record<string, string>>({});
  const guide = useMemo(() => getRetailUserGuide(moduleCode, locale), [locale, moduleCode]);

  const rangeQuery = useMemo(() => {
    const to = new Date();
    const from = new Date();
    if (period === "TODAY") from.setHours(0, 0, 0, 0);
    else from.setDate(from.getDate() - (period === "7D" ? 7 : 30));
    return `&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=${encodeURIComponent(moduleCode)}${rangeQuery}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as Dashboard & { message?: string; error?: string } | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || (locale === "en" ? "Unable to load Shop data." : "Chargement du Shop impossible."));
      setDashboard(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
    } finally { setLoading(false); }
  }, [locale, moduleCode, organizationId, rangeQuery, refreshKey]);
  useEffect(() => { void load(); }, [load]);

  function stableKey(action: string) {
    if (!mutationKeys.current[action]) mutationKeys.current[action] = crypto.randomUUID();
    return mutationKeys.current[action];
  }

  async function mutate(action: string, endpoint: string, payload: Record<string, unknown>, success: string, options?: { idempotent?: boolean }) {
    if (busyAction) return null;
    setBusyAction(action); setMessage("");
    try {
      const bodyPayload = options?.idempotent === false ? payload : { ...payload, idempotencyKey: stableKey(action) };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyPayload) });
      const body = await response.json().catch(() => null) as ({ message?: string; error?: string } & Record<string, unknown>) | null;
      if (!response.ok) throw new Error(body?.message || body?.error || (locale === "en" ? "Operation failed." : "L’opération a échoué."));
      delete mutationKeys.current[action];
      setMessage(success); setRefreshKey((value) => value + 1);
      return body || {};
    } catch (mutationError) {
      setMessage(mutationError instanceof Error ? mutationError.message : (locale === "en" ? "Operation failed." : "L’opération a échoué."));
      return null;
    } finally { setBusyAction(null); }
  }

  const tabs = useMemo(() => [
    { id: "OPERATE" as const, label: locale === "en" ? "Operate" : "Opérer" },
    { id: "HISTORY" as const, label: locale === "en" ? "History" : "Historique" },
    ...(["MOBILE_MONEY_AGENCY", "TELCO_TOPUPS"].includes(moduleCode) ? [{ id: "CONFIG" as const, label: locale === "en" ? "Configuration" : "Configuration" }] : []),
    { id: "REPORTS" as const, label: locale === "en" ? "Reports" : "Rapports" },
  ], [locale, moduleCode]);

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`${locale === "en" ? "Shop operations" : "Opérations Shop"} · ${organizationName}`} title={locale === "en" ? definition.labelEn : definition.labelFr} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => setGuideOpen(true)}>{locale === "en" ? "User guide" : "Guide utilisateur"}</Button><Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-4 w-4" />{locale === "en" ? "Refresh" : "Actualiser"}</Button></div>} />
    <ContextualUserGuide guide={guide} open={guideOpen} onOpenChange={setGuideOpen} hideTrigger />
    {dashboard ? <ShopReadiness readiness={dashboard.readiness} locale={locale} /> : null}
    {dashboard && ["RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS"].includes(moduleCode) ? <CashSessionBar session={dashboard.cashSession} locale={locale} /> : null}
    {dashboard ? <RetailMetrics moduleCode={moduleCode} dashboard={dashboard} locale={locale} /> : null}
    <ModuleToolbar controls={<div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><ProfessionalTabs value={tab} onChange={setTab} items={tabs} label={locale === "en" ? "Shop module navigation" : "Navigation du module Shop"} /><div className="flex min-w-0 gap-2 overflow-x-auto"><Button size="sm" variant={period === "TODAY" ? "default" : "outline"} onClick={() => setPeriod("TODAY")}>{locale === "en" ? "Today" : "Aujourd’hui"}</Button><Button size="sm" variant={period === "7D" ? "default" : "outline"} onClick={() => setPeriod("7D")}>7 j</Button><Button size="sm" variant={period === "30D" ? "default" : "outline"} onClick={() => setPeriod("30D")}>30 j</Button></div></div>} summary={locale === "en" ? "Financial accounts are resolved from the open till and provider configuration." : "Les comptes financiers sont résolus depuis la caisse ouverte et la configuration des opérateurs."} />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold text-dtsc-ink">{message}</div> : null}
      {error ? <ProfessionalError message={error} /> : loading ? <ProfessionalLoading rows={4} /> : !dashboard ? <EmptyState title={locale === "en" ? "Shop unavailable" : "Shop indisponible"} description={locale === "en" ? "The Shop profile could not be loaded." : "Le profil Shop n’a pas pu être chargé."} /> : <>
        {tab === "OPERATE" ? <OperatePanel organizationId={organizationId} moduleCode={moduleCode} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} /> : null}
        {tab === "HISTORY" ? <HistoryPanel organizationId={organizationId} moduleCode={moduleCode} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} /> : null}
        {tab === "CONFIG" ? <ProviderConfiguration organizationId={organizationId} moduleCode={moduleCode} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} /> : null}
        {tab === "REPORTS" ? <ReportsPanel dashboard={dashboard} moduleCode={moduleCode} locale={locale} /> : null}
      </>}
    </ModuleContent>
  </ModuleWorkspace>;
}

function ShopReadiness({ readiness, locale }: { readiness: Readiness; locale: "fr" | "en" }) {
  return <ModuleSection title={locale === "en" ? "Shop activation" : "Mise en service du Shop"} description={locale === "en" ? "Persistent checks show what is configured before the first real operation." : "Des contrôles persistants indiquent ce qui est réellement configuré avant la première opération."}>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div><p className="text-2xl font-black text-dtsc-ink">{readiness.completed}/{readiness.total}</p><p className="text-sm font-semibold text-dtsc-muted">{locale === "en" ? "configuration checks completed" : "contrôles de configuration terminés"}</p></div><StatusBadge tone={readiness.completed === readiness.total ? "success" : "warning"}>{readiness.completed === readiness.total ? (locale === "en" ? "Ready" : "Prêt") : (locale === "en" ? "Setup required" : "Configuration requise")}</StatusBadge></div>
    <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">{readiness.items.map((item) => <Link key={item.code} href={item.deepLink} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-3 text-sm font-bold text-dtsc-ink"><span className="min-w-0 break-words">{item.label}</span><StatusBadge tone={item.complete ? "success" : "warning"}>{item.complete ? "OK" : "À faire"}</StatusBadge></Link>)}</div>
  </ModuleSection>;
}

function CashSessionBar({ session, locale }: { session: CashSession | null; locale: "fr" | "en" }) {
  if (!session) return <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-800 dark:text-amber-200">🔴 {locale === "en" ? "No active till. Open a cash session before accepting cash or running Mobile Money." : "Aucune caisse active. Ouvrez une session avant d’accepter du cash ou d’opérer Mobile Money."}</div>;
  const pending = session.status !== "OPEN";
  return <div className={`rounded-2xl border px-4 py-3 ${pending ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="font-black text-dtsc-ink">{pending ? "🟠" : "🟢"} {session.financialAccount.name} · {session.financialAccount.currencyCode}</p><p className="mt-1 text-xs font-semibold text-dtsc-muted">{locale === "en" ? "Opening float" : "Fonds d’ouverture"}: {moneyValue(session.openingAmount, session.financialAccount.currencyCode)} · {locale === "en" ? "current operational balance" : "solde opérationnel actuel"}: {moneyValue(session.financialAccount.operationalBalance, session.financialAccount.currencyCode)}</p></div><StatusBadge tone={pending ? "warning" : "success"}>{session.status}</StatusBadge></div></div>;
}

function RetailMetrics({ moduleCode, dashboard, locale }: { moduleCode: RetailModuleCode; dashboard: Dashboard; locale: "fr" | "en" }) {
  const nodes = moduleCode === "RETAIL_POS" ? (dashboard.metricsByCurrency.sales || []).flatMap((row) => [<ModuleMetric key={`${row.currencyCode}-count`} label={`${locale === "en" ? "Receipts" : "Tickets"} · ${row.currencyCode}`} value={row.count} />, <ModuleMetric key={`${row.currencyCode}-sales`} label={`${locale === "en" ? "Sales" : "Ventes"} · ${row.currencyCode}`} value={moneyValue(row.amount, row.currencyCode)} />]) : moduleCode === "MOBILE_MONEY_AGENCY" ? (dashboard.metricsByCurrency.mobileMoney || []).flatMap((row) => [<ModuleMetric key={`${row.currencyCode}-dep`} label={`${locale === "en" ? "Deposits" : "Dépôts"} · ${row.currencyCode}`} value={moneyValue(row.deposits, row.currencyCode)} />, <ModuleMetric key={`${row.currencyCode}-wd`} label={`${locale === "en" ? "Withdrawals" : "Retraits"} · ${row.currencyCode}`} value={moneyValue(row.withdrawals, row.currencyCode)} />, <ModuleMetric key={`${row.currencyCode}-com`} label={`${locale === "en" ? "Commission" : "Commission"} · ${row.currencyCode}`} value={moneyValue(row.commission, row.currencyCode)} />]) : moduleCode === "TELCO_TOPUPS" ? (dashboard.metricsByCurrency.telco || []).flatMap((row) => [<ModuleMetric key={`${row.currencyCode}-rev`} label={`${locale === "en" ? "Top-up sales" : "Ventes Télécom"} · ${row.currencyCode}`} value={moneyValue(row.revenue, row.currencyCode)} />, <ModuleMetric key={`${row.currencyCode}-margin`} label={`${locale === "en" ? "Margin" : "Marge"} · ${row.currencyCode}`} value={moneyValue(row.margin, row.currencyCode)} />]) : [<ModuleMetric key="pending" label={locale === "en" ? "Submitted closes" : "Clôtures soumises"} value={(dashboard.recent.closes || []).filter((item) => item.status === "SUBMITTED").length} />];
  return <ModuleMetrics label={locale === "en" ? "Shop indicators by currency" : "Indicateurs Shop par devise"}>{nodes.length ? nodes : <ModuleMetric label={locale === "en" ? "Activity" : "Activité"} value="—" />}</ModuleMetrics>;
}

type Mutate = (action: string, endpoint: string, payload: Record<string, unknown>, success: string, options?: { idempotent?: boolean }) => Promise<Record<string, unknown> | null>;

function OperatePanel({ organizationId, moduleCode, dashboard, locale, busyAction, mutate }: { organizationId: string; moduleCode: RetailModuleCode; dashboard: Dashboard; locale: "fr" | "en"; busyAction: string | null; mutate: Mutate }) {
  if (moduleCode === "RETAIL_POS") return <PosPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />;
  if (moduleCode === "MOBILE_MONEY_AGENCY") return <MobileMoneyPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />;
  if (moduleCode === "TELCO_TOPUPS") return <TelcoPanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />;
  return <DailyClosePanel organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />;
}

function OpenCashForm({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: Dashboard; locale: "fr" | "en"; busyAction: string | null; mutate: Mutate }) {
  if (dashboard.cashSession) return null;
  const cashAccounts = dashboard.accounts.filter((account) => account.accountType === "CASH");
  return <ModuleSection title={locale === "en" ? "Open my till" : "Ouvrir ma caisse"} description={locale === "en" ? "Choose the physical till and count the opening float." : "Choisissez la caisse physique et comptez le fonds d’ouverture."}><form onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await mutate("open-cash", `/api/enterprise/${organizationId}/retail/cash-sessions`, { financialAccountId: String(form.get("financialAccountId") || ""), openingAmount: String(form.get("openingAmount") || "0") }, locale === "en" ? "Till opened." : "Caisse ouverte.", { idempotent: false }); }} className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)_auto] sm:items-end"><Field label={locale === "en" ? "Till" : "Caisse"}><Select name="financialAccountId" required disabled={Boolean(busyAction)}><option value="">—</option>{cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select></Field><Field label={locale === "en" ? "Opening float" : "Fonds d’ouverture"}><Input name="openingAmount" type="number" min="0" step="0.01" required disabled={Boolean(busyAction)} /></Field><Button disabled={Boolean(busyAction) || !cashAccounts.length}><Banknote className="h-4 w-4" />{busyAction === "open-cash" ? "…" : (locale === "en" ? "Open" : "Ouvrir")}</Button></form></ModuleSection>;
}

function PosPanel({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: Dashboard; locale: "fr" | "en"; busyAction: string | null; mutate: Mutate }) {
  const catalog = dashboard.catalogItems || [];
  const inventory = dashboard.inventoryItems || [];
  const warehouses = dashboard.warehouses || [];
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [method1, setMethod1] = useState("CASH");
  const [account1, setAccount1] = useState("");
  const [amount1, setAmount1] = useState(0);
  const [split, setSplit] = useState(false);
  const [method2, setMethod2] = useState("MOBILE_MONEY");
  const [account2, setAccount2] = useState("");
  const [amount2, setAmount2] = useState(0);
  const [lastReceipt, setLastReceipt] = useState<Sale | null>(null);
  const currency = cart[0]?.currencyCode || dashboard.configuration?.baseCurrencyCode || "CDF";
  const total = useMemo(() => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice - line.discountAmount + line.taxAmount, 0), [cart]);
  useEffect(() => { if (!split) { setAmount1(Number(total.toFixed(2))); setAmount2(0); } }, [split, total]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((item) => !q || `${item.code} ${item.sku || ""} ${item.name}`.toLowerCase().includes(q)).slice(0, 30);
  }, [catalog, search]);

  function available(itemId: string) {
    const item = inventory.find((entry) => entry.catalogItemId === itemId);
    if (!item) return null;
    return item.balances.filter((balance) => !warehouseId || balance.warehouseId === warehouseId).reduce((sum, balance) => sum + Number(balance.quantityOnHand) - Number(balance.quantityReserved), 0);
  }

  function addItem(item: CatalogItem) {
    const itemCurrency = item.currency || dashboard.configuration?.baseCurrencyCode || "CDF";
    if (cart.length && itemCurrency !== currency) return;
    const stock = available(item.id);
    if (item.trackInventory && stock !== null && stock <= 0) return;
    setCart((current) => {
      const existing = current.find((line) => line.catalogItemId === item.id);
      if (existing) return current.map((line) => line.catalogItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { catalogItemId: item.id, name: item.name, quantity: 1, unitPrice: Number(item.indicativeSalePrice || 0), discountAmount: 0, taxAmount: 0, currencyCode: itemCurrency, inventoryItemId: inventory.find((entry) => entry.catalogItemId === item.id)?.id || null }];
    });
  }

  function updateLine(id: string, patch: Partial<CartLine>) { setCart((current) => current.map((line) => line.catalogItemId === id ? { ...line, ...patch } : line)); }
  function removeLine(id: string) { setCart((current) => current.filter((line) => line.catalogItemId !== id)); }

  function accountsFor(method: string) {
    if (method === "CASH") return dashboard.cashSession?.status === "OPEN" ? [dashboard.cashSession.financialAccount] : [];
    if (method === "MOBILE_MONEY") return dashboard.accounts.filter((account) => account.accountType === "MOBILE_MONEY" && account.currencyCode === currency);
    return dashboard.accounts.filter((account) => ["BANK", "CLEARING"].includes(account.accountType) && account.currencyCode === currency);
  }
  const resolvedAccount1 = method1 === "CASH" ? dashboard.cashSession?.financialAccount.id || "" : account1;
  const resolvedAccount2 = method2 === "CASH" ? dashboard.cashSession?.financialAccount.id || "" : account2;

  async function submitSale() {
    if (!cart.length || !warehouseId || total <= 0) return;
    if (method1 === "CASH" && dashboard.cashSession?.status !== "OPEN") return;
    const tenders = [{ methodType: method1, financialAccountId: resolvedAccount1, amount: amount1, reference: null as string | null }];
    if (split && amount2 > 0) tenders.push({ methodType: method2, financialAccountId: resolvedAccount2, amount: amount2, reference: null });
    const body = await mutate("pos-sale", `/api/enterprise/${organizationId}/retail/sales`, { warehouseId, siteId: warehouses.find((warehouse) => warehouse.id === warehouseId)?.site.id || null, storageLocationId: null, currencyCode: currency, lines: cart.map((line) => ({ catalogItemId: line.catalogItemId, inventoryItemId: line.inventoryItemId, quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: line.discountAmount, taxAmount: line.taxAmount })), tenders, overrideReason: overrideReason || null }, locale === "en" ? "Receipt completed." : "Ticket encaissé.");
    const sale = body?.sale as Sale | undefined;
    if (sale) { setLastReceipt(sale); setCart([]); setOverrideReason(""); setSplit(false); }
  }

  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
    <OpenCashForm organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} />
    <ModuleSection title={locale === "en" ? "Counter sale" : "Vente comptoir"} description={locale === "en" ? "Search products, build one multi-item basket, then collect payment." : "Recherchez les articles, construisez un panier multi-articles, puis encaissez en une seule fois."}>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]"><div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "en" ? "Name, SKU or code" : "Nom, SKU ou code"} className="pl-9" /></div><Select name="warehouse" value={warehouseId} onChange={setWarehouseId}><option value="">{locale === "en" ? "Warehouse" : "Dépôt"}</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.site.name} · {warehouse.name}</option>)}</Select></div>
          <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">{filtered.map((item) => { const stock = available(item.id); return <button key={item.id} type="button" disabled={Boolean(busyAction) || !warehouseId || (item.trackInventory && stock !== null && stock <= 0)} onClick={() => addItem(item)} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left transition hover:border-cyan-400 disabled:opacity-50"><p className="break-words font-black text-dtsc-ink">{item.name}</p><p className="mt-1 text-xs font-semibold text-dtsc-muted">{item.sku || item.code} · {moneyValue(item.indicativeSalePrice, item.currency || currency)}</p><p className="mt-1 text-xs font-bold text-dtsc-muted">{item.trackInventory ? `${locale === "en" ? "Available" : "Disponible"}: ${stock ?? "—"}` : (locale === "en" ? "Service / no stock" : "Service / sans stock")}</p></button>; })}</div>
        </div>
        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="font-black text-dtsc-ink">{locale === "en" ? "Basket" : "Panier"}</h3><span className="text-sm font-black text-dtsc-blue">{moneyValue(total, currency)}</span></div>
          <div className="mt-3 grid min-w-0 gap-3">{cart.map((line) => <div key={line.catalogItemId} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-black text-dtsc-ink">{line.name}</p><p className="text-xs font-bold text-dtsc-muted">{moneyValue(line.unitPrice, line.currencyCode)}</p></div><Button type="button" size="sm" variant="outline" onClick={() => removeLine(line.catalogItemId)}><XCircle className="h-4 w-4" /></Button></div><div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-3"><Field label={locale === "en" ? "Qty" : "Qté"}><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.catalogItemId, { quantity: Number(event.target.value) })} /></Field><Field label={locale === "en" ? "Unit price" : "Prix unitaire"}><Input type="number" min="0" step="0.01" value={line.unitPrice} disabled={!dashboard.access.canManage} onChange={(event) => updateLine(line.catalogItemId, { unitPrice: Number(event.target.value) })} /></Field><Field label={locale === "en" ? "Discount" : "Remise"}><Input type="number" min="0" step="0.01" value={line.discountAmount} disabled={!dashboard.access.canManage} onChange={(event) => updateLine(line.catalogItemId, { discountAmount: Number(event.target.value) })} /></Field></div></div>)}{!cart.length ? <EmptyState compact title={locale === "en" ? "Empty basket" : "Panier vide"} description={locale === "en" ? "Add one or more catalog items." : "Ajoutez un ou plusieurs articles du catalogue."} /> : null}</div>
          {dashboard.access.canManage && cart.length ? <div className="mt-3"><Field label={locale === "en" ? "Override reason (required if price/discount changes)" : "Motif de dérogation (obligatoire si prix/remise modifié)"}><Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></Field></div> : null}
        </div>
      </div>
      {cart.length ? <div className="mt-5 grid min-w-0 gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">{locale === "en" ? "Payment" : "Encaissement"}</h3><div className="grid min-w-0 gap-3 md:grid-cols-3"><Field label={locale === "en" ? "Method" : "Mode"}><Select name="method1" value={method1} onChange={(value) => { setMethod1(value); setAccount1(""); }}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK_TRANSFER">{locale === "en" ? "Bank transfer" : "Virement"}</option><option value="CARD">{locale === "en" ? "Card" : "Carte"}</option></Select></Field><Field label={locale === "en" ? "Account" : "Compte"}>{method1 === "CASH" ? <Input value={dashboard.cashSession?.status === "OPEN" ? dashboard.cashSession.financialAccount.name : (locale === "en" ? "Open a till first" : "Ouvrez d’abord une caisse")} readOnly /> : <Select name="account1" value={account1} onChange={setAccount1}><option value="">—</option>{accountsFor(method1).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select>}</Field><Field label={locale === "en" ? "Amount" : "Montant"}><Input type="number" min="0.01" step="0.01" value={amount1} onChange={(event) => setAmount1(Number(event.target.value))} /></Field></div><label className="flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)} />{locale === "en" ? "Split payment" : "Paiement fractionné"}</label>{split ? <div className="grid min-w-0 gap-3 md:grid-cols-3"><Field label={locale === "en" ? "Second method" : "Deuxième mode"}><Select name="method2" value={method2} onChange={(value) => { setMethod2(value); setAccount2(""); }}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK_TRANSFER">{locale === "en" ? "Bank transfer" : "Virement"}</option><option value="CARD">{locale === "en" ? "Card" : "Carte"}</option></Select></Field><Field label={locale === "en" ? "Second account" : "Deuxième compte"}>{method2 === "CASH" ? <Input value={dashboard.cashSession?.status === "OPEN" ? dashboard.cashSession.financialAccount.name : "—"} readOnly /> : <Select name="account2" value={account2} onChange={setAccount2}><option value="">—</option>{accountsFor(method2).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select>}</Field><Field label={locale === "en" ? "Second amount" : "Deuxième montant"}><Input type="number" min="0" step="0.01" value={amount2} onChange={(event) => setAmount2(Number(event.target.value))} /></Field></div> : null}<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-lg font-black text-dtsc-ink">{locale === "en" ? "Total" : "Total"}: {moneyValue(total, currency)}</p><Button type="button" disabled={Boolean(busyAction) || !dashboard.access.canWrite || !resolvedAccount1 || Math.abs(amount1 + amount2 - total) > 0.005} onClick={() => void submitSale()}><ShoppingCart className="h-4 w-4" />{busyAction === "pos-sale" ? (locale === "en" ? "Processing…" : "Traitement…") : (locale === "en" ? "Collect payment" : "Encaisser")}</Button></div></div> : null}
    </ModuleSection>
    {lastReceipt ? <ModuleSection title={locale === "en" ? "Receipt completed" : "Ticket terminé"} description={lastReceipt.number}><div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-2xl font-black text-dtsc-ink">{moneyValue(lastReceipt.grandTotal, lastReceipt.currencyCode)}</p><p className="text-sm font-bold text-dtsc-muted">{lastReceipt.lines.map((line) => `${line.description} × ${Number(line.quantity)}`).join(" · ")}</p></div><div data-responsive-actions><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />{locale === "en" ? "Print" : "Imprimer"}</Button>{typeof navigator !== "undefined" && "share" in navigator ? <Button variant="outline" onClick={() => void navigator.share({ title: lastReceipt.number, text: `${lastReceipt.number} · ${moneyValue(lastReceipt.grandTotal, lastReceipt.currencyCode)}` })}><Share2 className="h-4 w-4" />{locale === "en" ? "Share" : "Partager"}</Button> : null}</div></div></div></ModuleSection> : null}
  </div>;
}

function MobileMoneyPanel({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: Dashboard; locale: "fr" | "en"; busyAction: string | null; mutate: Mutate }) {
  const providers = (dashboard.providers || []).filter((provider) => provider.providerType === "MOBILE_MONEY");
  const mappedProviders = providers.filter((provider) => provider.mobileMoneyFloatAccountId);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const activeCash = dashboard.cashSession?.status === "OPEN" ? dashboard.cashSession : null;
  async function confirm() { if (!pending) return; const body = await mutate("mobile-money", `/api/enterprise/${organizationId}/retail/mobile-money`, pending, locale === "en" ? "Mobile Money transaction confirmed." : "Opération Mobile Money confirmée."); if (body) setPending(null); }
  return <div className="grid min-w-0 gap-5"><OpenCashForm organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} /><ModuleSection title={locale === "en" ? "Mobile Money operation" : "Opération Mobile Money"} description={locale === "en" ? "The open till and provider float are selected automatically." : "La caisse ouverte et le float de l’opérateur sont sélectionnés automatiquement."}><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const providerCode = String(form.get("providerCode") || ""); const provider = mappedProviders.find((item) => item.providerCode === providerCode); if (!provider || !activeCash) return; setPending({ providerCode, transactionType: String(form.get("transactionType") || "DEPOSIT"), customerPhone: normalizePhonePreview(String(form.get("customerPhone") || "")), currencyCode: activeCash.financialAccount.currencyCode, principalAmount: Number(form.get("principalAmount") || 0), customerFeeAmount: Number(form.get("customerFeeAmount") || 0), providerCommissionAmount: Number(form.get("providerCommissionAmount") || 0), feeCollectionMode: String(form.get("feeCollectionMode") || "NONE"), cashAccountId: activeCash.financialAccount.id, floatAccountId: null, externalReference: String(form.get("externalReference") || "").trim() }); }} className="grid min-w-0 gap-4"><div className="grid min-w-0 gap-4 md:grid-cols-2"><Field label={locale === "en" ? "Wallet" : "Wallet"}><Select name="providerCode" required disabled={Boolean(busyAction)}><option value="">—</option>{mappedProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}</Select></Field><Field label={locale === "en" ? "Operation" : "Opération"}><Select name="transactionType" defaultValue="DEPOSIT"><option value="DEPOSIT">{locale === "en" ? "Deposit" : "Dépôt"}</option><option value="WITHDRAWAL">{locale === "en" ? "Withdrawal" : "Retrait"}</option></Select></Field><Field label={locale === "en" ? "Customer phone" : "Téléphone client"}><Input name="customerPhone" required inputMode="tel" placeholder="+243…" /></Field><Field label={locale === "en" ? "Principal" : "Montant principal"}><Input name="principalAmount" type="number" min="0.01" step="0.01" required /></Field><Field label={locale === "en" ? "Customer fee" : "Frais client"}><Input name="customerFeeAmount" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label={locale === "en" ? "Provider commission" : "Commission opérateur"}><Input name="providerCommissionAmount" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label={locale === "en" ? "Fee collection" : "Encaissement frais"}><Select name="feeCollectionMode" defaultValue="NONE"><option value="NONE">{locale === "en" ? "None" : "Aucun"}</option><option value="CASH">Cash</option><option value="PROVIDER">Wallet</option></Select></Field><Field label={locale === "en" ? "Provider reference" : "Référence opérateur"}><Input name="externalReference" required maxLength={160} /></Field></div><div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">{activeCash ? `${locale === "en" ? "Till" : "Caisse"}: ${activeCash.financialAccount.name} · ${activeCash.financialAccount.currencyCode}` : (locale === "en" ? "Open a till before continuing." : "Ouvrez une caisse avant de continuer.")}</div><Button className="w-fit" disabled={Boolean(busyAction) || !activeCash || !mappedProviders.length}><Smartphone className="h-4 w-4" />{locale === "en" ? "Review operation" : "Vérifier l’opération"}</Button></form></ModuleSection>{pending ? <ConfirmationCard locale={locale} title={locale === "en" ? "Confirm Mobile Money" : "Confirmer Mobile Money"} lines={[String(pending.providerCode), `${pending.transactionType} · ${moneyValue(Number(pending.principalAmount), String(pending.currencyCode))}`, String(pending.customerPhone), `${locale === "en" ? "Reference" : "Référence"}: ${pending.externalReference}`]} busy={busyAction === "mobile-money"} onCancel={() => setPending(null)} onConfirm={() => void confirm()} /> : null}</div>;
}

function TelcoPanel({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: Dashboard; locale: "fr" | "en"; busyAction: string | null; mutate: Mutate }) {
  const providers = (dashboard.providers || []).filter((provider) => provider.providerType === "TELCO");
  const mappedProviders = providers.filter((provider) => provider.telcoFloatAccountId);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [tenderMethod, setTenderMethod] = useState("CASH");
  const activeCash = dashboard.cashSession?.status === "OPEN" ? dashboard.cashSession : null;
  const currency = activeCash?.financialAccount.currencyCode || dashboard.configuration?.baseCurrencyCode || "CDF";
  const nonCash = dashboard.accounts.filter((account) => ["MOBILE_MONEY", "BANK", "CLEARING"].includes(account.accountType) && account.currencyCode === currency);
  async function confirm() { if (!pending) return; const body = await mutate("telco-topup", `/api/enterprise/${organizationId}/retail/telco-topups`, pending, locale === "en" ? "Top-up recorded." : "Recharge enregistrée."); if (body) setPending(null); }
  return <div className="grid min-w-0 gap-5"><OpenCashForm organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} /><ModuleSection title={locale === "en" ? "Airtime / bundle" : "Crédit / forfait"} description={locale === "en" ? "Choose the network operator. The supplier float is resolved automatically." : "Choisissez l’opérateur réseau. Le float fournisseur est résolu automatiquement."}><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const providerCode = String(form.get("providerCode") || ""); const status = String(form.get("status") || "SUCCESS"); const provider = mappedProviders.find((item) => item.providerCode === providerCode); const tenderAccountId = tenderMethod === "CASH" ? activeCash?.financialAccount.id || "" : String(form.get("tenderAccountId") || ""); const externalReference = String(form.get("externalReference") || "").trim(); if (!provider || !tenderAccountId || (status === "SUCCESS" && !externalReference)) return; setPending({ providerCode, destinationPhone: normalizePhonePreview(String(form.get("destinationPhone") || "")), catalogItemId: String(form.get("catalogItemId") || "") || null, offerLabel: String(form.get("offerLabel") || ""), currencyCode: currency, saleAmount: Number(form.get("saleAmount") || 0), operatorCost: Number(form.get("operatorCost") || 0), tenderFinancialAccountId: tenderAccountId, operatorFloatAccountId: null, externalReference: externalReference || null, status, failureReason: String(form.get("failureReason") || "") || null }); }} className="grid min-w-0 gap-4"><div className="grid min-w-0 gap-4 md:grid-cols-2"><Field label={locale === "en" ? "Network" : "Opérateur réseau"}><Select name="providerCode" required><option value="">—</option>{mappedProviders.map((provider) => <option key={provider.id} value={provider.providerCode}>{provider.label}</option>)}</Select></Field><Field label={locale === "en" ? "Destination phone" : "Numéro destinataire"}><Input name="destinationPhone" required inputMode="tel" placeholder="+243…" /></Field><Field label={locale === "en" ? "Catalog offer (optional)" : "Offre catalogue (facultatif)"}><Select name="catalogItemId"><option value="">—</option>{(dashboard.catalogItems || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label={locale === "en" ? "Offer label" : "Libellé du forfait"}><Input name="offerLabel" required /></Field><Field label={locale === "en" ? "Sale price" : "Prix de vente"}><Input name="saleAmount" type="number" min="0.01" step="0.01" required /></Field><Field label={locale === "en" ? "Operator cost" : "Coût opérateur"}><Input name="operatorCost" type="number" min="0" step="0.01" required /></Field><Field label={locale === "en" ? "Payment method" : "Mode d’encaissement"}><Select name="tenderMethod" value={tenderMethod} onChange={setTenderMethod}><option value="CASH">Cash</option><option value="NON_CASH">{locale === "en" ? "Configured non-cash account" : "Compte non-cash configuré"}</option></Select></Field><Field label={locale === "en" ? "Tender account" : "Compte d’encaissement"}>{tenderMethod === "CASH" ? <Input value={activeCash?.financialAccount.name || (locale === "en" ? "Open a till first" : "Ouvrez d’abord une caisse")} readOnly /> : <Select name="tenderAccountId" required><option value="">—</option>{nonCash.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select>}</Field><Field label={locale === "en" ? "Execution status" : "Statut d’exécution"}><Select name="status" defaultValue="SUCCESS"><option value="SUCCESS">{locale === "en" ? "Success" : "Réussie"}</option><option value="FAILED">{locale === "en" ? "Failed" : "Échouée"}</option></Select></Field><Field label={locale === "en" ? "Provider reference (required on success)" : "Référence opérateur (obligatoire si réussie)"}><Input name="externalReference" maxLength={160} /></Field><Field label={locale === "en" ? "Failure reason" : "Motif d’échec"}><Input name="failureReason" maxLength={500} /></Field></div><Button className="w-fit" disabled={Boolean(busyAction) || !mappedProviders.length || (tenderMethod === "CASH" && !activeCash)}><RadioTower className="h-4 w-4" />{locale === "en" ? "Review top-up" : "Vérifier la recharge"}</Button></form></ModuleSection>{pending ? <ConfirmationCard locale={locale} title={locale === "en" ? "Confirm top-up" : "Confirmer la recharge"} lines={[String(pending.providerCode), `${pending.offerLabel} · ${moneyValue(Number(pending.saleAmount), String(pending.currencyCode))}`, String(pending.destinationPhone), `${locale === "en" ? "Reference" : "Référence"}: ${pending.externalReference || "—"}`, locale === "en" ? "Check the phone number carefully before confirming." : "Vérifiez soigneusement le numéro avant de confirmer."]} busy={busyAction === "telco-topup"} onCancel={() => setPending(null)} onConfirm={() => void confirm()} /> : null}</div>;
}

function ConfirmationCard({ locale, title, lines, busy, onCancel, onConfirm }: { locale: "fr" | "en"; title: string; lines: string[]; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <ModuleSection title={title} description={locale === "en" ? "This step prevents accidental provider-side operations." : "Cette étape réduit les erreurs avant une opération chez l’opérateur."}><div className="rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-4"><div className="grid gap-1">{lines.map((line, index) => <p key={`${line}-${index}`} className="break-words text-sm font-bold text-dtsc-ink">{line}</p>)}</div><div data-responsive-actions className="mt-4"><Button variant="outline" type="button" disabled={busy} onClick={onCancel}>{locale === "en" ? "Edit" : "Modifier"}</Button><Button type="button" disabled={busy} onClick={onConfirm}><CheckCircle2 className="h-4 w-4" />{busy ? (locale === "en" ? "Processing…" : "Traitement…") : (locale === "en" ? "Confirm" : "Confirmer")}</Button></div></div></ModuleSection>;
}

function DailyClosePanel({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: Dashboard; locale: "fr" | "en"; busyAction: string | null; mutate: Mutate }) {
  const accounts = dashboard.accounts.filter((account) => ["CASH", "MOBILE_MONEY", "CLEARING"].includes(account.accountType));
  return <div className="grid min-w-0 gap-5"><OpenCashForm organizationId={organizationId} dashboard={dashboard} locale={locale} busyAction={busyAction} mutate={mutate} /><ModuleSection title={locale === "en" ? "Daily cash & float close" : "Clôture journalière cash & float"} description={locale === "en" ? "Count cash, declare provider floats and explain every variance." : "Comptez le cash, déclarez les floats et justifiez chaque écart."}><form onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const lines = accounts.filter((account) => form.get(`include-${account.id}`) === "on").map((account) => ({ financialAccountId: account.id, accountType: account.accountType, declaredBalance: Number(form.get(`declared-${account.id}`) || 0), varianceReason: String(form.get(`reason-${account.id}`) || "") || null, denominations: account.accountType === "CASH" ? parseDenominations(String(form.get(`denominations-${account.id}`) || "")) : [] })); if (!lines.length) return; await mutate("daily-close", `/api/enterprise/${organizationId}/retail/daily-close`, { businessDate: new Date(`${String(form.get("businessDate") || new Date().toISOString().slice(0, 10))}T12:00:00`), notes: String(form.get("notes") || "") || null, lines }, locale === "en" ? "Close submitted for independent validation." : "Clôture soumise à validation indépendante."); }} className="grid min-w-0 gap-4"><div className="grid min-w-0 gap-4 sm:grid-cols-2"><Field label={locale === "en" ? "Business date" : "Date d’exploitation"}><Input name="businessDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field><Field label="Notes"><Input name="notes" maxLength={2000} /></Field></div><div className="grid min-w-0 gap-3">{accounts.map((account) => <div key={account.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)] md:items-end"><label className="flex min-h-11 items-center gap-2 break-words text-sm font-black text-dtsc-ink"><input type="checkbox" name={`include-${account.id}`} />{account.name}</label><Field label={`${locale === "en" ? "Declared" : "Déclaré"} · ${account.currencyCode}`}><Input name={`declared-${account.id}`} type="number" min="0" step="0.01" defaultValue={String(account.operationalBalance)} /></Field>{account.accountType === "CASH" ? <Field label={locale === "en" ? "Denominations" : "Coupures"}><Input name={`denominations-${account.id}`} placeholder="50000x2,20000x3" /></Field> : <div className="break-words text-xs font-semibold text-dtsc-muted">{locale === "en" ? "System" : "Système"}: {moneyValue(account.operationalBalance, account.currencyCode)}</div>}<Field label={locale === "en" ? "Variance reason" : "Motif d’écart"}><Input name={`reason-${account.id}`} maxLength={1000} /></Field></div>)}</div><Button className="w-fit" disabled={Boolean(busyAction) || !dashboard.access.canWrite}><ClipboardCheck className="h-4 w-4" />{busyAction === "daily-close" ? "…" : (locale === "en" ? "Submit close" : "Soumettre la clôture")}</Button></form></ModuleSection></div>;
}

function HistoryPanel({ organizationId, moduleCode, dashboard, locale, busyAction, mutate }: { organizationId: string; moduleCode: RetailModuleCode; dashboard: Dashboard; locale: "fr" | "en"; busyAction: string | null; mutate: Mutate }) {
  async function reverse(kind: "sales" | "mobile-money" | "telco-topups", id: string, revision: number) { const reason = window.prompt(locale === "en" ? "Reason for reversal" : "Motif de l’annulation"); if (!reason?.trim()) return; await mutate(`reverse-${id}`, `/api/enterprise/${organizationId}/retail/${kind}/${id}/reverse`, { revision, reason: reason.trim() }, locale === "en" ? "Reversal completed." : "Annulation enregistrée.", { idempotent: false }); }
  if (moduleCode === "RETAIL_POS") { const items = dashboard.recent.sales || []; return <ModuleSection title={locale === "en" ? "Recent receipts" : "Tickets récents"}>{items.length ? <BusinessList ariaLabel="POS receipts">{items.map((item) => <BusinessListItem key={item.id} title={`${item.number} · ${moneyValue(item.grandTotal, item.currencyCode)}`} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={formatEnterpriseDate(item.soldAt, locale)} description={item.lines.map((line) => `${line.description} × ${Number(line.quantity)}`).join(" · ")} actions={dashboard.access.canManage && item.status === "COMPLETED" ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void reverse("sales", item.id, item.revision)}><RotateCcw className="h-4 w-4" />{locale === "en" ? "Reverse" : "Annuler"}</Button> : undefined} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No receipt" : "Aucun ticket"} description="—" />}</ModuleSection>; }
  if (moduleCode === "MOBILE_MONEY_AGENCY") { const items = dashboard.recent.mobileMoney || []; return <ModuleSection title={locale === "en" ? "Mobile Money history" : "Historique Mobile Money"}>{items.length ? <BusinessList ariaLabel="Mobile Money history">{items.map((item) => <BusinessListItem key={item.id} title={`${item.number} · ${item.providerCode}`} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={`${item.transactionType} · ${moneyValue(item.principalAmount, item.currencyCode)} · ${formatEnterpriseDate(item.occurredAt, locale)}`} description={`${item.customerPhoneMasked || "—"} · ${item.externalReference || "—"}`} actions={dashboard.access.canManage && item.status === "CONFIRMED" ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void reverse("mobile-money", item.id, item.revision)}><RotateCcw className="h-4 w-4" />{locale === "en" ? "Reverse" : "Annuler"}</Button> : undefined} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No transaction" : "Aucune opération"} description="—" />}</ModuleSection>; }
  if (moduleCode === "TELCO_TOPUPS") { const items = dashboard.recent.topups || []; return <ModuleSection title={locale === "en" ? "Top-up history" : "Historique Télécom"}>{items.length ? <BusinessList ariaLabel="Telco history">{items.map((item) => <BusinessListItem key={item.id} title={`${item.number} · ${item.providerCode}`} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={`${item.offerLabel} · ${moneyValue(item.saleAmount, item.currencyCode)} · ${formatEnterpriseDate(item.occurredAt, locale)}`} description={`${item.destinationPhoneMasked || "—"} · ${locale === "en" ? "Margin" : "Marge"} ${moneyValue(item.marginAmount, item.currencyCode)} · ${item.externalReference || "—"}`} actions={dashboard.access.canManage && item.status === "SUCCESS" ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void reverse("telco-topups", item.id, item.revision)}><RotateCcw className="h-4 w-4" />{locale === "en" ? "Reverse" : "Annuler"}</Button> : undefined} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No top-up" : "Aucune recharge"} description="—" />}</ModuleSection>; }
  const items = dashboard.recent.closes || [];
  async function decide(item: DailyClose, decision: "APPROVE" | "REJECT") { const reason = decision === "REJECT" ? window.prompt(locale === "en" ? "Rejection reason" : "Motif du refus") : null; if (decision === "REJECT" && !reason?.trim()) return; await mutate(`close-${item.id}`, `/api/enterprise/${organizationId}/retail/daily-close/${item.id}/decision`, { revision: item.revision, decision, reason: reason?.trim() || null }, decision === "APPROVE" ? (locale === "en" ? "Close approved." : "Clôture approuvée.") : (locale === "en" ? "Close rejected." : "Clôture refusée."), { idempotent: false }); }
  return <ModuleSection title={locale === "en" ? "Daily closes" : "Clôtures journalières"}>{items.length ? <BusinessList ariaLabel="Daily closes">{items.map((item) => <BusinessListItem key={item.id} title={item.number} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium" }).format(new Date(item.businessDate))} description={item.lines.map((line) => `${line.accountType} ${moneyValue(line.declaredBalance, line.currencyCode)} · Δ ${moneyValue(line.differenceAmount, line.currencyCode)}`).join(" · ")} actions={dashboard.access.canManage && item.status === "SUBMITTED" ? <div data-responsive-actions><Button size="sm" disabled={Boolean(busyAction)} onClick={() => void decide(item, "APPROVE")}><CheckCircle2 className="h-4 w-4" />{locale === "en" ? "Approve" : "Valider"}</Button><Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void decide(item, "REJECT")}><XCircle className="h-4 w-4" />{locale === "en" ? "Reject" : "Refuser"}</Button></div> : undefined} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No close" : "Aucune clôture"} description="—" />}</ModuleSection>;
}

function ProviderConfiguration({ organizationId, moduleCode, dashboard, locale, busyAction, mutate }: { organizationId: string; moduleCode: RetailModuleCode; dashboard: Dashboard; locale: "fr" | "en"; busyAction: string | null; mutate: Mutate }) {
  const providers = dashboard.providers || [];
  const accountName = (id: string | null) => dashboard.accounts.find((account) => account.id === id)?.name || "—";
  const mobileAccounts = dashboard.accounts.filter((account) => account.accountType === "MOBILE_MONEY");
  const telcoAccounts = dashboard.accounts.filter((account) => ["MOBILE_MONEY", "CLEARING"].includes(account.accountType));
  return <ModuleSection title={moduleCode === "MOBILE_MONEY_AGENCY" ? (locale === "en" ? "Mobile Money wallets" : "Wallets Mobile Money") : (locale === "en" ? "Telecom networks" : "Opérateurs Télécom")} description={locale === "en" ? "Agents never select float accounts during operations. Managers map them here once." : "Les agents ne choisissent jamais le float pendant une opération. Le responsable le mappe ici une seule fois."}><div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">{providers.map((provider) => <form key={provider.id} onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await mutate(`provider-${provider.id}`, `/api/enterprise/${organizationId}/retail/providers?moduleCode=${moduleCode}`, { providerCode: provider.providerCode, label: provider.label, providerType: provider.providerType, mobileMoneyFloatAccountId: provider.providerType === "MOBILE_MONEY" ? String(form.get("floatAccountId") || "") || null : null, telcoFloatAccountId: provider.providerType === "TELCO" ? String(form.get("floatAccountId") || "") || null : null, isActive: true }, locale === "en" ? "Provider mapping saved." : "Mapping opérateur enregistré.", { idempotent: false }); }} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><p className="break-words font-black text-dtsc-ink">{provider.label}</p><p className="text-xs font-bold text-dtsc-muted">{provider.providerType} · {locale === "en" ? "Current" : "Actuel"}: {accountName(provider.providerType === "MOBILE_MONEY" ? provider.mobileMoneyFloatAccountId : provider.telcoFloatAccountId)}</p></div><StatusBadge tone={(provider.mobileMoneyFloatAccountId || provider.telcoFloatAccountId) ? "success" : "warning"}>{(provider.mobileMoneyFloatAccountId || provider.telcoFloatAccountId) ? "OK" : (locale === "en" ? "To map" : "À mapper")}</StatusBadge></div>{dashboard.access.canManage ? <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field label={locale === "en" ? "Float account" : "Compte de float"}><Select name="floatAccountId" defaultValue={(provider.providerType === "MOBILE_MONEY" ? provider.mobileMoneyFloatAccountId : provider.telcoFloatAccountId) || ""}><option value="">—</option>{(provider.providerType === "MOBILE_MONEY" ? mobileAccounts : telcoAccounts).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select></Field><Button disabled={Boolean(busyAction)}><Settings2 className="h-4 w-4" />{locale === "en" ? "Save" : "Enregistrer"}</Button></div> : null}</form>)}</div></ModuleSection>;
}

function ReportsPanel({ dashboard, moduleCode, locale }: { dashboard: Dashboard; moduleCode: RetailModuleCode; locale: "fr" | "en" }) {
  const rows: Array<{ label: string; currency: string; value: string; secondary?: string }> = [];
  if (moduleCode === "RETAIL_POS") for (const row of dashboard.metricsByCurrency.sales || []) rows.push({ label: locale === "en" ? "Sales" : "Ventes", currency: row.currencyCode, value: moneyValue(row.amount, row.currencyCode), secondary: `${row.count} ${locale === "en" ? "receipts" : "tickets"}` });
  if (moduleCode === "MOBILE_MONEY_AGENCY") for (const row of dashboard.metricsByCurrency.mobileMoney || []) { rows.push({ label: locale === "en" ? "Deposits" : "Dépôts", currency: row.currencyCode, value: moneyValue(row.deposits, row.currencyCode) }); rows.push({ label: locale === "en" ? "Withdrawals" : "Retraits", currency: row.currencyCode, value: moneyValue(row.withdrawals, row.currencyCode) }); rows.push({ label: locale === "en" ? "Commission" : "Commission", currency: row.currencyCode, value: moneyValue(row.commission, row.currencyCode) }); }
  if (moduleCode === "TELCO_TOPUPS") for (const row of dashboard.metricsByCurrency.telco || []) { rows.push({ label: locale === "en" ? "Top-up sales" : "Ventes Télécom", currency: row.currencyCode, value: moneyValue(row.revenue, row.currencyCode), secondary: `${row.count} ${locale === "en" ? "operations" : "opérations"}` }); rows.push({ label: locale === "en" ? "Margin" : "Marge", currency: row.currencyCode, value: moneyValue(row.margin, row.currencyCode) }); }
  return <div className="grid min-w-0 gap-5"><ModuleSection title={locale === "en" ? "Period summary by currency" : "Synthèse de période par devise"} description={`${formatEnterpriseDate(dashboard.range.from, locale)} → ${formatEnterpriseDate(dashboard.range.to, locale)}`}><div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((row, index) => <div key={`${row.label}-${row.currency}-${index}`} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{row.label} · {row.currency}</p><p className="mt-2 break-words text-xl font-black text-dtsc-ink">{row.value}</p>{row.secondary ? <p className="mt-1 text-xs font-bold text-dtsc-muted">{row.secondary}</p> : null}</div>)}{!rows.length ? <EmptyState compact title={locale === "en" ? "No metric" : "Aucun indicateur"} description={locale === "en" ? "No operation in the selected period." : "Aucune opération sur la période sélectionnée."} /> : null}</div></ModuleSection><ModuleSection title={locale === "en" ? "Operational account balances" : "Soldes opérationnels"} description={locale === "en" ? "Balances are never added across currencies." : "Les soldes de devises différentes ne sont jamais additionnés."}><BusinessList ariaLabel="Shop account balances">{dashboard.accounts.map((account) => <BusinessListItem key={account.id} title={`${account.code} · ${account.name}`} status={<StatusBadge tone="info">{account.accountType}</StatusBadge>} meta={moneyValue(account.operationalBalance, account.currencyCode)} />)}</BusinessList></ModuleSection></div>;
}
