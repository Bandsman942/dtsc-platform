"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, RefreshCw } from "lucide-react";
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
import {
  customerFacingError,
  customerFacingFinancialAccountType,
  customerFacingStatusLabel,
} from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { getRetailUserGuide } from "@/lib/user-guides/retail-telco-mobile-money-guides";

export type RetailOperationalModuleCode = "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS";
export type RetailTab = "OPERATE" | "HISTORY" | "CONFIG" | "REPORTS";

export type FinancialAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  operationalBalance: string | number;
  siteId: string | null;
};

export type RetailProvider = {
  id: string;
  providerCode: string;
  label: string;
  providerType: "MOBILE_MONEY" | "TELCO" | string;
  mobileMoneyFloatAccountId: string | null;
  telcoFloatAccountId: string | null;
  isActive: boolean;
};

export type CatalogItem = {
  id: string;
  code: string;
  sku: string | null;
  name: string;
  itemType: string;
  indicativeSalePrice: string | number | null;
  indicativeCost: string | number | null;
  currency: string | null;
  trackInventory: boolean;
  inventoryItemId?: string | null;
  allowNegativeStock?: boolean;
  availableQuantity?: string | number | null;
};

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  site: { id: string; name: string };
  storageLocations: Array<{ id: string; code: string; name: string }>;
};

export type Sale = {
  id: string;
  number: string;
  status: string;
  revision: number;
  currencyCode: string;
  grandTotal: string | number;
  soldAt: string;
  lines: Array<{
    id: string;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    discountAmount: string | number;
    taxAmount: string | number;
    lineTotal: string | number;
  }>;
  tenders: Array<{ id: string; methodType: string; amount: string | number }>;
};

export type MobileMoneyOperation = {
  id: string;
  number: string;
  providerCode: string;
  transactionType: string;
  customerPhoneMasked?: string;
  currencyCode: string;
  principalAmount: string | number;
  customerFeeAmount: string | number;
  providerCommissionAmount: string | number;
  externalReference: string | null;
  status: string;
  occurredAt: string;
  revision: number;
};

export type TelcoTopup = {
  id: string;
  number: string;
  providerCode: string;
  destinationPhoneMasked?: string;
  offerLabel: string;
  currencyCode: string;
  saleAmount: string | number;
  operatorCost: string | number;
  marginAmount: string | number;
  externalReference: string | null;
  status: string;
  occurredAt: string;
  revision: number;
};

export type CashSession = {
  id: string;
  number: string;
  status: string;
  openingAmount: string | number;
  openedAt: string;
  financialAccountId: string;
  financialAccount: {
    id: string;
    code: string;
    name: string;
    currencyCode: string;
    operationalBalance: string | number;
  };
  _count: { movements: number; counts: number; discrepancies: number };
};

export type ShopReadinessData = {
  items: Array<{ code: string; label: string; complete: boolean; deepLink: string }>;
  completed: number;
  total: number;
  readyForFirstSale: boolean;
  readyForMobileMoney: boolean;
  readyForTelco: boolean;
};

export type RetailDashboard = {
  configuration: { profileCode: string; baseCurrencyCode: string; status: string } | null;
  access: { canWrite: boolean; canManage: boolean };
  accounts: FinancialAccount[];
  providers?: RetailProvider[];
  warehouses?: Warehouse[];
  catalogItems?: CatalogItem[];
  cashSession: CashSession | null;
  readiness: ShopReadinessData;
  metricsByCurrency: {
    sales?: Array<{ currencyCode: string; count: number; amount: string }>;
    mobileMoney?: Array<{ currencyCode: string; count: number; deposits: string; withdrawals: string; commission: string }>;
    telco?: Array<{ currencyCode: string; count: number; revenue: string; margin: string }>;
  };
  recent: {
    sales?: Sale[];
    mobileMoney?: MobileMoneyOperation[];
    topups?: TelcoTopup[];
  };
  range: { from: string; to: string };
};

