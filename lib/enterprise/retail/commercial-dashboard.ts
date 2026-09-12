import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import {
  getRetailDashboardOrganizationProjection,
  getRetailDashboardPeriodProjection,
  getRetailDashboardUserProjection,
  type RetailDashboardReadSource,
} from "@/lib/enterprise/retail/commercial-dashboard-projections";

function phoneForList(value: string) {
  if (value.length <= 7) return value;
  return `${value.slice(0, 4)}••••${value.slice(-3)}`;
}

const ACCOUNTING_READINESS_DESCRIPTOR = {
  code: "ACCOUNTING" as const,
  label: "Suivi comptable des ventes prêt",
};

const FX_REPORTING_READINESS_DESCRIPTOR = {
  code: "FX" as const,
  label: "Consolidation multi-devise",
  deepLink: "/enterprise-modules/RETAIL_POS/consolidated-report",
};

const READINESS_LABELS: Record<string, string> = {
  COUNTRY_PACK: "Configuration pays active",
  FUNCTIONAL_CURRENCY: "Devise principale configurée",
  SITE: "Point de vente configuré",
  WAREHOUSE: "Dépôt de stock configuré",
  CASH_ACCOUNT: "Compte de caisse configuré",
  CATALOG: "Catalogue de vente renseigné",
  INVENTORY_LINKS: "Disponibilité du stock reliée au catalogue",
  TEAM: "Équipe autorisée",
  [ACCOUNTING_READINESS_DESCRIPTOR.code]: ACCOUNTING_READINESS_DESCRIPTOR.label,
  RETAIL_CONFIGURATION: "Paramètres du Shop actifs",
};

type RetailDashboardCacheSources = {
  organization: RetailDashboardReadSource;
  period: RetailDashboardReadSource;
  user: "BYPASS";
};

export async function getCommercialRetailDashboardRead(
  organizationId: string,
  userId: string,
  from?: Date,
  to?: Date,
  moduleCode: RetailModuleCode = "RETAIL_POS",
) {
  const dateFrom = from || new Date(new Date().setHours(0, 0, 0, 0));
  const dateTo = to || new Date();
  const cacheDefaultRange = !from && !to;

  const [organizationRead, periodRead, userProjection] = await Promise.all([
    getRetailDashboardOrganizationProjection(organizationId, moduleCode),
    getRetailDashboardPeriodProjection(organizationId, dateFrom, dateTo, moduleCode, cacheDefaultRange),
    getRetailDashboardUserProjection(organizationId, userId),
  ]);

  const organization = organizationRead.value;
  const period = periodRead.value;
  const canonicalReadiness = organization.canonicalReadiness;
  const fxReadiness = period.fxReadiness;
  const mobileMoneyConfiguration = organization.mobileMoneyConfiguration;
  const telcoConfiguration = organization.telcoConfiguration;

  const readinessItems = canonicalReadiness.items.map((item) => ({
    code: item.code,
    label: READINESS_LABELS[item.code] || "Configuration du Shop",
    complete: item.complete,
    deepLink: item.code === "RETAIL_CONFIGURATION" ? "/enterprise-modules/RETAIL_POS/commercial" : item.deepLink,
  }));
  const reportingReadiness = {
    ...FX_REPORTING_READINESS_DESCRIPTOR,
    label: `${FX_REPORTING_READINESS_DESCRIPTOR.label}${fxReadiness.targetCurrencyCode ? ` · ${fxReadiness.targetCurrencyCode}` : ""}`,
    complete: fxReadiness.complete,
  };
  const allMobileMoneyProvidersReady = Boolean(
    mobileMoneyConfiguration?.providers.length
      && mobileMoneyConfiguration.providers.every((provider) => provider.ready),
  );
  const allTelcoProvidersReady = Boolean(
    telcoConfiguration?.providers.length
      && telcoConfiguration.providers.every((provider) => provider.ready),
  );

  const dashboard = {
    configuration: organization.configuration,
    providers: organization.providers,
    accounts: organization.accounts,
    warehouses: organization.warehouses,
    catalogItems: organization.catalogItems,
    inventoryItems: organization.inventoryItems,
    cashSession: userProjection.cashSession,
    cashSessions: userProjection.cashSessions,
    mobileMoneyConfiguration,
    telcoConfiguration,
    metricsByCurrency: period.metricsByCurrency,
    fxReadiness,
    accountingReadiness: period.accountingReadiness,
    reportingReadiness,
    readiness: {
      items: readinessItems,
      completed: canonicalReadiness.completed,
      total: canonicalReadiness.total,
      readyForFirstSale: canonicalReadiness.ready,
      readyForMobileMoney: canonicalReadiness.ready && allMobileMoneyProvidersReady,
      readyForTelco: canonicalReadiness.ready && allTelcoProvidersReady,
    },
    recent: {
      sales: period.sales,
      mobileMoney: period.mobileMoney.map((item) => ({ ...item, customerPhoneMasked: phoneForList(item.customerPhone) })),
      topups: period.topups.map((item) => ({ ...item, destinationPhoneMasked: phoneForList(item.destinationPhone) })),
      closes: period.closes,
    },
    range: period.range,
  };

  const cacheSources: RetailDashboardCacheSources = {
    organization: organizationRead.source,
    period: periodRead.source,
    user: "BYPASS",
  };

  return { dashboard, cacheSources };
}

export async function getCommercialRetailDashboard(
  organizationId: string,
  userId: string,
  from?: Date,
  to?: Date,
  moduleCode: RetailModuleCode = "RETAIL_POS",
) {
  return (await getCommercialRetailDashboardRead(organizationId, userId, from, to, moduleCode)).dashboard;
}
