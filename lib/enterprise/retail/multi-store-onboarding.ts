import { prisma } from "@/lib/prisma";
import { RETAIL_OWNER_ROLES, retailStaffIsolationIsEnabled, siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";

/** Read-only onboarding projection. Sites, stock, accounts and assignments remain
 * owned by their existing ERP modules; this is not a second source of truth. */
export async function getRetailMultiStoreOnboarding(organizationId: string) {
  const [sites, warehouses, cashAccounts, assignments, configuration] = await Promise.all([
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
      select: { id: true, siteId: true, currencyCode: true }, take: 1000,
    }),
    prisma.enterpriseRetailSiteAssignment.findMany({
      where: { organizationId, isActive: true, member: { status: "ACTIVE", removedAt: null } },
      select: { siteId: true, userId: true, roleCode: true, permissionsJson: true }, take: 2000,
    }),
    prisma.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { baseCurrencyCode: true, settingsJson: true },
    }),
  ]);

  const baseCurrency = configuration?.baseCurrencyCode || "CDF";
  const isolationEnabled = retailStaffIsolationIsEnabled(configuration?.settingsJson);
  return {
    baseCurrency,
    isolationEnabled,
    sites: sites.map((site) => {
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
      return {
        ...site,
        warehouseCount,
        cashAccountCount: siteAccounts.length,
        cashReady,
        staffCount,
        invoicerCount,
        cashierCount,
        ready: warehouseCount > 0 && cashReady && staffCount > 0 && invoicerCount > 0 && cashierCount > 0 && isolationEnabled,
      };
    }),
  };
}

/** The operator's store switcher is built from server-verified assignments.
 * A client-supplied siteId is never used to broaden the authorized store list. */
export async function getRetailMyStores(organizationId: string, userId: string, role: string) {
  const configuration = await prisma.enterpriseRetailConfiguration.findUnique({
    where: { organizationId }, select: { settingsJson: true },
  });
  const isolationEnabled = retailStaffIsolationIsEnabled(configuration?.settingsJson);
  if (RETAIL_OWNER_ROLES.has(role)) {
    const sites = await prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, name: true, code: true, city: true },
      orderBy: { name: "asc" }, take: 500,
    });
    return { isolationEnabled, isOwner: true, sites: sites.map((site) => ({ ...site, roleCode: "OWNER", capabilities: ["VIEW_SALES", "COLLECT_PAYMENT", "PREPARE_INVOICE"] })) };
  }

  const assignments = await prisma.enterpriseRetailSiteAssignment.findMany({
    where: { organizationId, userId, isActive: true, member: { status: "ACTIVE", removedAt: null }, site: { status: "ACTIVE", archivedAt: null } },
    select: { siteId: true, roleCode: true, permissionsJson: true, site: { select: { id: true, name: true, code: true, city: true } } },
    orderBy: { site: { name: "asc" } }, take: 500,
  });
  return {
    isolationEnabled,
    isOwner: false,
    sites: assignments.map((assignment) => ({
      ...assignment.site,
      roleCode: assignment.roleCode,
      capabilities: siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson),
    })).filter((site) => site.capabilities.some((capability) =>
      capability === "VIEW_SALES" || capability === "PREPARE_INVOICE" || capability === "COLLECT_PAYMENT",
    )),
  };
}
