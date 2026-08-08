import { getRetailMetricsByCurrency } from "@/lib/enterprise/retail/commercial-guardrails";
import { getRetailExchangeRateReadiness } from "@/lib/enterprise/retail/fx-reporting";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { isRetailBusinessProfileCode } from "@/lib/enterprise/retail/profile-contract";
import { prisma } from "@/lib/prisma";

function phoneForList(value: string) {
  if (value.length <= 7) return value;
  return `${value.slice(0, 4)}••••${value.slice(-3)}`;
}

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
  const includeCatalog = includePos || includeTelco;

  const [
    configuration,
    providers,
    accounts,
    warehouseExists,
    catalogExists,
    warehouses,
    catalogItems,
    inventoryItems,
    sales,
    mobileMoney,
    topups,
    closes,
    cashSession,
    metricsByCurrency,
    positionCounts,
    fxReadiness,
  ] = await Promise.all([
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId } }),
    prisma.enterpriseRetailProvider.findMany({ where: { organizationId, isActive: true }, orderBy: [{ providerType: "asc" }, { label: "asc" }] }),
    prisma.enterpriseFinancialAccount.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null, accountType: { in: ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"] } }, orderBy: [{ accountType: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, accountType: true, currencyCode: true, operationalBalance: true, siteId: true } }),
    prisma.enterpriseWarehouse.findFirst({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
    prisma.enterpriseCatalogItem.findFirst({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
    includePos
      ? prisma.enterpriseWarehouse.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, include: { site: { select: { id: true, name: true } }, storageLocations: { where: { status: "ACTIVE", archivedAt: null }, select: { id: true, code: true, name: true } } } })
      : Promise.resolve([]),
    includeCatalog
      ? prisma.enterpriseCatalogItem.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, take: 400, select: { id: true, code: true, sku: true, name: true, itemType: true, indicativeSalePrice: true, indicativeCost: true, currency: true, trackInventory: true } })
      : Promise.resolve([]),
    includePos
      ? prisma.enterpriseInventoryItem.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, catalogItemId: true, balances: { select: { warehouseId: true, storageLocationId: true, stockLotId: true, quantityOnHand: true, quantityReserved: true } } } })
      : Promise.resolve([]),
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
    prisma.enterprisePosition.groupBy({ by: ["positionCode"], where: { organizationId, isActive: true, positionCode: { in: ["STORE_MANAGER", "CASHIER", "MOBILE_MONEY_AGENT", "RETAIL_CONTROLLER"] } }, _count: { _all: true } }),
    getRetailExchangeRateReadiness(organizationId, dateTo),
  ]);

  const mobileWallets = providers.filter((provider) => provider.providerType === "MOBILE_MONEY");
  const telcoNetworks = providers.filter((provider) => provider.providerType === "TELCO");
  const profileReady = configuration?.status === "ACTIVE" && Boolean(configuration.profileCode) && isRetailBusinessProfileCode(configuration.profileCode);
  const readiness = [
    { code: "PROFILE", label: "Profil Shop Retail actif", complete: profileReady, deepLink: "/enterprise-admin?section=templates" },
    { code: "WAREHOUSE", label: "Site et dépôt opérationnels", complete: Boolean(warehouseExists), deepLink: "/enterprise-modules/SITES_WAREHOUSES" },
    { code: "CATALOG", label: "Catalogue de vente renseigné", complete: Boolean(catalogExists), deepLink: "/enterprise-modules/CATALOG" },
    { code: "CASH", label: "Compte de caisse configuré", complete: accounts.some((account) => account.accountType === "CASH"), deepLink: "/enterprise-modules/FINANCE_TREASURY" },
    { code: "FX", label: `Consolidation multi-devise${fxReadiness.targetCurrencyCode ? ` · ${fxReadiness.targetCurrencyCode}` : ""}`, complete: fxReadiness.complete, deepLink: "/enterprise-modules/RETAIL_POS/consolidated-report" },
    { code: "MOBILE_FLOAT", label: "Au moins un wallet Mobile Money relié à son float", complete: mobileWallets.some((provider) => Boolean(provider.mobileMoneyFloatAccountId)), deepLink: "/enterprise-modules/MOBILE_MONEY_AGENCY" },
    { code: "TELCO_FLOAT", label: "Au moins un opérateur Télécom relié à son float", complete: telcoNetworks.some((provider) => Boolean(provider.telcoFloatAccountId)), deepLink: "/enterprise-modules/TELCO_TOPUPS" },
    { code: "CONTROL", label: "Rôles de caisse et contrôle disponibles", complete: ["CASHIER", "RETAIL_CONTROLLER"].every((code) => positionCounts.some((position) => position.positionCode === code && position._count._all > 0)), deepLink: "/enterprise-admin?section=positions" },
  ];

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
    readiness: {
      items: readiness,
      completed: readiness.filter((item) => item.complete).length,
      total: readiness.length,
      readyForFirstSale: readiness.filter((item) => ["PROFILE", "WAREHOUSE", "CATALOG", "CASH"].includes(item.code)).every((item) => item.complete),
      readyForMobileMoney: readiness.filter((item) => ["PROFILE", "CASH", "MOBILE_FLOAT"].includes(item.code)).every((item) => item.complete),
      readyForTelco: readiness.filter((item) => ["PROFILE", "TELCO_FLOAT"].includes(item.code)).every((item) => item.complete),
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