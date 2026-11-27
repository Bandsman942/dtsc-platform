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
