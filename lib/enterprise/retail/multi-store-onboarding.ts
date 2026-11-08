import { prisma } from "@/lib/prisma";
import { getRetailAccountingReadiness } from "@/lib/enterprise/retail/accounting-readiness";
import { RETAIL_OWNER_ROLES, retailStaffIsolationIsEnabled, siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";

/** Read-only onboarding projection. Sites, stock, accounts and assignments remain
 * owned by their existing ERP modules; this is not a second source of truth. */
export async function getRetailMultiStoreOnboarding(organizationId: string) {
  const [sites, warehouses, cashAccounts, assignments, configuration, accounting, catalogCount, trackedCatalogCount] = await Promise.all([
    prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, name: true, code: true, siteType: true, city: true },
      orderBy: { name: "asc" }, take: 500,
    }),
    prisma.enterpriseWarehouse.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, siteId: true }, take: 1000,
    }),
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, accountType: "CASH", siteId: { not: null }, ledgerAccount: { isActive: true, archivedAt: null } },
      select: { id: true, siteId: true, currencyCode: true, name: true }, take: 1000,
    }),
    prisma.enterpriseRetailSiteAssignment.findMany({
      where: { organizationId, isActive: true, member: { status: "ACTIVE", removedAt: null } },
      select: { siteId: true, userId: true, roleCode: true, permissionsJson: true }, take: 2000,
    }),
    prisma.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { baseCurrencyCode: true, settingsJson: true },
    }),
    getRetailAccountingReadiness(organizationId),
    prisma.enterpriseCatalogItem.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    prisma.enterpriseCatalogItem.count({ where: { organizationId, status: "ACTIVE", archivedAt: null, trackInventory: true } }),
  ]);

  const [stockBalances, openSessions] = await Promise.all([
    prisma.enterpriseInventoryBalance.groupBy({
      by: ["warehouseId"],
      where: { organizationId, warehouseId: { in: warehouses.map((warehouse) => warehouse.id) }, quantityOnHand: { gt: 0 } },
      _count: { _all: true },
    }),
    prisma.enterpriseCashSession.findMany({
      where: { organizationId, status: "OPEN", financialAccountId: { in: cashAccounts.map((account) => account.id) } },
      select: { financialAccountId: true }, take: 2000,
    }),
  ]);
  const stockByWarehouse = new Map(stockBalances.map((row) => [row.warehouseId, row._count._all]));
  const openSessionAccounts = new Set(openSessions.map((session) => session.financialAccountId));

  const baseCurrency = configuration?.baseCurrencyCode || "CDF";
  const isolationEnabled = retailStaffIsolationIsEnabled(configuration?.settingsJson);
  const invoiceCheckoutEnabled = Boolean(configuration?.settingsJson && typeof configuration.settingsJson === "object" && !Array.isArray(configuration.settingsJson) && configuration.settingsJson.invoiceCheckoutEnabled === true);
  // Prefer real stores when an enterprise also has a headquarters or back-office site.
  // Existing Retail tenants using BRANCH-only sites retain their legacy flow.
  const storeSites = sites.some((site) => site.siteType === "STORE") ? sites.filter((site) => site.siteType === "STORE") : sites;
  return {
    baseCurrency,
    isolationEnabled,
    invoiceCheckoutEnabled,
    accountingReady: accounting.ready && accounting.functionalCurrencyCode === baseCurrency,
    catalogCount,
    trackedCatalogCount,
    sites: storeSites.map((site) => {
      const assigned = assignments.filter((assignment) => assignment.siteId === site.id);
      const siteAccounts = cashAccounts.filter((account) => account.siteId === site.id);
      const warehouseCount = warehouses.filter((warehouse) => warehouse.siteId === site.id).length;
      const staffCount = new Set(assigned.filter((assignment) =>
        siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).some((capability) =>
          capability === "VIEW_SALES" || capability === "PREPARE_INVOICE" || capability === "COLLECT_PAYMENT",
        ),
      ).map((assignment) => assignment.userId)).size;
      const invoicerCount = new Set(assigned.filter((assignment) => siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson)
        .includes("PREPARE_INVOICE")).map((assignment) => assignment.userId)).size;
      const cashierCount = new Set(assigned.filter((assignment) => siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson)
        .includes("COLLECT_PAYMENT")).map((assignment) => assignment.userId)).size;
      const cashReady = siteAccounts.some((account) => account.currencyCode === baseCurrency);
      const stockLineCount = warehouses.filter((warehouse) => warehouse.siteId === site.id).reduce((count, warehouse) => count + (stockByWarehouse.get(warehouse.id) || 0), 0);
      const openTillCount = siteAccounts.filter((account) => openSessionAccounts.has(account.id)).length;
      const teamReady = staffCount > 0 && invoicerCount > 0 && cashierCount > 0;
      const stockReady = trackedCatalogCount === 0 || stockLineCount > 0;
      const configurationReady = warehouseCount > 0 && cashReady && teamReady && isolationEnabled;
      return {
        ...site,
        warehouseCount,
        cashAccountCount: siteAccounts.length,
        cashReady,
        staffCount,
        invoicerCount,
        cashierCount,
        stockLineCount,
        openTillCount,
        cashAccounts: siteAccounts.map((account) => ({ id: account.id, name: account.name, currencyCode: account.currencyCode })),
        readiness: {
          warehouse: warehouseCount > 0, cash: cashReady, team: teamReady, isolation: isolationEnabled,
          finance: accounting.ready && accounting.functionalCurrencyCode === baseCurrency,
          catalog: catalogCount > 0, stock: stockReady, checkout: invoiceCheckoutEnabled,
        },
        ready: configurationReady,
        operationalReady: configurationReady && accounting.ready && accounting.functionalCurrencyCode === baseCurrency && catalogCount > 0 && stockReady && invoiceCheckoutEnabled,
      };
    }),
  };
}

