import { getRetailAccountingReadiness } from "@/lib/enterprise/retail/accounting-readiness";
import { getRetailMetricsByCurrency } from "@/lib/enterprise/retail/commercial-guardrails";
import { getRetailExchangeRateReadiness } from "@/lib/enterprise/retail/fx-reporting";
import { getCanonicalRetailReadiness } from "@/lib/enterprise/retail/self-service-onboarding";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { prisma } from "@/lib/prisma";

function phoneForList(value: string) {
  if (value.length <= 7) return value;
  return `${value.slice(0, 4)}••••${value.slice(-3)}`;
}

const READINESS_LABELS: Record<string, string> = {
  COUNTRY_PACK: "Configuration pays active",
  FUNCTIONAL_CURRENCY: "Devise principale configurée",
  SITE: "Point de vente configuré",
  WAREHOUSE: "Dépôt de stock configuré",
  CASH_ACCOUNT: "Compte de caisse configuré",
  CATALOG: "Catalogue de vente renseigné",
  INVENTORY_LINKS: "Disponibilité du stock reliée au catalogue",
  TEAM: "Équipe autorisée",
  ACCOUNTING: "Suivi comptable des ventes prêt",
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
    cashSession,
    metricsByCurrency,
    fxReadiness,
    accountingReadiness,
    canonicalReadiness,
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
    prisma.enterpriseCashSession.findFirst({ where: { organizationId, cashierUserId: userId, status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] } }, orderBy: { openedAt: "desc" }, include: { financialAccount: { select: { id: true, code: true, name: true, currencyCode: true, operationalBalance: true } }, _count: { select: { movements: true, counts: true, discrepancies: true } } } }),
    getRetailMetricsByCurrency(organizationId, dateFrom, dateTo, moduleCode),
    getRetailExchangeRateReadiness(organizationId, dateTo),
    includePos ? getRetailAccountingReadiness(organizationId, dateTo) : Promise.resolve(null),
    getCanonicalRetailReadiness(organizationId),
  ]);

  const mobileWallets = providers.filter((provider) => provider.providerType === "MOBILE_MONEY");
  const telcoNetworks = providers.filter((provider) => provider.providerType === "TELCO");
  const readinessItems = canonicalReadiness.items.map((item) => ({
    code: item.code,
    label: READINESS_LABELS[item.code] || "Configuration du Shop",
    complete: item.complete,
    deepLink: item.code === "RETAIL_CONFIGURATION" ? "/enterprise-modules/RETAIL_POS/commercial" : item.deepLink,
  }));

  return {
    configuration,
    providers,
    accounts,
    warehouses,
    catalogItems,
    inventoryItems,
    cashSession,
    metricsByCurrency,
    fxReadiness,
    accountingReadiness,
    readiness: {
      items: readinessItems,
      completed: canonicalReadiness.completed,
      total: canonicalReadiness.total,
      readyForFirstSale: canonicalReadiness.ready,
      readyForMobileMoney: canonicalReadiness.ready && mobileWallets.some((provider) => Boolean(provider.mobileMoneyFloatAccountId)),
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
