import { Prisma } from "@prisma/client";
import { getRetailAccountingReadiness } from "@/lib/enterprise/retail/accounting-readiness";
import { getRetailMetricsByCurrency } from "@/lib/enterprise/retail/commercial-guardrails";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { RETAIL_MODULE_CODES } from "@/lib/enterprise/retail/constants";
import { getRetailExchangeRateReadiness } from "@/lib/enterprise/retail/fx-reporting";
import { getMobileMoneyProviderAccountConfiguration } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";
import { getCanonicalRetailReadiness } from "@/lib/enterprise/retail/self-service-onboarding";
import { getTelcoProviderAccountConfiguration } from "@/lib/enterprise/retail/telco-multicurrency-service";
import { prisma } from "@/lib/prisma";
import {
  invalidateTenantReadCache,
  withTenantReadCache,
  type TenantReadCacheSource,
} from "@/lib/scalability/tenant-read-cache";

const RETAIL_DASHBOARD_ORG_CACHE = {
  schemaVersion: "v1",
  ttlSeconds: 60,
} as const;

const RETAIL_DASHBOARD_PERIOD_CACHE = {
  schemaVersion: "v1",
  ttlSeconds: 15,
} as const;

const RETAIL_ORGANIZATION_INVALIDATION_ENTITY_TYPES = new Set<string>([
  "EnterpriseRetailConfiguration",
  "EnterpriseRetailProvider",
  "EnterpriseFinancialAccount",
  "EnterpriseWarehouse",
  "EnterpriseStorageLocation",
  "EnterpriseCatalogItem",
  "EnterpriseSite",
  "EnterpriseInventoryItem",
  "EnterpriseStockMovement",
]);

const RETAIL_PERIOD_INVALIDATION_ENTITY_TYPES = new Set<string>([
  "EnterpriseRetailSale",
  "EnterpriseRetailSaleReturn",
  "EnterpriseMobileMoneyTransaction",
  "EnterpriseMobileMoneyFxTransfer",
  "EnterpriseTelcoTopup",
  "EnterpriseRetailDailyClose",
  "EnterpriseCashDiscrepancy",
  "EnterpriseJournalEntry",
]);

export type RetailDashboardReadSource = TenantReadCacheSource | "BYPASS";

function organizationProjectionName(moduleCode: RetailModuleCode) {
  return `retail-dashboard-org-${moduleCode.toLowerCase()}`;
}

