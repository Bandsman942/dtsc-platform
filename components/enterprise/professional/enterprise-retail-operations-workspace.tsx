"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Banknote, CheckCircle2, ClipboardCheck, PackageCheck, RadioTower, RefreshCw, RotateCcw, Settings2, ShoppingCart, Smartphone, WalletCards, XCircle } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field, NativeSelect, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalFormSection, ProfessionalLoading, ProfessionalTabs, professionalMutation } from "@/components/enterprise/professional/professional-erp-ui";
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
type Provider = { id: string; providerCode: string; label: string; providerType: string; mobileMoneyFloatAccountId: string | null; telcoFloatAccountId: string | null; isActive: boolean };
type CatalogItem = { id: string; code: string; sku: string | null; name: string; itemType: string; indicativeSalePrice: string | number | null; indicativeCost: string | number | null; currency: string | null; trackInventory: boolean };
type InventoryItem = { id: string; catalogItemId: string; balances: Array<{ warehouseId: string; storageLocationId: string | null; stockLotId: string | null; quantityOnHand: string | number; quantityReserved: string | number }> };
type Warehouse = { id: string; code: string; name: string; site: { id: string; name: string }; storageLocations: Array<{ id: string; code: string; name: string }> };
type Sale = { id: string; number: string; status: string; revision: number; currencyCode: string; grandTotal: string | number; soldAt: string; lines: Array<{ id: string; description: string; quantity: string | number; lineTotal: string | number }>; tenders: Array<{ id: string; methodType: string; amount: string | number }> };
type MobileMoney = { id: string; number: string; providerCode: string; transactionType: string; customerPhoneMasked?: string; customerPhone?: string; currencyCode: string; principalAmount: string | number; customerFeeAmount: string | number; providerCommissionAmount: string | number; externalReference: string | null; status: string; occurredAt: string; revision: number };
type Topup = { id: string; number: string; providerCode: string; destinationPhoneMasked?: string; destinationPhone?: string; offerLabel: string; currencyCode: string; saleAmount: string | number; operatorCost: string | number; marginAmount: string | number; status: string; occurredAt: string; revision: number };
type DailyClose = { id: string; number: string; businessDate: string; status: string; revision: number; submittedAt: string; lines: Array<{ id: string; accountType: string; currencyCode: string; systemClosingBalance: string | number; declaredBalance: string | number; differenceAmount: string | number; varianceReason: string | null }> };
type Dashboard = {
  configuration: { profileCode: string; baseCurrencyCode: string } | null;
  access: { canWrite: boolean; canManage: boolean };
  accounts: Account[];
  providers?: Provider[];
  warehouses?: Warehouse[];
  catalogItems?: CatalogItem[];
  inventoryItems?: InventoryItem[];
  metrics: Record<string, string | number>;
  recent: { sales?: Sale[]; mobileMoney?: MobileMoney[]; topups?: Topup[]; closes?: DailyClose[] };
  range: { from: string; to: string };
};

type Tab = "OPERATE" | "HISTORY" | "PROVIDERS" | "REPORTS";

const COPY = {
  fr: {
    eyebrow: "Commerce Retail · profil Télécom & Mobile Money",
    guide: "Guide utilisateur",
    operate: "Opérer",
    history: "Historique",
    providers: "Opérateurs",
    reports: "Rapports",
    refresh: "Actualiser",
    loading: "Chargement des opérations Retail…",
    noData: "Aucune opération sur la période.",
    cashSession: "Session de caisse",
    cashSessionHelp: "Le cash ne peut bouger qu’avec une session ouverte par l’utilisateur connecté.",
    openCash: "Ouvrir la caisse",
    openingAmount: "Fonds d’ouverture",
    account: "Compte",
    currency: "Devise",
    submit: "Enregistrer",
    reverse: "Annuler",
    reason: "Motif",
    today: "Aujourd’hui",
    configuredProfile: "Profil actif",
    accountBalances: "Soldes opérationnels",
    providerSetup: "Configurer un opérateur",
    providerCode: "Code opérateur",
    providerLabel: "Libellé",
    providerType: "Type",
    mobileFloat: "Float Mobile Money",
    telcoFloat: "Float Télécom",
    saveProvider: "Enregistrer l’opérateur",
  },
  en: {
    eyebrow: "Retail Commerce · Telco & Mobile Money profile",
    guide: "User guide",
    operate: "Operate",
    history: "History",
    providers: "Providers",
    reports: "Reports",
    refresh: "Refresh",
    loading: "Loading retail operations…",
    noData: "No operation in the selected period.",
    cashSession: "Cash session",
    cashSessionHelp: "Cash can move only through a session opened by the signed-in user.",
    openCash: "Open cash session",
    openingAmount: "Opening float",
    account: "Account",
    currency: "Currency",
    submit: "Save",
    reverse: "Reverse",
    reason: "Reason",
    today: "Today",
    configuredProfile: "Active profile",
    accountBalances: "Operational balances",
    providerSetup: "Configure provider",
    providerCode: "Provider code",
    providerLabel: "Label",
    providerType: "Type",
    mobileFloat: "Mobile Money float",
    telcoFloat: "Telco float",
    saveProvider: "Save provider",
  },
} as const;

