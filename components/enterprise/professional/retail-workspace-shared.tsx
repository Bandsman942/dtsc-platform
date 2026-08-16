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
import { translateRetailWorkspace, type RetailWorkspaceKey } from "@/lib/i18n";
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

function retailText(locale: "fr" | "en", key: RetailWorkspaceKey) {
  return translateRetailWorkspace(locale, key);
}

export function moneyValue(value: string | number | null | undefined, currency: string | undefined, locale: "fr" | "en") {
  const amount = Number(value || 0);
  const localeCode = ({ fr: "fr-FR", en: "en-US" } as const)[locale];
  const formatted = Number.isFinite(amount) ? amount.toLocaleString(localeCode, { maximumFractionDigits: 2 }) : "0";
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
        fr: translateRetailWorkspace("fr", "retailLoadError"),
        en: translateRetailWorkspace("en", "retailLoadError"),
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
        fr: translateRetailWorkspace("fr", "retailActionError"),
        en: translateRetailWorkspace("en", "retailActionError"),
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
    { id: "OPERATE" as const, label: retailText(locale, "operate") },
    { id: "HISTORY" as const, label: retailText(locale, "history") },
    ...(includeConfigurationTab ? [{ id: "CONFIG" as const, label: retailText(locale, "configuration") }] : []),
    { id: "REPORTS" as const, label: retailText(locale, "reports") },
  ], [includeConfigurationTab, locale]);

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${retailText(locale, "shopOperations")} · ${organizationName}`}
        title={locale === "en" ? definition.labelEn : definition.labelFr}
        description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}
        primaryAction={(
          <div data-responsive-actions>
            <Button variant="outline" onClick={() => setGuideOpen(true)}>{retailText(locale, "userGuide")}</Button>
            <Button variant="outline" disabled={Boolean(context.busyAction)} onClick={() => context.setRefreshKey((value) => value + 1)}>
              <RefreshCw className="h-4 w-4" />{retailText(locale, "refresh")}
            </Button>
          </div>
        )}
      />
      <ContextualUserGuide guide={guide} open={guideOpen} onOpenChange={setGuideOpen} hideTrigger />
      {context.dashboard ? <ShopReadiness readiness={context.dashboard.readiness} locale={locale} /> : null}
      {context.dashboard && moduleCode === "RETAIL_POS" ? <CashSessionBar session={context.dashboard.cashSession} locale={locale} /> : null}
      {context.dashboard ? <RetailMetrics moduleCode={moduleCode} dashboard={context.dashboard} locale={locale} /> : null}
      <ModuleToolbar
        controls={(
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <ProfessionalTabs value={context.tab} onChange={context.setTab} items={tabs} label={retailText(locale, "shopModuleNavigation")} />
            <div className="flex min-w-0 gap-2 overflow-x-auto [touch-action:pan-x]">
              <Button size="sm" variant={context.period === "TODAY" ? "default" : "outline"} onClick={() => context.setPeriod("TODAY")}>{retailText(locale, "today")}</Button>
              <Button size="sm" variant={context.period === "7D" ? "default" : "outline"} onClick={() => context.setPeriod("7D")}>{retailText(locale, "sevenDays")}</Button>
              <Button size="sm" variant={context.period === "30D" ? "default" : "outline"} onClick={() => context.setPeriod("30D")}>{retailText(locale, "thirtyDays")}</Button>
            </div>
          </div>
        )}
        summary={retailText(locale, "sharedErpSummary")}
      />
      <ModuleContent>
        {context.message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold text-dtsc-ink">{context.message}</div> : null}
        {context.error ? <ProfessionalError message={context.error} /> : context.loading ? <ProfessionalLoading rows={4} /> : !context.dashboard ? (
          <EmptyState title={retailText(locale, "shopUnavailable")} description={retailText(locale, "refreshToRetry")} />
        ) : children(context)}
      </ModuleContent>
    </ModuleWorkspace>
  );
}

export function ShopReadiness({ readiness, locale }: { readiness: ShopReadinessData; locale: "fr" | "en" }) {
  return (
    <ModuleSection
      title={retailText(locale, "shopSetup")}
      description={retailText(locale, "shopSetupDescription")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <div>
          <p className="text-2xl font-black text-dtsc-ink">{readiness.completed}/{readiness.total}</p>
          <p className="text-sm font-semibold text-dtsc-muted">{retailText(locale, "setupChecksCompleted")}</p>
        </div>
        <StatusBadge tone={readiness.completed === readiness.total ? "success" : "warning"}>
          {readiness.completed === readiness.total ? retailText(locale, "ready") : retailText(locale, "setupRequired")}
        </StatusBadge>
      </div>
      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {readiness.items.map((item) => (
          <Link key={item.code} href={item.deepLink} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-3 text-sm font-bold text-dtsc-ink">
            <span className="min-w-0 break-words">{item.label}</span>
            <StatusBadge tone={item.complete ? "success" : "warning"}>{item.complete ? "OK" : retailText(locale, "toDo")}</StatusBadge>
          </Link>
        ))}
      </div>
    </ModuleSection>
  );
}

export function CashSessionBar({ session, locale }: { session: CashSession | null; locale: "fr" | "en" }) {
  if (!session) {
    return <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-800 dark:text-amber-200">{retailText(locale, "noActiveTill")}</div>;
  }
  const pending = session.status !== "OPEN";
  return (
    <div className={`rounded-2xl border px-4 py-3 ${pending ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-black text-dtsc-ink">{session.financialAccount.name} · {session.financialAccount.currencyCode}</p>
          <p className="mt-1 text-xs font-semibold text-dtsc-muted">{retailText(locale, "openingFloat")}: {moneyValue(session.openingAmount, session.financialAccount.currencyCode, locale)} · {retailText(locale, "currentBalance")}: {moneyValue(session.financialAccount.operationalBalance, session.financialAccount.currencyCode, locale)}</p>
        </div>
        <StatusBadge tone={pending ? "warning" : "success"}>{customerFacingStatusLabel(session.status, locale)}</StatusBadge>
      </div>
    </div>
  );
}

