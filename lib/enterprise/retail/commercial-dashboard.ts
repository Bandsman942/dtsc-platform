import { Prisma } from "@prisma/client";
import { getRetailAccountingReadiness } from "@/lib/enterprise/retail/accounting-readiness";
import { getRetailMetricsByCurrency } from "@/lib/enterprise/retail/commercial-guardrails";
import { getRetailExchangeRateReadiness } from "@/lib/enterprise/retail/fx-reporting";
import { getMobileMoneyProviderAccountConfiguration } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";
import { getCanonicalRetailReadiness } from "@/lib/enterprise/retail/self-service-onboarding";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { prisma } from "@/lib/prisma";

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

export async function getCommercialRetailDashboard(
  organizationId: string,
  userId: string,
  from?: Date,
  to?: Date,
  moduleCode?: RetailModuleCode,
) {
  const dateFrom = from || new Date(new Date().setHours(0, 0, 0, 0));
  const dateTo = to || new Date();
  const dateFilter = { gte: dateFrom, lte: dateTo };
  const includePos = !moduleCode || moduleCode === "RETAIL_POS";
  const includeMobileMoney = !moduleCode || moduleCode === "MOBILE_MONEY_AGENCY";
  const includeTelco = !moduleCode || moduleCode === "TELCO_TOPUPS";
  const includeClose = !moduleCode || moduleCode === "RETAIL_DAILY_CLOSE";
  const includeCatalog = includeTelco;

  const [
    configuration,
    providers,
    accounts,
    warehouses,
    catalogItems,
    inventoryItems,
    sales,
    mobileMoney,
    topups,
    closes,
    cashSessionsRaw,
    metricsByCurrency,
    fxReadiness,
    accountingReadiness,
    canonicalReadiness,
    mobileMoneyConfiguration,
  ] = await Promise.all([
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId } }),
    prisma.enterpriseRetailProvider.findMany({ where: { organizationId, isActive: true }, orderBy: [{ providerType: "asc" }, { label: "asc" }] }),
    prisma.enterpriseFinancialAccount.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null, accountType: { in: ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"] } }, orderBy: [{ accountType: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, accountType: true, currencyCode: true, operationalBalance: true, siteId: true } }),
    includePos
      ? prisma.enterpriseWarehouse.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, include: { site: { select: { id: true, name: true } }, storageLocations: { where: { status: "ACTIVE", archivedAt: null }, select: { id: true, code: true, name: true } } } })
      : Promise.resolve([]),
    includeCatalog
      ? prisma.enterpriseCatalogItem.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, take: 400, select: { id: true, code: true, sku: true, name: true, itemType: true, indicativeSalePrice: true, indicativeCost: true, currency: true, trackInventory: true } })
      : Promise.resolve([]),
    Promise.resolve([]),
    includePos
      ? prisma.enterpriseRetailSale.findMany({ where: { organizationId, soldAt: dateFilter }, orderBy: { soldAt: "desc" }, take: 100, include: { lines: true, tenders: true } })
      : Promise.resolve([]),
    includeMobileMoney
      ? prisma.enterpriseMobileMoneyTransaction.findMany({ where: { organizationId, occurredAt: dateFilter }, orderBy: { occurredAt: "desc" }, take: 100 })
      : Promise.resolve([]),
    includeTelco
      ? prisma.enterpriseTelcoTopup.findMany({ where: { organizationId, occurredAt: dateFilter }, orderBy: { occurredAt: "desc" }, take: 100 })
      : Promise.resolve([]),
    includeClose
      ? prisma.enterpriseRetailDailyClose.findMany({ where: { organizationId, businessDate: dateFilter }, orderBy: { businessDate: "desc" }, take: 30, include: { lines: true } })
      : Promise.resolve([]),
    prisma.enterpriseCashSession.findMany({
      where: { organizationId, cashierUserId: userId, status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] } },
      orderBy: { openedAt: "desc" },
      take: 12,
      include: {
        financialAccount: { select: { id: true, code: true, name: true, currencyCode: true, operationalBalance: true } },
        movements: { select: { direction: true, amount: true } },
        _count: { select: { movements: true, counts: true, discrepancies: true } },
      },
    }),
    getRetailMetricsByCurrency(organizationId, dateFrom, dateTo, moduleCode),
    getRetailExchangeRateReadiness(organizationId, dateTo),
    includePos ? getRetailAccountingReadiness(organizationId, dateTo) : Promise.resolve(null),
    getCanonicalRetailReadiness(organizationId),
    includeMobileMoney ? getMobileMoneyProviderAccountConfiguration(organizationId) : Promise.resolve(null),
  ]);

  const cashSessions = cashSessionsRaw.map((session) => {
    const expectedCurrentAmount = session.movements.reduce(
      (balance, movement) => movement.direction === "INBOUND" ? balance.plus(movement.amount) : balance.minus(movement.amount),
      new Prisma.Decimal(session.openingAmount),
    );
    const { movements, ...sessionWithoutMovements } = session;
    void movements;
    return { ...sessionWithoutMovements, expectedCurrentAmount: expectedCurrentAmount.toFixed() };
  });
  const cashSession = cashSessions.find((session) => session.status === "OPEN") || cashSessions[0] || null;

  const telcoNetworks = providers.filter((provider) => provider.providerType === "TELCO");
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

  return {
    configuration,
    providers,
    accounts,
    warehouses,
    catalogItems,
    inventoryItems,
    cashSession,
    cashSessions,
    metricsByCurrency,
    fxReadiness,
    accountingReadiness,
    reportingReadiness,
    readiness: {
      items: readinessItems,
      completed: canonicalReadiness.completed,
      total: canonicalReadiness.total,
      readyForFirstSale: canonicalReadiness.ready,
      readyForMobileMoney: canonicalReadiness.ready && allMobileMoneyProvidersReady,
      readyForTelco: canonicalReadiness.ready && telcoNetworks.some((provider) => Boolean(provider.telcoFloatAccountId)),
    },
    recent: {
      sales,
      mobileMoney: mobileMoney.map((item) => ({ ...item, customerPhoneMasked: phoneForList(item.customerPhone) })),
      topups: topups.map((item) => ({ ...item, destinationPhoneMasked: phoneForList(item.destinationPhone) })),
      closes,
    },
    range: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
  };
}
