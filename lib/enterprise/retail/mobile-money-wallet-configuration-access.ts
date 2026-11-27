import type { Prisma } from "@prisma/client";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";

/** A provider/currency mapping is tenant-wide, not a shop-specific mapping.
 * A restricted operator must never replace a mapping used by other stores. */
export async function assertMobileMoneyGlobalMappingAccess(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  const sites = await retailFinanceReadSiteScope(organizationId, userId, "COLLECT_PAYMENT", tx);
  if (sites !== null) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
}

export async function mobileMoneyWalletConfigurationScope(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  const [readSites, collectionSites] = await Promise.all([
    retailFinanceReadSiteScope(organizationId, userId, "VIEW_SALES", tx),
    retailFinanceReadSiteScope(organizationId, userId, "COLLECT_PAYMENT", tx),
  ]);
  return { readSites, collectionSites, canManageMappings: collectionSites === null };
}

export function mobileMoneyScopedAccountWhere(organizationId: string, scope: Awaited<ReturnType<typeof mobileMoneyWalletConfigurationScope>>): Prisma.EnterpriseFinancialAccountWhereInput {
  const { readSites, collectionSites } = scope;
  return {
    organizationId, status: "ACTIVE", archivedAt: null,
    OR: [
      { accountType: "CASH", ...(collectionSites === null ? {} : { siteId: { in: collectionSites } }) },
      { accountType: { in: ["MOBILE_MONEY", "BANK", "CLEARING"] }, ...(readSites === null ? {} : { siteId: { in: readSites } }) },
    ],
  };
}

/** A shared wallet can be used through an authorized till without granting
 * direct wallet access. A wallet assigned to another site is not shared. */
export function mobileMoneyOperationWalletWhere(organizationId: string, collectionSites: string[] | null): Prisma.EnterpriseFinancialAccountWhereInput {
  return {
    organizationId, accountType: "MOBILE_MONEY", status: "ACTIVE", archivedAt: null,
    ...(collectionSites === null ? {} : collectionSites.length ? { OR: [{ siteId: null }, { siteId: { in: collectionSites } }] } : { id: { in: [] } }),
  };
}

export async function assertMobileMoneyOperationAccess(tx: Prisma.TransactionClient, organizationId: string, userId: string, cashAccountId: string, floatAccountId: string) {
  const sites = await retailFinanceReadSiteScope(organizationId, userId, "COLLECT_PAYMENT", tx);
  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId, id: { in: [cashAccountId, floatAccountId] } },
    select: { id: true, siteId: true, accountType: true },
  });
  const cash = accounts.find(account => account.id === cashAccountId && account.accountType === "CASH");
  const wallet = accounts.find(account => account.id === floatAccountId && account.accountType === "MOBILE_MONEY");
  if (!cash || !wallet || (sites !== null && (!cash.siteId || !sites.includes(cash.siteId) || (wallet.siteId !== null && !sites.includes(wallet.siteId))))) {
    throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  }
  return { hideFloatBalance: sites !== null };
}