/** The operator's store switcher is built from server-verified assignments.
 * A client-supplied siteId is never used to broaden the authorized store list. */
export async function getRetailMyStores(organizationId: string, userId: string, role: string) {
  const [configuration, member] = await Promise.all([
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
    prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: "ACTIVE", removedAt: null },
      select: { positionId: true, positionTitle: true },
    }),
  ]);
  const position = member?.positionId ? await prisma.enterprisePosition.findFirst({
    where: { organizationId, id: member.positionId }, select: { labelFr: true, labelEn: true },
  }) : null;
  const officialPosition = { fr: position?.labelFr || member?.positionTitle || null, en: position?.labelEn || member?.positionTitle || null };
  const isolationEnabled = retailStaffIsolationIsEnabled(configuration?.settingsJson);
  if (RETAIL_OWNER_ROLES.has(role)) {
    const sites = await prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, name: true, code: true, city: true, siteType: true },
      orderBy: { name: "asc" }, take: 500,
    });
    const storeSites = sites.some((site) => site.siteType === "STORE") ? sites.filter((site) => site.siteType === "STORE") : sites;
    const accounts = await prisma.enterpriseFinancialAccount.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null, accountType: "CASH", siteId: { in: storeSites.map((site) => site.id) } }, select: { siteId: true, name: true, currencyCode: true }, take: 1000 });
    return { isolationEnabled, isOwner: true, officialPosition, sites: storeSites.map((site) => ({ ...site, roleCode: "OWNER", capabilities: ["VIEW_SALES", "COLLECT_PAYMENT", "PREPARE_INVOICE", "CLOSE_CASH"], tills: accounts.filter((account) => account.siteId === site.id).map((account) => ({ name: account.name, currencyCode: account.currencyCode })) })) };
  }

  const assignments = await prisma.enterpriseRetailSiteAssignment.findMany({
    where: { organizationId, userId, isActive: true, member: { status: "ACTIVE", removedAt: null }, site: { status: "ACTIVE", archivedAt: null } },
    select: { siteId: true, roleCode: true, permissionsJson: true, site: { select: { id: true, name: true, code: true, city: true } } },
    orderBy: { site: { name: "asc" } }, take: 500,
  });
  const accounts = await prisma.enterpriseFinancialAccount.findMany({
    where: { organizationId, status: "ACTIVE", archivedAt: null, accountType: "CASH", siteId: { in: assignments.map((assignment) => assignment.siteId) } },
    select: { siteId: true, name: true, currencyCode: true }, take: 1000,
  });
  return {
    isolationEnabled,
    isOwner: false,
    officialPosition,
    sites: assignments.map((assignment) => ({
      ...assignment.site,
      roleCode: assignment.roleCode,
      capabilities: siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson),
      tills: siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).some((capability) => capability === "COLLECT_PAYMENT" || capability === "CLOSE_CASH")
        ? accounts.filter((account) => account.siteId === assignment.siteId).map((account) => ({ name: account.name, currencyCode: account.currencyCode }))
        : [],
    })).filter((site) => site.capabilities.some((capability) =>
      capability === "VIEW_SALES" || capability === "PREPARE_INVOICE" || capability === "COLLECT_PAYMENT" || capability === "CLOSE_CASH",
    )),
  };
}