export function RetailMetrics({ moduleCode, dashboard, locale }: { moduleCode: RetailOperationalModuleCode; dashboard: RetailDashboard; locale: "fr" | "en" }) {
  const nodes = moduleCode === "RETAIL_POS"
    ? (dashboard.metricsByCurrency.sales || []).flatMap((row) => [
        <ModuleMetric key={`${row.currencyCode}-count`} label={`${retailText(locale, "receipts")} · ${row.currencyCode}`} value={row.count} />,
        <ModuleMetric key={`${row.currencyCode}-sales`} label={`${retailText(locale, "sales")} · ${row.currencyCode}`} value={moneyValue(row.amount, row.currencyCode, locale)} />,
      ])
    : moduleCode === "MOBILE_MONEY_AGENCY"
      ? (dashboard.metricsByCurrency.mobileMoney || []).flatMap((row) => [
          <ModuleMetric key={`${row.currencyCode}-dep`} label={`${retailText(locale, "deposits")} · ${row.currencyCode}`} value={moneyValue(row.deposits, row.currencyCode, locale)} />,
          <ModuleMetric key={`${row.currencyCode}-wd`} label={`${retailText(locale, "withdrawals")} · ${row.currencyCode}`} value={moneyValue(row.withdrawals, row.currencyCode, locale)} />,
          <ModuleMetric key={`${row.currencyCode}-com`} label={`${retailText(locale, "commission")} · ${row.currencyCode}`} value={moneyValue(row.commission, row.currencyCode, locale)} />,
        ])
      : (dashboard.metricsByCurrency.telco || []).flatMap((row) => [
          <ModuleMetric key={`${row.currencyCode}-rev`} label={`${retailText(locale, "topupSales")} · ${row.currencyCode}`} value={moneyValue(row.revenue, row.currencyCode, locale)} />,
          <ModuleMetric key={`${row.currencyCode}-margin`} label={`${retailText(locale, "margin")} · ${row.currencyCode}`} value={moneyValue(row.margin, row.currencyCode, locale)} />,
        ]);
  return <ModuleMetrics label={retailText(locale, "shopIndicatorsByCurrency")}>{nodes.length ? nodes : <ModuleMetric label={retailText(locale, "activity")} value="—" />}</ModuleMetrics>;
}

export function OpenCashForm({ organizationId, dashboard, locale, busyAction, mutate }: { organizationId: string; dashboard: RetailDashboard; locale: "fr" | "en"; busyAction: string | null; mutate: RetailMutation }) {
  if (dashboard.cashSession) return null;
  const cashAccounts = dashboard.accounts.filter((account) => account.accountType === "CASH");
  return (
    <ModuleSection title={retailText(locale, "openMyTill")} description={retailText(locale, "openMyTillDescription")}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await mutate(
            "open-cash",
            `/api/enterprise/${organizationId}/retail/cash-sessions`,
            { financialAccountId: String(form.get("financialAccountId") || ""), openingAmount: String(form.get("openingAmount") || "0") },
            retailText(locale, "tillOpened"),
            { idempotent: false },
          );
        }}
        className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)_auto] sm:items-end"
      >
        <Field label={retailText(locale, "till")}>
          <Select name="financialAccountId" required disabled={Boolean(busyAction)}>
            <option value="">—</option>
            {cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}
          </Select>
        </Field>
        <Field label={retailText(locale, "openingFloat")}><Input name="openingAmount" type="number" min="0" step="0.01" required disabled={Boolean(busyAction)} /></Field>
        <Button disabled={Boolean(busyAction) || !cashAccounts.length}><Banknote className="h-4 w-4" />{retailText(locale, "open")}</Button>
      </form>
    </ModuleSection>
  );
}

