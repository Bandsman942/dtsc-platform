import { Prisma } from "@prisma/client";
import { getRetailAccountingReadiness } from "@/lib/enterprise/retail/accounting-readiness";
import { RETAIL_COUNTRY_PACKS } from "@/lib/enterprise/retail/country-packs";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
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

async function computeReadiness(organizationId: string, selection: OnboardingSelection) {
  const options = await loadOptions(organizationId);
  const accounting = await getRetailAccountingReadiness(organizationId);
  const [catalogCount, trackedCatalogItems, inventoryCatalogIds, activeMembers] = await Promise.all([
    prisma.enterpriseCatalogItem.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseCatalogItem.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null, trackInventory: true }, select: { id: true } }),
    prisma.enterpriseInventoryItem.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { catalogItemId: true } }),
    prisma.organizationMember.count({ where: { organizationId, status: "ACTIVE" } }),
  ]);

  const countryCode = selection.countryCode?.toUpperCase() || null;
  const selectedPack = countryCode ? options.countryPackActivations.find((activation) => activation.countryCode === countryCode && ["ACTIVE_CORE", "VALIDATED"].includes(activation.status)) : null;
  const currencyCode = selection.currencyCode?.toUpperCase() || null;
  const site = selection.siteId ? options.sites.find((item) => item.id === selection.siteId) : null;
  const warehouse = selection.warehouseId ? options.warehouses.find((item) => item.id === selection.warehouseId && (!site || item.siteId === site.id)) : null;
  const cashAccount = selection.cashFinancialAccountId ? options.accounts.find((item) => item.id === selection.cashFinancialAccountId && (!site || !item.siteId || item.siteId === site.id)) : null;
  const inventorySet = new Set(inventoryCatalogIds.map((item) => item.catalogItemId));
  const missingInventoryLinks = trackedCatalogItems.filter((item) => !inventorySet.has(item.id)).length;

  const items = [
    { code: "COUNTRY_PACK", complete: Boolean(countryCode && selectedPack), detail: selectedPack?.packCode || countryCode || null },
    { code: "FUNCTIONAL_CURRENCY", complete: Boolean(currencyCode && accounting.functionalCurrencyCode === currencyCode), detail: accounting.functionalCurrencyCode },
    { code: "SITE", complete: Boolean(site), detail: site?.name || null },
    { code: "WAREHOUSE", complete: Boolean(warehouse), detail: warehouse?.name || null },
    { code: "CASH_ACCOUNT", complete: Boolean(cashAccount && cashAccount.currencyCode === currencyCode), detail: cashAccount?.name || null },
    { code: "CATALOG", complete: catalogCount > 0, detail: catalogCount },
    { code: "INVENTORY_LINKS", complete: missingInventoryLinks === 0, detail: { trackedCatalogItems: trackedCatalogItems.length, missingInventoryLinks } },
    { code: "TEAM", complete: activeMembers > 0, detail: activeMembers },
    { code: "ACCOUNTING", complete: accounting.ready, detail: { missingMappings: accounting.missingMappings, missingJournals: accounting.missingJournals, fiscalPeriodStatus: accounting.fiscalPeriodStatus } },
    { code: "RETAIL_CONFIGURATION", complete: options.configuration?.status === "ACTIVE", detail: options.configuration?.profileCode || null },
  ];
  const completed = items.filter((item) => item.complete).length;
  const firstIncomplete = items.find((item) => !item.complete)?.code || "COMPLETE";
  return {
    ready: completed === items.length,
    completed,
    total: items.length,
    currentStep: firstIncomplete,
    items,
    accounting,
    selected: { countryCode, currencyCode, siteId: site?.id || null, warehouseId: warehouse?.id || null, cashFinancialAccountId: cashAccount?.id || null },
    options,
  };
}

export async function getRetailSelfServiceOnboarding(organizationId: string) {
  const latestRun = await prisma.enterpriseRetailOnboardingRun.findFirst({
    where: { organizationId, archivedAt: null },
    orderBy: [{ updatedAt: "desc" }],
  });
  const selection: OnboardingSelection = latestRun || {};
  const readiness = await computeReadiness(organizationId, selection);
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
  const readiness = await computeReadiness(args.organizationId, merged);
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