function periodProjectionName(moduleCode: RetailModuleCode) {
  return `retail-dashboard-period-${moduleCode.toLowerCase()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function loadRetailDashboardOrganizationProjection(organizationId: string, moduleCode: RetailModuleCode) {
  const includePos = moduleCode === "RETAIL_POS";
  const includeMobileMoney = moduleCode === "MOBILE_MONEY_AGENCY";
  const includeTelco = moduleCode === "TELCO_TOPUPS";
  const includeCatalog = includeTelco;

  const [
    configuration,
    providers,
    accounts,
    warehouses,
    catalogItems,
    canonicalReadiness,
    mobileMoneyConfiguration,
    telcoConfiguration,
  ] = await Promise.all([
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId } }),
    prisma.enterpriseRetailProvider.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ providerType: "asc" }, { label: "asc" }],
    }),
    prisma.enterpriseFinancialAccount.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        accountType: { in: ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"] },
      },
      orderBy: [{ accountType: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        accountType: true,
        currencyCode: true,
        operationalBalance: true,
        siteId: true,
      },
    }),
    includePos
      ? prisma.enterpriseWarehouse.findMany({
          where: { organizationId, status: "ACTIVE", archivedAt: null },
          orderBy: { name: "asc" },
          include: {
            site: { select: { id: true, name: true } },
            storageLocations: {
              where: { status: "ACTIVE", archivedAt: null },
              select: { id: true, code: true, name: true },
            },
          },
        })
      : Promise.resolve([]),
    includeCatalog
      ? prisma.enterpriseCatalogItem.findMany({
          where: { organizationId, status: "ACTIVE", archivedAt: null },
          orderBy: { name: "asc" },
          take: 400,
          select: {
            id: true,
            code: true,
            sku: true,
            name: true,
            itemType: true,
            indicativeSalePrice: true,
            indicativeCost: true,
            currency: true,
            trackInventory: true,
          },
        })
      : Promise.resolve([]),
    getCanonicalRetailReadiness(organizationId),
    includeMobileMoney ? getMobileMoneyProviderAccountConfiguration(organizationId) : Promise.resolve(null),
    includeTelco ? getTelcoProviderAccountConfiguration(organizationId) : Promise.resolve(null),
  ]);

  return {
    configuration,
    providers,
    accounts,
    warehouses,
    catalogItems,
    inventoryItems: [] as never[],
    canonicalReadiness,
    mobileMoneyConfiguration,
    telcoConfiguration,
  };
}

export type RetailDashboardOrganizationProjection = Awaited<ReturnType<typeof loadRetailDashboardOrganizationProjection>>;

function isRetailDashboardOrganizationProjection(value: unknown): value is RetailDashboardOrganizationProjection {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.providers)
    && Array.isArray(value.accounts)
    && Array.isArray(value.warehouses)
    && Array.isArray(value.catalogItems)
    && Array.isArray(value.inventoryItems)
    && isRecord(value.canonicalReadiness)
    && (value.configuration === null || isRecord(value.configuration))
    && (value.mobileMoneyConfiguration === null || isRecord(value.mobileMoneyConfiguration))
    && (value.telcoConfiguration === null || isRecord(value.telcoConfiguration))
  );
}

export async function getRetailDashboardOrganizationProjection(
  organizationId: string,
  moduleCode: RetailModuleCode,
) {
  return withTenantReadCache<RetailDashboardOrganizationProjection>({
    projection: organizationProjectionName(moduleCode),
    schemaVersion: RETAIL_DASHBOARD_ORG_CACHE.schemaVersion,
    organizationId,
    ttlSeconds: RETAIL_DASHBOARD_ORG_CACHE.ttlSeconds,
    validate: isRetailDashboardOrganizationProjection,
    load: () => loadRetailDashboardOrganizationProjection(organizationId, moduleCode),
  });
}

async function loadRetailDashboardPeriodProjection(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date,
  moduleCode: RetailModuleCode,
) {
  const dateFilter = { gte: dateFrom, lte: dateTo };
  const includePos = moduleCode === "RETAIL_POS";
  const includeMobileMoney = moduleCode === "MOBILE_MONEY_AGENCY";
  const includeTelco = moduleCode === "TELCO_TOPUPS";
  const includeClose = moduleCode === "RETAIL_DAILY_CLOSE";

  const [
    sales,
    mobileMoney,
    topups,
    closes,
    metricsByCurrency,
    fxReadiness,
    accountingReadiness,
  ] = await Promise.all([
    includePos
      ? prisma.enterpriseRetailSale.findMany({
          where: { organizationId, soldAt: dateFilter },
          orderBy: { soldAt: "desc" },
          take: 100,
          include: { lines: true, tenders: true },
        })
      : Promise.resolve([]),
    includeMobileMoney
      ? prisma.enterpriseMobileMoneyTransaction.findMany({
          where: { organizationId, occurredAt: dateFilter },
          orderBy: { occurredAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
    includeTelco
      ? prisma.enterpriseTelcoTopup.findMany({
          where: { organizationId, occurredAt: dateFilter },
          orderBy: { occurredAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
    includeClose
      ? prisma.enterpriseRetailDailyClose.findMany({
          where: { organizationId, businessDate: dateFilter },
          orderBy: { businessDate: "desc" },
          take: 30,
          include: { lines: true },
        })
      : Promise.resolve([]),
    getRetailMetricsByCurrency(organizationId, dateFrom, dateTo, moduleCode),
    getRetailExchangeRateReadiness(organizationId, dateTo),
    includePos ? getRetailAccountingReadiness(organizationId, dateTo) : Promise.resolve(null),
  ]);

  return {
    sales,
    mobileMoney,
    topups,
    closes,
    metricsByCurrency,
    fxReadiness,
    accountingReadiness,
    range: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
  };
}

export type RetailDashboardPeriodProjection = Awaited<ReturnType<typeof loadRetailDashboardPeriodProjection>>;

function isRetailDashboardPeriodProjection(value: unknown): value is RetailDashboardPeriodProjection {
  if (!isRecord(value)) return false;
  const range = value.range;
  return (
    Array.isArray(value.sales)
    && Array.isArray(value.mobileMoney)
    && Array.isArray(value.topups)
    && Array.isArray(value.closes)
    && isRecord(value.metricsByCurrency)
    && isRecord(value.fxReadiness)
    && (value.accountingReadiness === null || isRecord(value.accountingReadiness))
    && isRecord(range)
    && typeof range.from === "string"
    && typeof range.to === "string"
  );
}

export async function getRetailDashboardPeriodProjection(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date,
  moduleCode: RetailModuleCode,
  cacheDefaultRange: boolean,
): Promise<{ value: RetailDashboardPeriodProjection; source: RetailDashboardReadSource }> {
  if (!cacheDefaultRange) {
    return {
      value: await loadRetailDashboardPeriodProjection(organizationId, dateFrom, dateTo, moduleCode),
      source: "BYPASS",
    };
  }

  return withTenantReadCache<RetailDashboardPeriodProjection>({
    projection: periodProjectionName(moduleCode),
    schemaVersion: RETAIL_DASHBOARD_PERIOD_CACHE.schemaVersion,
    organizationId,
    ttlSeconds: RETAIL_DASHBOARD_PERIOD_CACHE.ttlSeconds,
    validate: isRetailDashboardPeriodProjection,
    load: () => loadRetailDashboardPeriodProjection(organizationId, dateFrom, dateTo, moduleCode),
  });
}

export async function getRetailDashboardUserProjection(organizationId: string, userId: string) {
  const cashSessionsRaw = await prisma.enterpriseCashSession.findMany({
    where: {
      organizationId,
      cashierUserId: userId,
      status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] },
    },
    orderBy: { openedAt: "desc" },
    take: 12,
    include: {
      financialAccount: {
        select: {
          id: true,
          code: true,
          name: true,
          currencyCode: true,
          operationalBalance: true,
        },
      },
      movements: { select: { direction: true, amount: true } },
      _count: { select: { movements: true, counts: true, discrepancies: true } },
    },
  });

  const cashSessions = cashSessionsRaw.map((session) => {
    const expectedCurrentAmount = session.movements.reduce(
      (balance, movement) => movement.direction === "INBOUND" ? balance.plus(movement.amount) : balance.minus(movement.amount),
      new Prisma.Decimal(session.openingAmount),
    );
    const { movements, ...sessionWithoutMovements } = session;
    void movements;
    return { ...sessionWithoutMovements, expectedCurrentAmount: expectedCurrentAmount.toFixed() };
  });

  return {
    cashSession: cashSessions.find((session) => session.status === "OPEN") || cashSessions[0] || null,
    cashSessions,
  };
}

export async function invalidateCommercialRetailDashboardCacheForDomainEvent(input: {
  organizationId: string;
  entityType: string;
}) {
  const invalidateOrganization = RETAIL_ORGANIZATION_INVALIDATION_ENTITY_TYPES.has(input.entityType);
  const invalidatePeriod = RETAIL_PERIOD_INVALIDATION_ENTITY_TYPES.has(input.entityType);
  if (!invalidateOrganization && !invalidatePeriod) return false;

  const invalidations: Array<Promise<boolean>> = [];
  for (const moduleCode of RETAIL_MODULE_CODES) {
    if (invalidateOrganization) {
      invalidations.push(invalidateTenantReadCache({
        projection: organizationProjectionName(moduleCode),
        schemaVersion: RETAIL_DASHBOARD_ORG_CACHE.schemaVersion,
        organizationId: input.organizationId,
      }));
    }
    if (invalidatePeriod) {
      invalidations.push(invalidateTenantReadCache({
        projection: periodProjectionName(moduleCode),
        schemaVersion: RETAIL_DASHBOARD_PERIOD_CACHE.schemaVersion,
        organizationId: input.organizationId,
      }));
    }
  }

  const results = await Promise.allSettled(invalidations);
  return results.some((result) => result.status === "fulfilled" && result.value);
}