export function RetailErpLinks({ moduleCode, locale }: { moduleCode: RetailOperationalModuleCode; locale: "fr" | "en" }) {
  const links = moduleCode === "RETAIL_POS"
    ? [
        ["/enterprise-modules/CRM_CUSTOMERS", retailText(locale, "customers")],
        ["/enterprise-modules/CATALOG", retailText(locale, "catalog")],
        ["/enterprise-modules/INVENTORY_LOGISTICS", retailText(locale, "inventory")],
        ["/enterprise-modules/SALES_QUOTES_ORDERS", retailText(locale, "salesOrders")],
        ["/enterprise-modules/FINANCE_CASH", retailText(locale, "cash")],
        ["/enterprise-modules/REPORTS", retailText(locale, "reports")],
      ]
    : [
        ["/enterprise-modules/FINANCE_CASH", retailText(locale, "cash")],
        ["/enterprise-modules/FINANCE_TREASURY", retailText(locale, "treasury")],
        ["/enterprise-modules/REPORTS", retailText(locale, "reports")],
      ];
  return (
    <details className="rounded-2xl border border-dtsc-border bg-dtsc-surface">
      <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
        {retailText(locale, "continueInErp")}
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
    for (const row of dashboard.metricsByCurrency.sales || []) rows.push({ label: retailText(locale, "sales"), currency: row.currencyCode, value: moneyValue(row.amount, row.currencyCode, locale), secondary: `${row.count} ${retailText(locale, "receipts").toLowerCase()}` });
  }
  if (moduleCode === "MOBILE_MONEY_AGENCY") {
    for (const row of dashboard.metricsByCurrency.mobileMoney || []) {
      rows.push({ label: retailText(locale, "deposits"), currency: row.currencyCode, value: moneyValue(row.deposits, row.currencyCode, locale) });
      rows.push({ label: retailText(locale, "withdrawals"), currency: row.currencyCode, value: moneyValue(row.withdrawals, row.currencyCode, locale) });
      rows.push({ label: retailText(locale, "commission"), currency: row.currencyCode, value: moneyValue(row.commission, row.currencyCode, locale) });
    }
  }
  if (moduleCode === "TELCO_TOPUPS") {
    for (const row of dashboard.metricsByCurrency.telco || []) {
      rows.push({ label: retailText(locale, "topupSales"), currency: row.currencyCode, value: moneyValue(row.revenue, row.currencyCode, locale), secondary: `${row.count} ${retailText(locale, "operations")}` });
      rows.push({ label: retailText(locale, "margin"), currency: row.currencyCode, value: moneyValue(row.margin, row.currencyCode, locale) });
    }
  }
  return (
    <div className="grid min-w-0 gap-5">
      <ModuleSection title={retailText(locale, "periodSummaryByCurrency")} description={`${formatEnterpriseDate(dashboard.range.from, locale)} → ${formatEnterpriseDate(dashboard.range.to, locale)}`}>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, index) => (
            <div key={`${row.label}-${row.currency}-${index}`} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{row.label} · {row.currency}</p>
              <p className="mt-2 break-words text-xl font-black text-dtsc-ink">{row.value}</p>
              {row.secondary ? <p className="mt-1 text-xs font-bold text-dtsc-muted">{row.secondary}</p> : null}
            </div>
          ))}
          {!rows.length ? <EmptyState compact title={retailText(locale, "noMetric")} description={retailText(locale, "noMetricDescription")} /> : null}
        </div>
      </ModuleSection>
      <ModuleSection title={retailText(locale, "operationalBalances")} description={retailText(locale, "operationalBalancesDescription")}>
        <BusinessList ariaLabel={retailText(locale, "shopAccountBalances")}>
          {dashboard.accounts.map((account) => (
            <BusinessListItem
              key={account.id}
              title={`${account.code} · ${account.name}`}
              status={<StatusBadge tone="info">{customerFacingFinancialAccountType(account.accountType, locale)}</StatusBadge>}
              meta={moneyValue(account.operationalBalance, account.currencyCode, locale)}
            />
          ))}
        </BusinessList>
      </ModuleSection>
      <RetailErpLinks moduleCode={moduleCode} locale={locale} />
    </div>
  );
}
