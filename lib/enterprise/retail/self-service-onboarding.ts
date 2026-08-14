import { Prisma } from "@prisma/client";
import { getRetailAccountingReadiness } from "@/lib/enterprise/retail/accounting-readiness";
import { RETAIL_COUNTRY_PACKS } from "@/lib/enterprise/retail/country-packs";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { getRetailReadinessDeepLink } from "@/lib/enterprise/retail/readiness-deep-links";
import { prisma } from "@/lib/prisma";

type OnboardingSelection = {
  countryCode?: string | null;
  currencyCode?: string | null;
  siteId?: string | null;
  warehouseId?: string | null;
  cashFinancialAccountId?: string | null;
  revision?: number | null;
};

async function loadOptions(organizationId: string) {
  const [organization, sites, warehouses, accounts, configuration, countryPackActivations] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: "COMMERCE_RETAIL" },
      select: { id: true, name: true, country: true, timezone: true },
    }),
    prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.enterpriseWarehouse.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ siteId: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, siteId: true },
    }),
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ accountType: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, accountType: true, currencyCode: true, siteId: true },
    }),
    prisma.enterpriseRetailConfiguration.findUnique({
      where: { organizationId },
      select: { id: true, profileCode: true, baseCurrencyCode: true, status: true },
    }),
    prisma.enterpriseRetailCountryPackActivation.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, packCode: true, countryCode: true, status: true, packVersion: true },
    }),
  ]);
  if (!organization) throw new EnterpriseRetailError("RETAIL_ORGANIZATION_NOT_FOUND", 404);
  return { organization, sites, warehouses, accounts, configuration, countryPackActivations };
}

function uniqueOrNull<T>(items: T[]) {
  return items.length === 1 ? items[0] : null;
}

function isCashAccount(account: { accountType?: string | null }) {
  return String(account.accountType || "").toUpperCase().includes("CASH");
}

export async function computeRetailReadiness(organizationId: string, selection: OnboardingSelection) {
  const options = await loadOptions(organizationId);
  const accounting = await getRetailAccountingReadiness(organizationId);
  const [catalogCount, trackedCatalogItems, inventoryCatalogIds, activeMembers] = await Promise.all([
    prisma.enterpriseCatalogItem.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseCatalogItem.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null, trackInventory: true }, select: { id: true } }),
    prisma.enterpriseInventoryItem.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { catalogItemId: true } }),
    prisma.organizationMember.count({ where: { organizationId, status: "ACTIVE" } }),
  ]);

  const activePackActivations = options.countryPackActivations.filter((activation) => ["ACTIVE_CORE", "VALIDATED"].includes(activation.status));
  const requestedCountryCode = selection.countryCode?.toUpperCase() || null;
  const inferredPack = requestedCountryCode
    ? activePackActivations.find((activation) => activation.countryCode === requestedCountryCode) || null
    : uniqueOrNull(activePackActivations);
  const countryCode = requestedCountryCode || inferredPack?.countryCode || null;
  const selectedPack = countryCode
    ? activePackActivations.find((activation) => activation.countryCode === countryCode) || null
    : null;

  const functionalCurrencyCode = accounting.functionalCurrencyCode?.toUpperCase() || null;
  const currencyCode = selection.currencyCode?.toUpperCase() || functionalCurrencyCode;

  const requestedWarehouse = selection.warehouseId
    ? options.warehouses.find((item) => item.id === selection.warehouseId) || null
    : null;
  const requestedCashAccount = selection.cashFinancialAccountId
    ? options.accounts.find((item) => item.id === selection.cashFinancialAccountId) || null
    : null;
  const requestedSite = selection.siteId
    ? options.sites.find((item) => item.id === selection.siteId) || null
    : null;

  const relatedSiteId = requestedWarehouse?.siteId || requestedCashAccount?.siteId || null;
  let site = requestedSite
    || (relatedSiteId ? options.sites.find((item) => item.id === relatedSiteId) || null : null)
    || uniqueOrNull(options.sites);

  let warehouseCandidates = options.warehouses.filter((item) => !site || item.siteId === site.id);
  const warehouse = requestedWarehouse && (!site || requestedWarehouse.siteId === site.id)
    ? requestedWarehouse
    : uniqueOrNull(warehouseCandidates);

  if (!site && warehouse) {
    site = options.sites.find((item) => item.id === warehouse.siteId) || null;
    warehouseCandidates = options.warehouses.filter((item) => item.siteId === site?.id);
  }

  const cashAccountCandidates = options.accounts.filter((item) => (
    isCashAccount(item)
    && (!currencyCode || item.currencyCode === currencyCode)
    && (!site || !item.siteId || item.siteId === site.id)
  ));
  const cashAccount = requestedCashAccount && cashAccountCandidates.some((item) => item.id === requestedCashAccount.id)
    ? requestedCashAccount
    : uniqueOrNull(cashAccountCandidates);

  const inventorySet = new Set(inventoryCatalogIds.map((item) => item.catalogItemId));
  const missingInventoryLinks = trackedCatalogItems.filter((item) => !inventorySet.has(item.id)).length;
  const inventoryLinksComplete = catalogCount > 0 && (trackedCatalogItems.length === 0 || missingInventoryLinks === 0);

  const items = [
    {
      code: "COUNTRY_PACK",
      complete: Boolean(countryCode && selectedPack),
      detail: { countryCode, packCode: selectedPack?.packCode || null, candidateCount: activePackActivations.length },
    },
    {
      code: "FUNCTIONAL_CURRENCY",
      complete: Boolean(currencyCode && functionalCurrencyCode === currencyCode),
      detail: { selectedCurrencyCode: currencyCode, functionalCurrencyCode },
    },
    {
      code: "SITE",
      complete: Boolean(site),
      detail: { name: site?.name || null, candidateCount: options.sites.length },
    },
    {
      code: "WAREHOUSE",
      complete: Boolean(warehouse),
      detail: { name: warehouse?.name || null, candidateCount: warehouseCandidates.length, siteName: site?.name || null },
    },
    {
      code: "CASH_ACCOUNT",
      complete: Boolean(cashAccount && (!currencyCode || cashAccount.currencyCode === currencyCode)),
      detail: {
        name: cashAccount?.name || null,
        candidateCount: cashAccountCandidates.length,
        currencyCode,
        siteName: site?.name || null,
      },
    },
    { code: "CATALOG", complete: catalogCount > 0, detail: { count: catalogCount } },
    {
      code: "INVENTORY_LINKS",
      complete: inventoryLinksComplete,
      detail: { trackedCatalogItems: trackedCatalogItems.length, missingInventoryLinks },
    },
    { code: "TEAM", complete: activeMembers > 0, detail: { activeMembers } },
    {
      code: "ACCOUNTING",
      complete: accounting.ready,
      detail: {
        missingMappings: accounting.missingMappings,
        missingJournals: accounting.missingJournals,
        fiscalPeriodStatus: accounting.fiscalPeriodStatus,
      },
    },
    {
      code: "RETAIL_CONFIGURATION",
      complete: options.configuration?.status === "ACTIVE",
      detail: { profileCode: options.configuration?.profileCode || null, status: options.configuration?.status || null },
    },
  ].map((item) => ({ ...item, deepLink: getRetailReadinessDeepLink(item.code) }));

  const completed = items.filter((item) => item.complete).length;
  const firstIncomplete = items.find((item) => !item.complete)?.code || "COMPLETE";
  return {
    ready: completed === items.length,
    completed,
    total: items.length,
    currentStep: firstIncomplete,
    items,
    accounting,
    selected: {
      countryCode,
      currencyCode,
      siteId: site?.id || null,
      warehouseId: warehouse?.id || null,
      cashFinancialAccountId: cashAccount?.id || null,
    },
    options,
  };
}