export type RetailMutation = (
  action: string,
  endpoint: string,
  payload: Record<string, unknown>,
  success: string,
  options?: { idempotent?: boolean },
) => Promise<Record<string, unknown> | null>;

export function moneyValue(value: string | number | null | undefined, currency?: string) {
  const amount = Number(value || 0);
  const locale = typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en") ? "en-US" : "fr-FR";
  const formatted = Number.isFinite(amount) ? amount.toLocaleString(locale, { maximumFractionDigits: 2 }) : "0";
  return currency ? `${formatted} ${currency}` : formatted;
}

export function normalizePhonePreview(value: string) {
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  return phone;
}

export function statusTone(status: string) {
  if (["COMPLETED", "CONFIRMED", "SUCCESS", "APPROVED", "CLOSED", "OPEN", "CAPTURED", "RECONCILED"].includes(status)) return "success" as const;
  if (["SUBMITTED", "PENDING_VALIDATION", "CLOSING", "PENDING", "PENDING_PROVIDER", "UNKNOWN"].includes(status)) return "warning" as const;
  if (["REVERSED", "FAILED", "REJECTED", "VOIDED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

export function Select({
  name,
  value,
  defaultValue,
  required,
  disabled,
  onChange,
  children,
}: {
  name: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      required={required}
      disabled={disabled}
      onChange={(event) => onChange?.(event.target.value)}
      className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"
    >
      {children}
    </select>
  );
}

export function providerLabel(dashboard: RetailDashboard, providerCode: string | null | undefined) {
  if (!providerCode) return "—";
  return dashboard.providers?.find((provider) => provider.providerCode === providerCode)?.label || "—";
}

export function useRetailOperationalWorkspace({
  organizationId,
  moduleCode,
  locale,
}: {
  organizationId: string;
  moduleCode: RetailOperationalModuleCode;
  locale: "fr" | "en";
}) {
  const [tab, setTab] = useState<RetailTab>("OPERATE");
  const [dashboard, setDashboard] = useState<RetailDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [period, setPeriod] = useState<"TODAY" | "7D" | "30D">("TODAY");
  const mutationKeys = useRef<Record<string, string>>({});

  const rangeQuery = useMemo(() => {
    const to = new Date();
    const from = new Date();
    if (period === "TODAY") from.setHours(0, 0, 0, 0);
    else from.setDate(from.getDate() - (period === "7D" ? 7 : 30));
    return `&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/enterprise/${organizationId}/retail/dashboard?moduleCode=${encodeURIComponent(moduleCode)}${rangeQuery}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null) as (RetailDashboard & { message?: string; error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || "RETAIL_WORKSPACE_LOAD_FAILED");
      setDashboard(body);
    } catch (caught) {
      setError(customerFacingError(caught, locale, {
        fr: "Les informations du Shop ne sont pas disponibles pour le moment. Actualisez puis réessayez.",
        en: "Shop information is not available right now. Refresh and try again.",
      }));
    } finally {
      setLoading(false);
    }
  }, [locale, moduleCode, organizationId, rangeQuery]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  function stableKey(action: string) {
    if (!mutationKeys.current[action]) mutationKeys.current[action] = crypto.randomUUID();
    return mutationKeys.current[action];
  }

  const mutate: RetailMutation = useCallback(async (action, endpoint, payload, success, options) => {
    if (busyAction) return null;
    setBusyAction(action);
    setMessage("");
    try {
      const bodyPayload = options?.idempotent === false ? payload : { ...payload, idempotencyKey: stableKey(action) };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      const body = await response.json().catch(() => null) as ({ message?: string; error?: string } & Record<string, unknown>) | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_ACTION_FAILED");
      delete mutationKeys.current[action];
      setMessage(success);
      setRefreshKey((value) => value + 1);
      return body || {};
    } catch (caught) {
      setMessage(customerFacingError(caught, locale, {
        fr: "Cette action n’a pas pu être terminée. Vérifiez les informations puis réessayez.",
        en: "This action could not be completed. Check the information and try again.",
      }));
      return null;
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, locale]);

  return {
    tab,
    setTab,
    dashboard,
    loading,
    error,
    message,
    busyAction,
    period,
    setPeriod,
    setRefreshKey,
    mutate,
  };
}

export function RetailWorkspaceFrame({
  organizationId,
  organizationName,
  definition,
  moduleCode,
  locale,
  children,
  includeConfigurationTab = false,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  moduleCode: RetailOperationalModuleCode;
  locale: "fr" | "en";
  children: (context: ReturnType<typeof useRetailOperationalWorkspace>) => React.ReactNode;
  includeConfigurationTab?: boolean;
}) {
  const context = useRetailOperationalWorkspace({ organizationId, moduleCode, locale });
  const [guideOpen, setGuideOpen] = useState(false);
  const guide = useMemo(() => getRetailUserGuide(moduleCode, locale), [locale, moduleCode]);
  const tabs = useMemo(() => [
    { id: "OPERATE" as const, label: locale === "en" ? "Operate" : "Opérer" },
    { id: "HISTORY" as const, label: locale === "en" ? "History" : "Historique" },
    ...(includeConfigurationTab ? [{ id: "CONFIG" as const, label: locale === "en" ? "Configuration" : "Configuration" }] : []),
    { id: "REPORTS" as const, label: locale === "en" ? "Reports" : "Rapports" },
  ], [includeConfigurationTab, locale]);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${locale === "en" ? "Shop operations" : "Opérations Shop"} · ${organizationName}`}
        title={locale === "en" ? definition.labelEn : definition.labelFr}
        description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
        primaryAction={(
          <div data-responsive-actions>
            <Button variant="outline" onClick={() => setGuideOpen(true)}>{locale === "en" ? "User guide" : "Guide utilisateur"}</Button>
            <Button variant="outline" disabled={Boolean(context.busyAction)} onClick={() => context.setRefreshKey((value) => value + 1)}>
              <RefreshCw className="h-4 w-4" />{locale === "en" ? "Refresh" : "Actualiser"}
            </Button>
          </div>
        )}
      />
      <ContextualUserGuide guide={guide} open={guideOpen} onOpenChange={setGuideOpen} hideTrigger />
      {context.dashboard ? <ShopReadiness readiness={context.dashboard.readiness} locale={locale} /> : null}
      {context.dashboard && moduleCode !== "MOBILE_MONEY_AGENCY" ? <CashSessionBar session={context.dashboard.cashSession} locale={locale} /> : null}
      {context.dashboard ? <RetailMetrics moduleCode={moduleCode} dashboard={context.dashboard} locale={locale} /> : null}
      <ModuleToolbar
        controls={(
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <ProfessionalTabs value={context.tab} onChange={context.setTab} items={tabs} label={locale === "en" ? "Shop module navigation" : "Navigation du module Shop"} />
            <div className="flex min-w-0 gap-2 overflow-x-auto [touch-action:pan-x]">
              <Button size="sm" variant={context.period === "TODAY" ? "default" : "outline"} onClick={() => context.setPeriod("TODAY")}>{locale === "en" ? "Today" : "Aujourd’hui"}</Button>
              <Button size="sm" variant={context.period === "7D" ? "default" : "outline"} onClick={() => context.setPeriod("7D")}>7 j</Button>
              <Button size="sm" variant={context.period === "30D" ? "default" : "outline"} onClick={() => context.setPeriod("30D")}>30 j</Button>
            </div>
          </div>
        )}
        summary={locale === "en"
          ? "The Shop uses the same customers, catalog, stock and financial accounts as the rest of your ERP."
          : "Le Shop utilise les mêmes clients, catalogue, stocks et comptes financiers que le reste de votre ERP."}
      />
      <ModuleContent>
        {context.message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold text-dtsc-ink">{context.message}</div> : null}
        {context.error ? <ProfessionalError message={context.error} /> : context.loading ? <ProfessionalLoading rows={4} /> : !context.dashboard ? (
          <EmptyState title={locale === "en" ? "Shop unavailable" : "Shop indisponible"} description={locale === "en" ? "Refresh this page to try again." : "Actualisez cette page pour réessayer."} />
        ) : children(context)}
      </ModuleContent>
    </ModuleWorkspace>
  );
}

export function ShopReadiness({ readiness, locale }: { readiness: ShopReadinessData; locale: "fr" | "en" }) {
  return (
    <ModuleSection
      title={locale === "en" ? "Shop setup" : "Mise en service du Shop"}
      description={locale === "en" ? "See what still needs to be configured before the first real operation." : "Voyez ce qu’il reste à configurer avant la première opération réelle."}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <div>
          <p className="text-2xl font-black text-dtsc-ink">{readiness.completed}/{readiness.total}</p>
          <p className="text-sm font-semibold text-dtsc-muted">{locale === "en" ? "setup checks completed" : "contrôles de configuration terminés"}</p>
        </div>
        <StatusBadge tone={readiness.completed === readiness.total ? "success" : "warning"}>
          {readiness.completed === readiness.total ? (locale === "en" ? "Ready" : "Prêt") : (locale === "en" ? "Setup required" : "Configuration requise")}
        </StatusBadge>
      </div>
      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {readiness.items.map((item) => (
          <Link key={item.code} href={item.deepLink} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-3 text-sm font-bold text-dtsc-ink">
            <span className="min-w-0 break-words">{item.label}</span>
            <StatusBadge tone={item.complete ? "success" : "warning"}>{item.complete ? "OK" : (locale === "en" ? "To do" : "À faire")}</StatusBadge>
          </Link>
        ))}
      </div>
    </ModuleSection>
  );
}

export function CashSessionBar({ session, locale }: { session: CashSession | null; locale: "fr" | "en" }) {
  if (!session) {
    return <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-800 dark:text-amber-200">{locale === "en" ? "No active till. Open a till before accepting cash." : "Aucune caisse active. Ouvrez une caisse avant d’accepter des espèces."}</div>;
  }
  const pending = session.status !== "OPEN";
  return (
    <div className={`rounded-2xl border px-4 py-3 ${pending ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-black text-dtsc-ink">{session.financialAccount.name} · {session.financialAccount.currencyCode}</p>
          <p className="mt-1 text-xs font-semibold text-dtsc-muted">{locale === "en" ? "Opening float" : "Fonds d’ouverture"}: {moneyValue(session.openingAmount, session.financialAccount.currencyCode)} · {locale === "en" ? "current balance" : "solde actuel"}: {moneyValue(session.financialAccount.operationalBalance, session.financialAccount.currencyCode)}</p>
        </div>
        <StatusBadge tone={pending ? "warning" : "success"}>{customerFacingStatusLabel(session.status, locale)}</StatusBadge>
      </div>
    </div>
  );
}

export function RetailMetrics({ moduleCode, dashboard, locale }: { moduleCode: RetailOperationalModuleCode; dashboard: RetailDashboard; locale: "fr" | "en" }) {
  const nodes = moduleCode === "RETAIL_POS"
    ? (dashboard.metricsByCurrency.sales || []).flatMap((row) => [
        <ModuleMetric key={`${row.currencyCode}-count`} label={`${locale === "en" ? "Receipts" : "Tickets"} · ${row.currencyCode}`} value={row.count} />,
        <ModuleMetric key={`${row.currencyCode}-sales`} label={`${locale === "en" ? "Sales" : "Ventes"} · ${row.currencyCode}`} value={moneyValue(row.amount, row.currencyCode)} />,
      ])
    : moduleCode === "MOBILE_MONEY_AGENCY"
      ? (dashboard.metricsByCurrency.mobileMoney || []).flatMap((row) => [
          <ModuleMetric key={`${row.currencyCode}-dep`} label={`${locale === "en" ? "Deposits" : "Dépôts"} · ${row.currencyCode}`} value={moneyValue(row.deposits, row.currencyCode)} />,
          <ModuleMetric key={`${row.currencyCode}-wd`} label={`${locale === "en" ? "Withdrawals" : "Retraits"} · ${row.currencyCode}`} value={moneyValue(row.withdrawals, row.currencyCode)} />,
          <ModuleMetric key={`${row.currencyCode}-com`} label={`Commission · ${row.currencyCode}`} value={moneyValue(row.commission, row.currencyCode)} />,
        ])
      : (dashboard.metricsByCurrency.telco || []).flatMap((row) => [
          <ModuleMetric key={`${row.currencyCode}-rev`} label={`${locale === "en" ? "Top-up sales" : "Ventes Télécom"} · ${row.currencyCode}`} value={moneyValue(row.revenue, row.currencyCode)} />,
          <ModuleMetric key={`${row.currencyCode}-margin`} label={`${locale === "en" ? "Margin" : "Marge"} · ${row.currencyCode}`} value={moneyValue(row.margin, row.currencyCode)} />,
        ]);
  return <ModuleMetrics label={locale === "en" ? "Shop indicators by currency" : "Indicateurs Shop par devise"}>{nodes.length ? nodes : <ModuleMetric label={locale === "en" ? "Activity" : "Activité"} value="—" />}</ModuleMetrics>;
}

export function OpenCashForm({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  if (dashboard.cashSession) return null;
  const cashAccounts = dashboard.accounts.filter((account) => account.accountType === "CASH");
  return (
    <ModuleSection title={locale === "en" ? "Open my till" : "Ouvrir ma caisse"} description={locale === "en" ? "Choose the till and count the opening float." : "Choisissez la caisse et comptez le fonds d’ouverture."}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await mutate(
            "open-cash",
            `/api/enterprise/${organizationId}/retail/cash-sessions`,
            { financialAccountId: String(form.get("financialAccountId") || ""), openingAmount: String(form.get("openingAmount") || "0") },
            locale === "en" ? "Till opened." : "Caisse ouverte.",
            { idempotent: false },
          );
        }}
        className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)_auto] sm:items-end"
      >
        <Field label={locale === "en" ? "Till" : "Caisse"}>
          <Select name="financialAccountId" required disabled={Boolean(busyAction)}>
            <option value="">—</option>
            {cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}
          </Select>
        </Field>
        <Field label={locale === "en" ? "Opening float" : "Fonds d’ouverture"}><Input name="openingAmount" type="number" min="0" step="0.01" required disabled={Boolean(busyAction)} /></Field>
        <Button disabled={Boolean(busyAction) || !cashAccounts.length}><Banknote className="h-4 w-4" />{locale === "en" ? "Open" : "Ouvrir"}</Button>
      </form>
    </ModuleSection>
  );
}

export function RetailErpLinks({ moduleCode, locale }: { moduleCode: RetailOperationalModuleCode; locale: "fr" | "en" }) {
  const links = moduleCode === "RETAIL_POS"
    ? [
        ["/enterprise-modules/CRM_CUSTOMERS", locale === "en" ? "Customers" : "Clients"],
        ["/enterprise-modules/CATALOG", locale === "en" ? "Catalog" : "Catalogue"],
        ["/enterprise-modules/INVENTORY_LOGISTICS", locale === "en" ? "Inventory" : "Stocks"],
        ["/enterprise-modules/SALES_QUOTES_ORDERS", locale === "en" ? "Sales orders" : "Commandes clients"],
        ["/enterprise-modules/FINANCE_CASH", locale === "en" ? "Cash" : "Caisse"],
        ["/enterprise-modules/REPORTS", locale === "en" ? "Reports" : "Rapports"],
      ]
    : [
        ["/enterprise-modules/FINANCE_CASH", locale === "en" ? "Cash" : "Caisse"],
        ["/enterprise-modules/FINANCE_TREASURY", locale === "en" ? "Treasury" : "Trésorerie"],
        ["/enterprise-modules/REPORTS", locale === "en" ? "Reports" : "Rapports"],
      ];
  return (
    <details className="rounded-2xl border border-dtsc-border bg-dtsc-surface">
      <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
        {locale === "en" ? "Continue in the ERP" : "Continuer dans l’ERP"}
      </summary>
      <div className="flex min-w-0 gap-2 overflow-x-auto border-t border-dtsc-border p-3 [touch-action:pan-x]">
        {links.map(([href, label]) => <Button key={href} asChild size="sm" variant="outline"><Link href={href}>{label}</Link></Button>)}
      </div>
    </details>
  );
}

export function RetailReportsPanel({ dashboard, moduleCode, locale }: { dashboard: RetailDashboard; moduleCode: RetailOperationalModuleCode; locale: "fr" | "en" }) {
  const rows: Array<{ label: string; currency: string; value: string; secondary?: string }> = [];
  if (moduleCode === "RETAIL_POS") {
    for (const row of dashboard.metricsByCurrency.sales || []) rows.push({ label: locale === "en" ? "Sales" : "Ventes", currency: row.currencyCode, value: moneyValue(row.amount, row.currencyCode), secondary: `${row.count} ${locale === "en" ? "receipts" : "tickets"}` });
  }
  if (moduleCode === "MOBILE_MONEY_AGENCY") {
    for (const row of dashboard.metricsByCurrency.mobileMoney || []) {
      rows.push({ label: locale === "en" ? "Deposits" : "Dépôts", currency: row.currencyCode, value: moneyValue(row.deposits, row.currencyCode) });
      rows.push({ label: locale === "en" ? "Withdrawals" : "Retraits", currency: row.currencyCode, value: moneyValue(row.withdrawals, row.currencyCode) });
      rows.push({ label: "Commission", currency: row.currencyCode, value: moneyValue(row.commission, row.currencyCode) });
    }
  }
  if (moduleCode === "TELCO_TOPUPS") {
    for (const row of dashboard.metricsByCurrency.telco || []) {
      rows.push({ label: locale === "en" ? "Top-up sales" : "Ventes Télécom", currency: row.currencyCode, value: moneyValue(row.revenue, row.currencyCode), secondary: `${row.count} ${locale === "en" ? "operations" : "opérations"}` });
      rows.push({ label: locale === "en" ? "Margin" : "Marge", currency: row.currencyCode, value: moneyValue(row.margin, row.currencyCode) });
    }
  }
  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={locale === "en" ? "Period summary by currency" : "Synthèse de période par devise"} description={`${formatEnterpriseDate(dashboard.range.from, locale)} → ${formatEnterpriseDate(dashboard.range.to, locale)}`}>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, index) => (
            <div key={`${row.label}-${row.currency}-${index}`} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{row.label} · {row.currency}</p>
              <p className="mt-2 break-words text-xl font-black text-dtsc-ink">{row.value}</p>
              {row.secondary ? <p className="mt-1 text-xs font-bold text-dtsc-muted">{row.secondary}</p> : null}
            </div>
          ))}
          {!rows.length ? <EmptyState compact title={locale === "en" ? "No metric" : "Aucun indicateur"} description={locale === "en" ? "No operation in the selected period." : "Aucune opération sur la période sélectionnée."} /> : null}
        </div>
      </ModuleSection>
      <ModuleSection title={locale === "en" ? "Operational balances" : "Soldes opérationnels"} description={locale === "en" ? "Balances from different currencies are kept separate." : "Les soldes de devises différentes restent séparés."}>
        <BusinessList ariaLabel={locale === "en" ? "Shop account balances" : "Soldes des comptes Shop"}>
          {dashboard.accounts.map((account) => (
            <BusinessListItem
              key={account.id}
              title={`${account.code} · ${account.name}`}
              status={<StatusBadge tone="info">{customerFacingFinancialAccountType(account.accountType, locale)}</StatusBadge>}
              meta={moneyValue(account.operationalBalance, account.currencyCode)}
            />
          ))}
        </BusinessList>
      </ModuleSection>
      <RetailErpLinks moduleCode={moduleCode} locale={locale} />
    </div>
  );
}