function moneyValue(value: string | number | null | undefined, currency?: string) {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "0"}${currency ? ` ${currency}` : ""}`;
}

function statusTone(status: string) {
  if (["COMPLETED", "CONFIRMED", "SUCCESS", "APPROVED", "CLOSED"].includes(status)) return "success" as const;
  if (["SUBMITTED", "PENDING_VALIDATION", "OPEN"].includes(status)) return "warning" as const;
  if (["REVERSED", "FAILED", "REJECTED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function parseDenominations(value: string) {
  return value.split(",").map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const [denomination, quantity] = chunk.split(/[x×*]/).map((part) => part.trim());
    return { denomination: Number(denomination || 0), quantity: Number(quantity || 0) };
  }).filter((item) => item.denomination > 0 && Number.isInteger(item.quantity) && item.quantity >= 0);
}

export function EnterpriseRetailOperationsWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useAppLocale() === "en" ? "en" : "fr";
  const text = COPY[locale];
  const moduleCode = definition.code as RetailModuleCode;
  const [tab, setTab] = useState<Tab>("OPERATE");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const guide = useMemo(() => getRetailUserGuide(moduleCode, locale), [locale, moduleCode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=${encodeURIComponent(moduleCode)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as Dashboard & { message?: string; error?: string } | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || (locale === "en" ? "Unable to load retail data." : "Chargement Retail impossible."));
      setDashboard(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.loading);
    } finally {
      setLoading(false);
    }
  }, [locale, moduleCode, organizationId, refreshKey, text.loading]);

  useEffect(() => { void load(); }, [load]);

  const accounts = dashboard?.accounts || [];
  const cashAccounts = accounts.filter((item) => item.accountType === "CASH");
  const mobileAccounts = accounts.filter((item) => item.accountType === "MOBILE_MONEY");
  const floatAccounts = accounts.filter((item) => ["MOBILE_MONEY", "CLEARING"].includes(item.accountType));
  const tenderAccounts = accounts.filter((item) => ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"].includes(item.accountType));
  const providers = dashboard?.providers || [];
  const catalogItems = dashboard?.catalogItems || [];
  const inventoryItems = dashboard?.inventoryItems || [];
  const warehouses = dashboard?.warehouses || [];
  const showProviders = ["MOBILE_MONEY_AGENCY", "TELCO_TOPUPS"].includes(moduleCode);
  const tabs = useMemo(() => [
    { id: "OPERATE" as const, label: text.operate },
    { id: "HISTORY" as const, label: text.history, count: moduleCode === "RETAIL_POS" ? dashboard?.recent.sales?.length : moduleCode === "MOBILE_MONEY_AGENCY" ? dashboard?.recent.mobileMoney?.length : moduleCode === "TELCO_TOPUPS" ? dashboard?.recent.topups?.length : dashboard?.recent.closes?.length },
    ...(showProviders ? [{ id: "PROVIDERS" as const, label: text.providers, count: providers.length }] : []),
    { id: "REPORTS" as const, label: text.reports },
  ], [dashboard, moduleCode, providers.length, showProviders, text.history, text.operate, text.providers, text.reports]);

  async function mutate(endpoint: string, payload: unknown, success: string) {
    try {
      setMessage("");
      await professionalMutation(endpoint, payload);
      setMessage(success);
      setRefreshKey((value) => value + 1);
    } catch (mutationError) {
      setMessage(mutationError instanceof Error ? mutationError.message : (locale === "en" ? "Operation failed." : "L’opération a échoué."));
    }
  }

  async function openCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate(`/api/enterprise/${organizationId}/retail/cash-sessions`, { financialAccountId: String(form.get("financialAccountId") || ""), openingAmount: String(form.get("openingAmount") || "0") }, locale === "en" ? "Cash session opened." : "Session de caisse ouverte.");
  }

  async function createSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const catalogItemId = String(form.get("catalogItemId") || "");
    const item = catalogItems.find((entry) => entry.id === catalogItemId);
    const inventory = inventoryItems.find((entry) => entry.catalogItemId === catalogItemId);
    const warehouseId = String(form.get("warehouseId") || "");
    const tender1Amount = Number(form.get("tender1Amount") || 0);
    const tender2Amount = Number(form.get("tender2Amount") || 0);
    const tenders = [
      { methodType: String(form.get("tender1Method") || "CASH"), financialAccountId: String(form.get("tender1Account") || ""), amount: tender1Amount, reference: String(form.get("tender1Reference") || "") || null },
      ...(String(form.get("tender2Account") || "") && tender2Amount > 0 ? [{ methodType: String(form.get("tender2Method") || "MOBILE_MONEY"), financialAccountId: String(form.get("tender2Account") || ""), amount: tender2Amount, reference: String(form.get("tender2Reference") || "") || null }] : []),
    ];
    await mutate(`/api/enterprise/${organizationId}/retail/sales`, {
      warehouseId,
      storageLocationId: String(form.get("storageLocationId") || "") || null,
      siteId: warehouses.find((entry) => entry.id === warehouseId)?.site.id || null,
      currencyCode: String(form.get("currencyCode") || item?.currency || "CDF").toUpperCase(),
      idempotencyKey: crypto.randomUUID(),
      lines: [{ catalogItemId, inventoryItemId: inventory?.id || null, quantity: Number(form.get("quantity") || 1), unitPrice: Number(form.get("unitPrice") || item?.indicativeSalePrice || 0), discountAmount: Number(form.get("discountAmount") || 0), taxAmount: Number(form.get("taxAmount") || 0) }],
      tenders,
    }, locale === "en" ? "Receipt completed." : "Ticket encaissé et stock mis à jour.");
    event.currentTarget.reset();
  }

  async function createMobileMoney(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate(`/api/enterprise/${organizationId}/retail/mobile-money`, {
      providerCode: String(form.get("providerCode") || ""), transactionType: String(form.get("transactionType") || "DEPOSIT"), customerPhone: String(form.get("customerPhone") || ""), currencyCode: String(form.get("currencyCode") || "CDF").toUpperCase(), principalAmount: Number(form.get("principalAmount") || 0), customerFeeAmount: Number(form.get("customerFeeAmount") || 0), providerCommissionAmount: Number(form.get("providerCommissionAmount") || 0), feeCollectionMode: String(form.get("feeCollectionMode") || "NONE"), cashAccountId: String(form.get("cashAccountId") || ""), floatAccountId: String(form.get("floatAccountId") || "") || null, externalReference: String(form.get("externalReference") || "") || null, idempotencyKey: crypto.randomUUID(),
    }, locale === "en" ? "Mobile Money transaction confirmed." : "Opération Mobile Money confirmée.");
    event.currentTarget.reset();
  }

  async function createTopup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate(`/api/enterprise/${organizationId}/retail/telco-topups`, {
      providerCode: String(form.get("providerCode") || ""), destinationPhone: String(form.get("destinationPhone") || ""), catalogItemId: String(form.get("catalogItemId") || "") || null, offerLabel: String(form.get("offerLabel") || ""), currencyCode: String(form.get("currencyCode") || "CDF").toUpperCase(), saleAmount: Number(form.get("saleAmount") || 0), operatorCost: Number(form.get("operatorCost") || 0), tenderFinancialAccountId: String(form.get("tenderFinancialAccountId") || ""), operatorFloatAccountId: String(form.get("operatorFloatAccountId") || "") || null, externalReference: String(form.get("externalReference") || "") || null, status: String(form.get("status") || "SUCCESS"), failureReason: String(form.get("failureReason") || "") || null, idempotencyKey: crypto.randomUUID(),
    }, locale === "en" ? "Top-up recorded." : "Recharge Télécom enregistrée.");
    event.currentTarget.reset();
  }

  async function createClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const lines = accounts.filter((account) => ["CASH", "MOBILE_MONEY", "CLEARING"].includes(account.accountType) && form.get(`include-${account.id}`) === "on").map((account) => ({ financialAccountId: account.id, accountType: account.accountType, declaredBalance: Number(form.get(`declared-${account.id}`) || 0), varianceReason: String(form.get(`reason-${account.id}`) || "") || null, denominations: account.accountType === "CASH" ? parseDenominations(String(form.get(`denominations-${account.id}`) || "")) : [] }));
    await mutate(`/api/enterprise/${organizationId}/retail/daily-close`, { businessDate: new Date(`${String(form.get("businessDate") || new Date().toISOString().slice(0, 10))}T12:00:00`), notes: String(form.get("notes") || "") || null, idempotencyKey: crypto.randomUUID(), lines }, locale === "en" ? "Daily close submitted for independent validation." : "Clôture soumise à une validation indépendante.");
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutate(`/api/enterprise/${organizationId}/retail/providers?moduleCode=${moduleCode}`, { providerCode: String(form.get("providerCode") || ""), label: String(form.get("label") || ""), providerType: String(form.get("providerType") || (moduleCode === "TELCO_TOPUPS" ? "TELCO" : "MOBILE_MONEY")), mobileMoneyFloatAccountId: String(form.get("mobileMoneyFloatAccountId") || "") || null, telcoFloatAccountId: String(form.get("telcoFloatAccountId") || "") || null, isActive: true }, locale === "en" ? "Provider saved." : "Opérateur enregistré.");
  }

  async function reverseEntity(kind: "sale" | "mobile" | "topup", id: string, revision: number) {
    const reason = window.prompt(locale === "en" ? "Reason for reversal" : "Motif de l’annulation");
    if (!reason?.trim()) return;
    const endpoint = kind === "sale" ? `sales/${id}/reverse` : kind === "mobile" ? `mobile-money/${id}/reverse` : `telco-topups/${id}/reverse`;
    await mutate(`/api/enterprise/${organizationId}/retail/${endpoint}`, { revision, reason: reason.trim() }, locale === "en" ? "Reversal completed." : "Annulation enregistrée.");
  }

  async function decideClose(close: DailyClose, decision: "APPROVE" | "REJECT") {
    const reason = decision === "REJECT" ? window.prompt(locale === "en" ? "Rejection reason" : "Motif du refus") : null;
    if (decision === "REJECT" && !reason?.trim()) return;
    await mutate(`/api/enterprise/${organizationId}/retail/daily-close/${close.id}/decision`, { revision: close.revision, decision, reason: reason?.trim() || null }, decision === "APPROVE" ? (locale === "en" ? "Close approved." : "Clôture approuvée.") : (locale === "en" ? "Close rejected." : "Clôture refusée."));
  }

  const metricNodes = moduleCode === "RETAIL_POS"
    ? <><ModuleMetric label={locale === "en" ? "Receipts" : "Tickets"} value={dashboard?.metrics.salesCount || 0} /><ModuleMetric label={locale === "en" ? "Revenue" : "Ventes"} value={moneyValue(dashboard?.metrics.salesRevenue || 0, dashboard?.configuration?.baseCurrencyCode || "CDF")} /><ModuleMetric label={locale === "en" ? "Catalog items" : "Articles catalogue"} value={catalogItems.length} /><ModuleMetric label={locale === "en" ? "Warehouses" : "Dépôts"} value={warehouses.length} /></>
    : moduleCode === "MOBILE_MONEY_AGENCY"
      ? <><ModuleMetric label={locale === "en" ? "Deposits" : "Dépôts"} value={moneyValue(dashboard?.metrics.mobileMoneyDeposits || 0, dashboard?.configuration?.baseCurrencyCode || "CDF")} /><ModuleMetric label={locale === "en" ? "Withdrawals" : "Retraits"} value={moneyValue(dashboard?.metrics.mobileMoneyWithdrawals || 0, dashboard?.configuration?.baseCurrencyCode || "CDF")} /><ModuleMetric label={locale === "en" ? "Commission" : "Commissions"} value={moneyValue(dashboard?.metrics.mobileMoneyCommission || 0, dashboard?.configuration?.baseCurrencyCode || "CDF")} /><ModuleMetric label={locale === "en" ? "Providers" : "Opérateurs"} value={providers.length} /></>
      : moduleCode === "TELCO_TOPUPS"
        ? <><ModuleMetric label={locale === "en" ? "Top-up revenue" : "Ventes Télécom"} value={moneyValue(dashboard?.metrics.topupRevenue || 0, dashboard?.configuration?.baseCurrencyCode || "CDF")} /><ModuleMetric label={locale === "en" ? "Margin" : "Marge"} value={moneyValue(dashboard?.metrics.topupMargin || 0, dashboard?.configuration?.baseCurrencyCode || "CDF")} /><ModuleMetric label={locale === "en" ? "Providers" : "Opérateurs"} value={providers.length} /><ModuleMetric label={locale === "en" ? "Offers" : "Offres catalogue"} value={catalogItems.length} /></>
        : <><ModuleMetric label={locale === "en" ? "Pending closes" : "Clôtures à valider"} value={dashboard?.metrics.pendingCloses || 0} /><ModuleMetric label={locale === "en" ? "Cash accounts" : "Caisses"} value={cashAccounts.length} /><ModuleMetric label={locale === "en" ? "Provider floats" : "Floats opérateurs"} value={floatAccounts.length} /><ModuleMetric label={text.configuredProfile} value={dashboard?.configuration?.profileCode || "—"} /></>;

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`${text.eyebrow} · ${organizationName}`} title={definition.labelFr} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => setGuideOpen(true)}>{text.guide}</Button><Button variant="outline" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-4 w-4" />{text.refresh}</Button></div>} />
    <ContextualUserGuide guide={guide} open={guideOpen} onOpenChange={setGuideOpen} hideTrigger />
    <ModuleMetrics label={locale === "en" ? "Retail indicators" : "Indicateurs Retail"}>{metricNodes}</ModuleMetrics>
    <ModuleToolbar controls={<ProfessionalTabs value={tab} onChange={setTab} items={tabs} label={locale === "en" ? "Retail module navigation" : "Navigation du module Retail"} />} summary={locale === "en" ? "All sensitive actions are validated server-side and audited." : "Toutes les actions sensibles sont validées côté serveur et auditées."} />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold text-dtsc-ink">{message}</div> : null}
      {error ? <ProfessionalError message={error} /> : loading ? <ProfessionalLoading rows={4} /> : !dashboard ? <EmptyState title={locale === "en" ? "Retail profile unavailable" : "Profil Retail indisponible"} description={error || text.loading} /> : <>
        {tab === "OPERATE" ? <OperatePanel moduleCode={moduleCode} locale={locale} text={text} cashAccounts={cashAccounts} mobileAccounts={mobileAccounts} floatAccounts={floatAccounts} tenderAccounts={tenderAccounts} providers={providers} catalogItems={catalogItems} warehouses={warehouses} accounts={accounts} canWrite={dashboard.access.canWrite} onOpenCash={openCash} onCreateSale={createSale} onCreateMobileMoney={createMobileMoney} onCreateTopup={createTopup} onCreateClose={createClose} /> : null}
        {tab === "HISTORY" ? <HistoryPanel moduleCode={moduleCode} locale={locale} dashboard={dashboard} canManage={dashboard.access.canManage} onReverse={reverseEntity} onCloseDecision={decideClose} /> : null}
        {tab === "PROVIDERS" && showProviders ? <ProviderPanel locale={locale} text={text} moduleCode={moduleCode} providers={providers} floatAccounts={floatAccounts} canManage={dashboard.access.canManage} onSave={saveProvider} /> : null}
        {tab === "REPORTS" ? <ReportsPanel locale={locale} text={text} dashboard={dashboard} /> : null}
      </>}
    </ModuleContent>
  </ModuleWorkspace>;
}

function OperatePanel({ moduleCode, locale, text, cashAccounts, mobileAccounts, floatAccounts, tenderAccounts, providers, catalogItems, warehouses, accounts, canWrite, onOpenCash, onCreateSale, onCreateMobileMoney, onCreateTopup, onCreateClose }: {
  moduleCode: RetailModuleCode; locale: "fr" | "en"; text: typeof COPY.fr | typeof COPY.en; cashAccounts: Account[]; mobileAccounts: Account[]; floatAccounts: Account[]; tenderAccounts: Account[]; providers: Provider[]; catalogItems: CatalogItem[]; warehouses: Warehouse[]; accounts: Account[]; canWrite: boolean; onOpenCash: (event: FormEvent<HTMLFormElement>) => void; onCreateSale: (event: FormEvent<HTMLFormElement>) => void; onCreateMobileMoney: (event: FormEvent<HTMLFormElement>) => void; onCreateTopup: (event: FormEvent<HTMLFormElement>) => void; onCreateClose: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const disabled = !canWrite;
  const accountChoices = (list: Account[]) => list.map((item) => ({ id: item.id, label: `${item.name} · ${moneyValue(item.operationalBalance, item.currencyCode)}` }));
  const providerChoices = providers.map((item) => ({ id: item.providerCode, label: item.label }));
  const catalogChoices = catalogItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const warehouseChoices = warehouses.map((item) => ({ id: item.id, label: `${item.site.name} · ${item.name}` }));
  const currencyDefault = accounts[0]?.currencyCode || "CDF";
  return <div className="grid gap-5">
    {["RETAIL_POS", "MOBILE_MONEY_AGENCY", "RETAIL_DAILY_CLOSE"].includes(moduleCode) ? <ModuleSection title={text.cashSession} description={text.cashSessionHelp}>
      <form onSubmit={onOpenCash} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_auto] md:items-end">
        <Field label={text.account}><NativeSelect name="financialAccountId" required items={accountChoices(cashAccounts)} disabled={disabled} /></Field>
        <Field label={text.openingAmount}><Input name="openingAmount" type="number" min="0" step="0.01" required disabled={disabled} /></Field>
        <Button type="submit" disabled={disabled || !cashAccounts.length}><Banknote className="h-4 w-4" />{text.openCash}</Button>
      </form>
    </ModuleSection> : null}

    {moduleCode === "RETAIL_POS" ? <ModuleSection title={locale === "en" ? "New counter receipt" : "Nouveau ticket comptoir"} description={locale === "en" ? "One API receipt can contain multiple items and tenders; this fast form captures the most common shop transaction." : "L’API accepte plusieurs articles et paiements ; ce formulaire rapide couvre l’encaissement le plus fréquent du shop."}>
      <form onSubmit={onCreateSale} className="grid gap-5">
        <ProfessionalFormSection title={locale === "en" ? "Item and stock" : "Article et stock"}>
          <Field label={locale === "en" ? "Warehouse" : "Dépôt / magasin"}><NativeSelect name="warehouseId" required items={warehouseChoices} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Storage location (optional)" : "Emplacement (facultatif)"}><NativeSelect name="storageLocationId" items={warehouses.flatMap((warehouse) => warehouse.storageLocations.map((location) => ({ id: location.id, label: `${warehouse.name} · ${location.name}` })))} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Product / service" : "Produit / service"}><NativeSelect name="catalogItemId" required items={catalogChoices} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Quantity" : "Quantité"}><Input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Unit price" : "Prix unitaire"}><Input name="unitPrice" type="number" min="0" step="0.01" required disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Currency" : "Devise"}><Input name="currencyCode" defaultValue={currencyDefault} maxLength={3} required disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Discount" : "Remise"}><Input name="discountAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Tax" : "Taxe"}><Input name="taxAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={disabled} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={locale === "en" ? "Tender 1" : "Paiement 1"} description={locale === "en" ? "Required. Add a second tender to split payment." : "Obligatoire. Ajoutez le paiement 2 pour un paiement fractionné."}>
          <Field label={locale === "en" ? "Method" : "Mode"}><NativeSelect name="tender1Method" required defaultValue="CASH" items={[{ id: "CASH", label: "Cash" }, { id: "MOBILE_MONEY", label: "Mobile Money" }, { id: "BANK_TRANSFER", label: locale === "en" ? "Bank transfer" : "Virement" }, { id: "CARD", label: locale === "en" ? "Card" : "Carte" }]} disabled={disabled} /></Field>
          <Field label={text.account}><NativeSelect name="tender1Account" required items={accountChoices(tenderAccounts)} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Amount" : "Montant"}><Input name="tender1Amount" type="number" min="0.01" step="0.01" required disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Reference" : "Référence"}><Input name="tender1Reference" maxLength={160} disabled={disabled} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={locale === "en" ? "Tender 2 (optional)" : "Paiement 2 (facultatif)"}>
          <Field label={locale === "en" ? "Method" : "Mode"}><NativeSelect name="tender2Method" defaultValue="MOBILE_MONEY" items={[{ id: "CASH", label: "Cash" }, { id: "MOBILE_MONEY", label: "Mobile Money" }, { id: "BANK_TRANSFER", label: locale === "en" ? "Bank transfer" : "Virement" }, { id: "CARD", label: locale === "en" ? "Card" : "Carte" }]} disabled={disabled} /></Field>
          <Field label={text.account}><NativeSelect name="tender2Account" items={accountChoices(tenderAccounts)} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Amount" : "Montant"}><Input name="tender2Amount" type="number" min="0" step="0.01" defaultValue="0" disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Reference" : "Référence"}><Input name="tender2Reference" maxLength={160} disabled={disabled} /></Field>
        </ProfessionalFormSection>
        <Button type="submit" className="w-fit" disabled={disabled || !catalogItems.length || !warehouses.length || !tenderAccounts.length}><ShoppingCart className="h-4 w-4" />{locale === "en" ? "Complete receipt" : "Encaisser le ticket"}</Button>
      </form>
    </ModuleSection> : null}

    {moduleCode === "MOBILE_MONEY_AGENCY" ? <ModuleSection title={locale === "en" ? "New Mobile Money transaction" : "Nouvelle opération Mobile Money"} description={locale === "en" ? "Principal, customer fee and provider commission are tracked separately." : "Le principal, les frais client et la commission opérateur sont suivis séparément."}>
      <form onSubmit={onCreateMobileMoney} className="grid gap-5">
        <ProfessionalFormSection title={locale === "en" ? "Operation" : "Opération"}>
          <Field label={locale === "en" ? "Provider" : "Opérateur"}><NativeSelect name="providerCode" required items={providerChoices} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Type" : "Type"}><NativeSelect name="transactionType" defaultValue="DEPOSIT" required items={[{ id: "DEPOSIT", label: locale === "en" ? "Deposit" : "Dépôt" }, { id: "WITHDRAWAL", label: locale === "en" ? "Withdrawal" : "Retrait" }]} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Customer phone" : "Téléphone client"}><Input name="customerPhone" required maxLength={40} inputMode="tel" disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Principal" : "Montant principal"}><Input name="principalAmount" type="number" min="0.01" step="0.01" required disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Customer fee" : "Frais client"}><Input name="customerFeeAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Provider commission" : "Commission opérateur"}><Input name="providerCommissionAmount" type="number" min="0" step="0.01" defaultValue="0" disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Fee collection" : "Encaissement des frais"}><NativeSelect name="feeCollectionMode" defaultValue="NONE" items={[{ id: "NONE", label: locale === "en" ? "None" : "Aucun" }, { id: "CASH", label: "Cash" }, { id: "PROVIDER", label: locale === "en" ? "Provider wallet" : "Wallet opérateur" }]} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "External reference" : "Référence opérateur"}><Input name="externalReference" maxLength={160} disabled={disabled} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={locale === "en" ? "Cash and float" : "Cash et float"}>
          <Field label={locale === "en" ? "Cash account" : "Compte caisse"}><NativeSelect name="cashAccountId" required items={accountChoices(cashAccounts)} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Float account (provider default if empty)" : "Compte float (défaut opérateur si vide)"}><NativeSelect name="floatAccountId" items={accountChoices(mobileAccounts)} disabled={disabled} /></Field>
          <Field label={text.currency}><Input name="currencyCode" defaultValue={currencyDefault} maxLength={3} required disabled={disabled} /></Field>
        </ProfessionalFormSection>
        <Button type="submit" className="w-fit" disabled={disabled || !providers.length || !cashAccounts.length}><Smartphone className="h-4 w-4" />{locale === "en" ? "Confirm transaction" : "Confirmer l’opération"}</Button>
      </form>
    </ModuleSection> : null}

    {moduleCode === "TELCO_TOPUPS" ? <ModuleSection title={locale === "en" ? "New airtime / bundle sale" : "Nouvelle recharge / forfait"} description={locale === "en" ? "A successful top-up credits the tender account and debits provider float by operator cost." : "Une recharge réussie crédite l’encaissement et débite le float opérateur du coût fournisseur."}>
      <form onSubmit={onCreateTopup} className="grid gap-5">
        <ProfessionalFormSection title={locale === "en" ? "Offer" : "Offre Télécom"}>
          <Field label={locale === "en" ? "Provider" : "Opérateur"}><NativeSelect name="providerCode" required items={providerChoices} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Destination phone" : "Numéro destinataire"}><Input name="destinationPhone" required maxLength={40} inputMode="tel" disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Catalog offer (optional)" : "Offre catalogue (facultatif)"}><NativeSelect name="catalogItemId" items={catalogChoices} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Offer label" : "Libellé du forfait"}><Input name="offerLabel" required maxLength={200} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Sale price" : "Prix de vente"}><Input name="saleAmount" type="number" min="0.01" step="0.01" required disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Operator cost" : "Coût opérateur"}><Input name="operatorCost" type="number" min="0" step="0.01" required disabled={disabled} /></Field>
          <Field label={text.currency}><Input name="currencyCode" defaultValue={currencyDefault} maxLength={3} required disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Provider reference" : "Référence opérateur"}><Input name="externalReference" maxLength={160} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Execution status" : "Statut d’exécution"}><NativeSelect name="status" defaultValue="SUCCESS" items={[{ id: "SUCCESS", label: locale === "en" ? "Success" : "Réussie" }, { id: "FAILED", label: locale === "en" ? "Failed" : "Échouée" }]} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Failure reason" : "Motif d’échec"}><Input name="failureReason" maxLength={500} disabled={disabled} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={locale === "en" ? "Settlement" : "Règlement"}>
          <Field label={locale === "en" ? "Tender account" : "Compte d’encaissement"}><NativeSelect name="tenderFinancialAccountId" required items={accountChoices(tenderAccounts)} disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Provider float (default if empty)" : "Float opérateur (défaut si vide)"}><NativeSelect name="operatorFloatAccountId" items={accountChoices(floatAccounts)} disabled={disabled} /></Field>
        </ProfessionalFormSection>
        <Button type="submit" className="w-fit" disabled={disabled || !providers.length || !tenderAccounts.length}><RadioTower className="h-4 w-4" />{locale === "en" ? "Record top-up" : "Enregistrer la recharge"}</Button>
      </form>
    </ModuleSection> : null}

    {moduleCode === "RETAIL_DAILY_CLOSE" ? <ModuleSection title={locale === "en" ? "Daily cash & float close" : "Clôture journalière cash & float"} description={locale === "en" ? "Select every account you want to close. Cash needs denomination details such as 50000x2,20000x3." : "Cochez chaque compte à clôturer. Pour le cash, détaillez les coupures comme 50000x2,20000x3."}>
      <form onSubmit={onCreateClose} className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={locale === "en" ? "Business date" : "Date d’exploitation"}><Input name="businessDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required disabled={disabled} /></Field>
          <Field label={locale === "en" ? "Notes" : "Notes"}><Input name="notes" maxLength={2000} disabled={disabled} /></Field>
        </div>
        <div className="grid gap-3">
          {accounts.filter((account) => ["CASH", "MOBILE_MONEY", "CLEARING"].includes(account.accountType)).map((account) => <div key={account.id} className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)] md:items-end">
            <label className="flex min-h-11 items-center gap-2 text-sm font-black text-dtsc-ink"><input type="checkbox" name={`include-${account.id}`} disabled={disabled} />{account.name}</label>
            <Field label={`${locale === "en" ? "Declared" : "Déclaré"} · ${account.currencyCode}`}><Input name={`declared-${account.id}`} type="number" min="0" step="0.01" defaultValue={String(account.operationalBalance)} disabled={disabled} /></Field>
            {account.accountType === "CASH" ? <Field label={locale === "en" ? "Denominations" : "Coupures"}><Input name={`denominations-${account.id}`} placeholder="50000x2,20000x3" disabled={disabled} /></Field> : <div className="text-xs text-dtsc-muted">{locale === "en" ? "System balance" : "Solde système"}: {moneyValue(account.operationalBalance, account.currencyCode)}</div>}
            <Field label={locale === "en" ? "Variance reason" : "Motif d’écart"}><Input name={`reason-${account.id}`} maxLength={1000} disabled={disabled} /></Field>
          </div>)}
        </div>
        <Button type="submit" className="w-fit" disabled={disabled || !accounts.length}><ClipboardCheck className="h-4 w-4" />{locale === "en" ? "Submit close" : "Soumettre la clôture"}</Button>
      </form>
    </ModuleSection> : null}
  </div>;
}

function HistoryPanel({ moduleCode, locale, dashboard, canManage, onReverse, onCloseDecision }: { moduleCode: RetailModuleCode; locale: "fr" | "en"; dashboard: Dashboard; canManage: boolean; onReverse: (kind: "sale" | "mobile" | "topup", id: string, revision: number) => void; onCloseDecision: (close: DailyClose, decision: "APPROVE" | "REJECT") => void }) {
  if (moduleCode === "RETAIL_POS") {
    const items = dashboard.recent.sales || [];
    return <ModuleSection title={locale === "en" ? "Recent receipts" : "Tickets récents"} description={locale === "en" ? "Completed and reversed counter receipts." : "Tickets comptoir terminés et annulés."}>{items.length ? <BusinessList ariaLabel="Retail POS receipts">{items.map((item) => <BusinessListItem key={item.id} title={`${item.number} · ${moneyValue(item.grandTotal, item.currencyCode)}`} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={formatEnterpriseDate(item.soldAt, locale)} description={item.lines.map((line) => `${line.description} × ${Number(line.quantity)}`).join(" · ")} actions={canManage && item.status === "COMPLETED" ? <Button variant="outline" size="sm" onClick={() => onReverse("sale", item.id, item.revision)}><RotateCcw className="h-4 w-4" />{locale === "en" ? "Reverse" : "Annuler"}</Button> : undefined} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No receipt" : "Aucun ticket"} description={COPY[locale].noData} />}</ModuleSection>;
  }
  if (moduleCode === "MOBILE_MONEY_AGENCY") {
    const items = dashboard.recent.mobileMoney || [];
    return <ModuleSection title={locale === "en" ? "Mobile Money history" : "Historique Mobile Money"}>{items.length ? <BusinessList ariaLabel="Mobile Money transactions">{items.map((item) => <BusinessListItem key={item.id} title={`${item.number} · ${item.providerCode}`} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={`${item.transactionType} · ${moneyValue(item.principalAmount, item.currencyCode)} · ${formatEnterpriseDate(item.occurredAt, locale)}`} description={`${item.customerPhoneMasked || item.customerPhone || "—"}${item.externalReference ? ` · ${item.externalReference}` : ""}`} actions={canManage && item.status === "CONFIRMED" ? <Button variant="outline" size="sm" onClick={() => onReverse("mobile", item.id, item.revision)}><RotateCcw className="h-4 w-4" />{locale === "en" ? "Reverse" : "Annuler"}</Button> : undefined} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No transaction" : "Aucune opération"} description={COPY[locale].noData} />}</ModuleSection>;
  }
  if (moduleCode === "TELCO_TOPUPS") {
    const items = dashboard.recent.topups || [];
    return <ModuleSection title={locale === "en" ? "Top-up history" : "Historique Télécom"}>{items.length ? <BusinessList ariaLabel="Telco topups">{items.map((item) => <BusinessListItem key={item.id} title={`${item.number} · ${item.providerCode}`} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={`${item.offerLabel} · ${moneyValue(item.saleAmount, item.currencyCode)} · ${formatEnterpriseDate(item.occurredAt, locale)}`} description={`${item.destinationPhoneMasked || item.destinationPhone || "—"} · ${locale === "en" ? "Margin" : "Marge"} ${moneyValue(item.marginAmount, item.currencyCode)}`} actions={canManage && item.status === "SUCCESS" ? <Button variant="outline" size="sm" onClick={() => onReverse("topup", item.id, item.revision)}><RotateCcw className="h-4 w-4" />{locale === "en" ? "Reverse" : "Annuler"}</Button> : undefined} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No top-up" : "Aucune recharge"} description={COPY[locale].noData} />}</ModuleSection>;
  }
  const items = dashboard.recent.closes || [];
  return <ModuleSection title={locale === "en" ? "Daily close history" : "Historique des clôtures"}>{items.length ? <BusinessList ariaLabel="Retail daily closes">{items.map((item) => <BusinessListItem key={item.id} title={item.number} status={<StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>} meta={`${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { dateStyle: "medium" }).format(new Date(item.businessDate))} · ${item.lines.length} ${locale === "en" ? "accounts" : "comptes"}`} description={item.lines.map((line) => `${line.accountType}: ${moneyValue(line.declaredBalance, line.currencyCode)} (${Number(line.differenceAmount) === 0 ? "OK" : `${Number(line.differenceAmount) > 0 ? "+" : ""}${moneyValue(line.differenceAmount, line.currencyCode)}`})`).join(" · ")} actions={canManage && item.status === "SUBMITTED" ? <div className="flex gap-2"><Button size="sm" onClick={() => onCloseDecision(item, "APPROVE")}><CheckCircle2 className="h-4 w-4" />{locale === "en" ? "Approve" : "Valider"}</Button><Button variant="outline" size="sm" onClick={() => onCloseDecision(item, "REJECT")}><XCircle className="h-4 w-4" />{locale === "en" ? "Reject" : "Refuser"}</Button></div> : undefined} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No close" : "Aucune clôture"} description={COPY[locale].noData} />}</ModuleSection>;
}

function ProviderPanel({ locale, text, moduleCode, providers, floatAccounts, canManage, onSave }: { locale: "fr" | "en"; text: typeof COPY.fr | typeof COPY.en; moduleCode: RetailModuleCode; providers: Provider[]; floatAccounts: Account[]; canManage: boolean; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="grid gap-5">
    {canManage ? <ModuleSection title={text.providerSetup} description={locale === "en" ? "Provider codes are organization data. Link separate floats instead of hard-coding operators in business logic." : "Les codes opérateurs sont des données de l’entreprise. Associez des floats distincts au lieu de coder les opérateurs dans la logique métier."}>
      <form onSubmit={onSave} className="grid gap-4 md:grid-cols-2">
        <Field label={text.providerCode}><Input name="providerCode" required maxLength={40} /></Field>
        <Field label={text.providerLabel}><Input name="label" required maxLength={120} /></Field>
        <Field label={text.providerType}><NativeSelect name="providerType" defaultValue={moduleCode === "TELCO_TOPUPS" ? "TELCO" : "MOBILE_MONEY"} required items={[{ id: "MOBILE_MONEY", label: "Mobile Money" }, { id: "TELCO", label: "Telco" }, { id: "BOTH", label: locale === "en" ? "Both" : "Les deux" }]} /></Field>
        <Field label={text.mobileFloat}><NativeSelect name="mobileMoneyFloatAccountId" items={floatAccounts.filter((item) => item.accountType === "MOBILE_MONEY").map((item) => ({ id: item.id, label: `${item.name} · ${item.currencyCode}` }))} /></Field>
        <Field label={text.telcoFloat}><NativeSelect name="telcoFloatAccountId" items={floatAccounts.map((item) => ({ id: item.id, label: `${item.name} · ${item.currencyCode}` }))} /></Field>
        <div className="flex items-end"><Button type="submit"><Settings2 className="h-4 w-4" />{text.saveProvider}</Button></div>
      </form>
    </ModuleSection> : null}
    <ModuleSection title={locale === "en" ? "Configured providers" : "Opérateurs configurés"}>{providers.length ? <BusinessList ariaLabel="Retail providers">{providers.map((provider) => <BusinessListItem key={provider.id} title={`${provider.label} · ${provider.providerCode}`} status={<StatusBadge tone={provider.isActive ? "success" : "neutral"}>{provider.isActive ? (locale === "en" ? "Active" : "Actif") : (locale === "en" ? "Inactive" : "Inactif")}</StatusBadge>} meta={provider.providerType} description={`${text.mobileFloat}: ${provider.mobileMoneyFloatAccountId || "—"} · ${text.telcoFloat}: ${provider.telcoFloatAccountId || "—"}`} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No provider configured" : "Aucun opérateur configuré"} description={locale === "en" ? "A manager must configure a provider and its float account before the first transaction." : "Un responsable doit configurer l’opérateur et son compte de float avant la première opération."} />}</ModuleSection>
  </div>;
}

function ReportsPanel({ locale, text, dashboard }: { locale: "fr" | "en"; text: typeof COPY.fr | typeof COPY.en; dashboard: Dashboard }) {
  return <div className="grid gap-5">
    <ModuleSection title={locale === "en" ? "Period summary" : "Synthèse de période"} description={`${formatEnterpriseDate(dashboard.range.from, locale)} → ${formatEnterpriseDate(dashboard.range.to, locale)}`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(dashboard.metrics).map(([key, value]) => <div key={key} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{key.replace(/([A-Z])/g, " $1")}</p><p className="mt-2 break-words text-xl font-black text-dtsc-ink">{String(value)}</p></div>)}</div>
    </ModuleSection>
    <ModuleSection title={text.accountBalances} description={locale === "en" ? "Operational balances used by POS, Mobile Money and telco settlement." : "Soldes opérationnels utilisés par le POS, Mobile Money et le règlement Télécom."}>
      {dashboard.accounts.length ? <BusinessList ariaLabel="Retail financial accounts">{dashboard.accounts.map((account) => <BusinessListItem key={account.id} title={`${account.code} · ${account.name}`} status={<StatusBadge tone="info">{account.accountType}</StatusBadge>} meta={moneyValue(account.operationalBalance, account.currencyCode)} description={account.siteId ? `${locale === "en" ? "Site" : "Site"}: ${account.siteId}` : undefined} />)}</BusinessList> : <EmptyState compact title={locale === "en" ? "No financial account" : "Aucun compte financier"} description={locale === "en" ? "Configure treasury accounts before using settlement flows." : "Configurez les comptes de trésorerie avant d’utiliser les flux d’encaissement."} />}
    </ModuleSection>
    <div className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted sm:grid-cols-3"><div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" />POS → stock + treasury</div><div className="flex items-center gap-2"><WalletCards className="h-4 w-4" />Mobile Money → cash + float</div><div className="flex items-center gap-2"><PackageCheck className="h-4 w-4" />Close → count + variance + validation</div></div>
  </div>;
}