async function latestSelection(organizationId: string) {
  return prisma.enterpriseRetailOnboardingRun.findFirst({
    where: { organizationId, archivedAt: null },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function getCanonicalRetailReadiness(organizationId: string) {
  const latestRun = await latestSelection(organizationId);
  return computeRetailReadiness(organizationId, latestRun || {});
}

export async function getRetailSelfServiceOnboarding(organizationId: string) {
  const latestRun = await latestSelection(organizationId);
  const readiness = await computeRetailReadiness(organizationId, latestRun || {});
  return { latestRun, readiness, countryPackRegistry: RETAIL_COUNTRY_PACKS };
}

export async function saveRetailSelfServiceOnboarding(args: { organizationId: string; actorUserId: string; selection: OnboardingSelection }) {
  const current = await prisma.enterpriseRetailOnboardingRun.findFirst({
    where: { organizationId: args.organizationId, archivedAt: null, status: "IN_PROGRESS" },
    orderBy: [{ updatedAt: "desc" }],
  });
  if (current && args.selection.revision && current.revision !== args.selection.revision) throw new EnterpriseRetailError("RETAIL_ONBOARDING_REVISION_CONFLICT", 409);

  const merged: OnboardingSelection = {
    countryCode: args.selection.countryCode ?? current?.countryCode ?? null,
    currencyCode: args.selection.currencyCode ?? current?.currencyCode ?? null,
    siteId: args.selection.siteId ?? current?.siteId ?? null,
    warehouseId: args.selection.warehouseId ?? current?.warehouseId ?? null,
    cashFinancialAccountId: args.selection.cashFinancialAccountId ?? current?.cashFinancialAccountId ?? null,
  };
  const readiness = await computeRetailReadiness(args.organizationId, merged);
  const status = readiness.ready ? "COMPLETED" : "IN_PROGRESS";
  const blockedReason = readiness.ready ? null : readiness.currentStep;

  if (current) {
    const updated = await prisma.enterpriseRetailOnboardingRun.updateMany({
      where: { id: current.id, organizationId: args.organizationId, revision: current.revision },
      data: {
        status,
        currentStep: readiness.currentStep,
        countryCode: readiness.selected.countryCode,
        currencyCode: readiness.selected.currencyCode,
        siteId: readiness.selected.siteId,
        warehouseId: readiness.selected.warehouseId,
        cashFinancialAccountId: readiness.selected.cashFinancialAccountId,
        readinessJson: readiness as unknown as Prisma.InputJsonValue,
        blockedReason,
        completedAt: readiness.ready ? new Date() : null,
        updatedByUserId: args.actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseRetailError("RETAIL_ONBOARDING_REVISION_CONFLICT", 409);
    return { run: await prisma.enterpriseRetailOnboardingRun.findUniqueOrThrow({ where: { id: current.id } }), readiness };
  }

  const run = await prisma.enterpriseRetailOnboardingRun.create({
    data: {
      organizationId: args.organizationId,
      status,
      currentStep: readiness.currentStep,
      countryCode: readiness.selected.countryCode,
      currencyCode: readiness.selected.currencyCode,
      siteId: readiness.selected.siteId,
      warehouseId: readiness.selected.warehouseId,
      cashFinancialAccountId: readiness.selected.cashFinancialAccountId,
      readinessJson: readiness as unknown as Prisma.InputJsonValue,
      blockedReason,
      completedAt: readiness.ready ? new Date() : null,
      createdByUserId: args.actorUserId,
    },
  });
  return { run, readiness };
}
