"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftRight, BarChart3, Clock3, FileText, History, Settings2 } from "lucide-react";
import { Field, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { Button } from "@/components/ui/button";
import { MetricCard, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { notifyToast } from "@/lib/client-toast";
import { customerFacingError, customerFacingStatusLabel } from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { retailMutationOutcomeMessage } from "@/lib/enterprise/retail/mutation-outcome";
import { translateRetailWorkspace } from "@/lib/i18n";

export type RetailOperationalModuleCode = "RETAIL_POS" | "RETAIL_DAILY_CLOSE" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS";
export type RetailTab = "OPERATE" | "HISTORY" | "REPORTS" | "CONFIG";

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
  accountingStatus?: "POSTED" | "PENDING" | "NOT_APPLICABLE";
  accountingBlockerCode?: string | null;
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
  currencyCode: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string | number;
  closingTotal: string | number | null;
  expectedTotal: string | number | null;
  varianceAmount: string | number | null;
  revision: number;
  financialAccount: FinancialAccount;
};

export type DailyClose = {
  id: string;
  closeDate: string;
  status: string;
  currencyCode: string;
  totalSales: string | number;
  totalMobileMoney: string | number;
  totalTelco: string | number;
  grossMargin: string | number;
  submittedAt: string | null;
  reviewedAt: string | null;
  revision: number;
};

export type RetailDashboard = {
  configuration: {
    countryCode: string | null;
    currencyCode: string | null;
    timezone: string | null;
    defaultSiteId: string | null;
    defaultWarehouseId: string | null;
    defaultCashAccountId: string | null;
    requireApproval: boolean;
    profileCode: string | null;
  } | null;
  accounts: FinancialAccount[];
  cashSession: CashSession | null;
  cashSessions?: CashSession[];
  providers: RetailProvider[];
  catalogItems: CatalogItem[];
  warehouses: Warehouse[];
  inventoryItems?: Array<{
    id: string;
    itemCode: string;
    name: string;
    quantityOnHand?: string | number;
    quantityAvailable?: string | number;
  }>;
  readiness: Record<string, boolean>;
  access: { canWrite: boolean; canManage: boolean };
  range: { from: string; to: string };
  metricsByCurrency: {
    sales: Array<{ currencyCode: string; amount: string | number }>;
    mobileMoney: Array<{ currencyCode: string; principal: string | number; fees: string | number; commissions: string | number }>;
    telco: Array<{ currencyCode: string; sales: string | number; cost: string | number; margin: string | number }>;
  };
  recent: {
    sales: Sale[];
    mobileMoney: MobileMoneyOperation[];
    topups: TelcoTopup[];
    closes: DailyClose[];
  };
};

export type RetailMutationResponse = {
  ok?: boolean;
  outcome?: "SUCCESS" | "PENDING" | "FAILURE";
  messageCode?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

export type RetailMutation = (
  action: string,
  endpoint: string,
  payload: Record<string, unknown>,
  success: string,
  options?: { idempotent?: boolean },
) => Promise<RetailMutationResponse | null>;

export function moneyValue(value: string | number | null | undefined, currencyCode: string | null | undefined, locale: "fr" | "en" = "fr") {
  const number = Number(value || 0);
  return `${Number.isFinite(number) ? number.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 }) : "0"} ${currencyCode || ""}`.trim();
}

export function normalizePhonePreview(value: string) {
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  return phone;
}

export function statusTone(status: string) {
  if (["COMPLETED", "CONFIRMED", "SUCCESS", "APPROVED", "CLOSED", "OPEN", "CAPTURED", "RECONCILED", "POSTED"].includes(status)) return "success" as const;
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
      const body = await response.json().catch(() => null) as RetailMutationResponse | null;
      const localizedOutcomeMessage = retailMutationOutcomeMessage(
        typeof body?.messageCode === "string" ? body.messageCode : null,
        locale,
      );
      const responseMessage = localizedOutcomeMessage || body?.message || body?.error || "";
      const failed = !response.ok || body?.ok === false || body?.outcome === "FAILURE";
      if (failed) throw new Error(responseMessage || "RETAIL_ACTION_FAILED");

      const pending = response.status === 202 || body?.outcome === "PENDING";
      if (pending) {
        const pendingMessage = responseMessage || translateRetailWorkspace(locale, "processing");
        setMessage(pendingMessage);
        notifyToast(pendingMessage, "warning");
        setRefreshKey((value) => value + 1);
        // Keep the stable idempotency key and return null so the form remains
        // available for a safe retry without replaying already durable effects.
        return null;
      }

      delete mutationKeys.current[action];
      setMessage(success);
      notifyToast(success, "success");
      setRefreshKey((value) => value + 1);
      return body || {};
    } catch (caught) {
      const errorMessage = customerFacingError(caught, locale, {
        fr: translateRetailWorkspace("fr", "retailActionError"),
        en: translateRetailWorkspace("en", "retailActionError"),
      });
      setMessage(errorMessage);
      notifyToast(errorMessage, "error");
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
    period,
    setPeriod,
    busyAction,
    mutate,
    setRefreshKey,
  };
}

export function RetailWorkspaceFrame({
  organizationId,
  organizationName,
  definition,
  moduleCode,
  locale,
  includeConfigurationTab,
  children,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  moduleCode: RetailOperationalModuleCode;
  locale: "fr" | "en";
  includeConfigurationTab?: boolean;
  children: (context: ReturnType<typeof useRetailOperationalWorkspace>) => ReactNode;
}) {
  const context = useRetailOperationalWorkspace({ organizationId, moduleCode, locale });
  const labels = {
    operate: translateRetailWorkspace(locale, "operatorOperate"),
    history: translateRetailWorkspace(locale, "operatorHistory"),
    reports: translateRetailWorkspace(locale, "operatorReports"),
    configuration: translateRetailWorkspace(locale, "operatorConfiguration"),
    today: translateRetailWorkspace(locale, "operatorToday"),
    sevenDays: translateRetailWorkspace(locale, "operatorSevenDays"),
    thirtyDays: translateRetailWorkspace(locale, "operatorThirtyDays"),
    loading: translateRetailWorkspace(locale, "operatorLoadingWorkspace"),
    empty: translateRetailWorkspace(locale, "operatorNoDataAvailable"),
  };
  const tabs = [
    { id: "OPERATE" as const, label: labels.operate, icon: ArrowLeftRight },
    { id: "HISTORY" as const, label: labels.history, icon: History },
    ...(includeConfigurationTab ? [{ id: "CONFIG" as const, label: labels.configuration, icon: Settings2 }] : []),
    { id: "REPORTS" as const, label: labels.reports, icon: BarChart3 },
  ];

  return (
    <ModuleWorkspace
      title={definition.label}
      description={definition.description}
      icon={definition.icon}
      backHref={`/dashboard?organizationId=${organizationId}`}
      backLabel={translateRetailWorkspace(locale, "operatorBackToModules")}
      contextLabel={organizationName}
    >
      <div className="grid min-w-0 gap-5">
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max gap-2" role="tablist" aria-label={definition.label}>
              {tabs.map((item) => {
                const Icon = item.icon;
                const active = context.tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={(event) => {
                      context.setTab(item.id);
                      event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                    }}
                    className={`min-h-11 rounded-full border px-4 py-2 text-sm font-black transition ${active ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:text-dtsc-ink"}`}
                  >
                    <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["TODAY", "7D", "30D"] as const).map((value) => (
              <Button key={value} variant={context.period === value ? "default" : "outline"} size="sm" onClick={() => context.setPeriod(value)}>
                <Clock3 className="h-4 w-4" />{value === "TODAY" ? labels.today : value === "7D" ? labels.sevenDays : labels.thirtyDays}
              </Button>
            ))}
          </div>
          <p className="mt-4 border-t border-dtsc-border pt-4 text-sm font-semibold text-dtsc-muted">
            {translateRetailWorkspace(locale, "retailSharedErpNote")}
          </p>
        </div>

        {context.message ? <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-sm font-bold text-dtsc-ink">{context.message}</div> : null}
        {context.error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 font-bold text-rose-700 dark:text-rose-200">{context.error}</div> : null}
        {context.loading ? <div className="rounded-xl border border-dtsc-border bg-dtsc-surface p-5 text-sm font-semibold text-dtsc-muted">{labels.loading}</div> : null}
        {!context.loading && !context.dashboard ? <div className="rounded-xl border border-dtsc-border bg-dtsc-surface p-5 text-sm font-semibold text-dtsc-muted">{labels.empty}</div> : null}
        {!context.loading && context.dashboard ? children(context) : null}
      </div>
    </ModuleWorkspace>
  );
}

export function RetailMetrics({ dashboard, locale }: { dashboard: RetailDashboard; locale: "fr" | "en" }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label={translateRetailWorkspace(locale, "retailCashSession")} value={dashboard.cashSession ? customerFacingStatusLabel(dashboard.cashSession.status, locale) : "—"} />
      <MetricCard label={translateRetailWorkspace(locale, "retailSales")} value={dashboard.metricsByCurrency.sales.map((item) => moneyValue(item.amount, item.currencyCode, locale)).join(" · ") || "—"} />
      <MetricCard label={translateRetailWorkspace(locale, "retailMobileMoney")} value={dashboard.metricsByCurrency.mobileMoney.map((item) => moneyValue(item.principal, item.currencyCode, locale)).join(" · ") || "—"} />
      <MetricCard label={translateRetailWorkspace(locale, "retailTelco")} value={dashboard.metricsByCurrency.telco.map((item) => moneyValue(item.sales, item.currencyCode, locale)).join(" · ") || "—"} />
    </div>
  );
}

export function RetailReportsPanel({ dashboard, moduleCode, locale }: { dashboard: RetailDashboard; moduleCode: RetailOperationalModuleCode; locale: "fr" | "en" }) {
  const rows = moduleCode === "RETAIL_POS"
    ? dashboard.metricsByCurrency.sales.map((item) => ({ key: item.currencyCode, primary: item.currencyCode, secondary: moneyValue(item.amount, item.currencyCode, locale) }))
    : moduleCode === "MOBILE_MONEY_AGENCY"
      ? dashboard.metricsByCurrency.mobileMoney.map((item) => ({ key: item.currencyCode, primary: item.currencyCode, secondary: `${translateRetailWorkspace(locale, "operatorPrincipal")}: ${moneyValue(item.principal, item.currencyCode, locale)} · ${translateRetailWorkspace(locale, "operatorFees")}: ${moneyValue(item.fees, item.currencyCode, locale)} · ${translateRetailWorkspace(locale, "operatorCommission")}: ${moneyValue(item.commissions, item.currencyCode, locale)}` }))
      : moduleCode === "TELCO_TOPUPS"
        ? dashboard.metricsByCurrency.telco.map((item) => ({ key: item.currencyCode, primary: item.currencyCode, secondary: `${translateRetailWorkspace(locale, "retailSales")}: ${moneyValue(item.sales, item.currencyCode, locale)} · ${translateRetailWorkspace(locale, "operatorMargin")}: ${moneyValue(item.margin, item.currencyCode, locale)}` }))
        : [];
  return (
    <ModuleSection title={translateRetailWorkspace(locale, "operatorReports")} description={translateRetailWorkspace(locale, "operatorReportsByCurrencyDescription")}>
      <div className="grid gap-3">
        {rows.length ? rows.map((row) => <div key={row.key} className="rounded-xl border border-dtsc-border bg-dtsc-page p-4"><p className="font-black text-dtsc-ink">{row.primary}</p><p className="text-sm font-semibold text-dtsc-muted">{row.secondary}</p></div>) : <p className="text-sm font-semibold text-dtsc-muted">{translateRetailWorkspace(locale, "operatorNoAggregates")}</p>}
      </div>
    </ModuleSection>
  );
}

export function RetailErpLinks({ moduleCode, locale }: { moduleCode: RetailOperationalModuleCode; locale: "fr" | "en" }) {
  const links = moduleCode === "RETAIL_POS"
    ? [
        ["/enterprise-modules/SALES", translateRetailWorkspace(locale, "operatorInvoicesAndCustomers")],
        ["/enterprise-modules/INVENTORY", translateRetailWorkspace(locale, "operatorInventory")],
        ["/enterprise-modules/FINANCE_ACCOUNTING", translateRetailWorkspace(locale, "operatorAccounting")],
      ]
    : [
        ["/enterprise-modules/FINANCE_TREASURY", translateRetailWorkspace(locale, "operatorTreasury")],
        ["/enterprise-modules/FINANCE_ACCOUNTING", translateRetailWorkspace(locale, "operatorAccounting")],
      ];
  return (
    <ModuleSection title={translateRetailWorkspace(locale, "operatorContinueInErp")}>
      <div className="flex flex-wrap gap-2">
        {links.map(([href, label]) => <Button asChild variant="outline" key={href}><Link href={href}><FileText className="h-4 w-4" />{label}</Link></Button>)}
      </div>
    </ModuleSection>
  );
}
