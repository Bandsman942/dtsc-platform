import type { Prisma } from "@prisma/client";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";

export type MobileMoneyFxCapability = "VIEW_SALES" | "COLLECT_PAYMENT";

/** No shop is inferred from a provider or an organization-wide wallet.
 * Account IDs come from the authoritative tenant-scoped financial accounts. */
export async function mobileMoneyFxWalletScope(tx: Prisma.TransactionClient, organizationId: string, userId: string, capability: MobileMoneyFxCapability) {
  const sites = await retailFinanceReadSiteScope(organizationId, userId, capability, tx);
  if (sites === null) return null;
  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId, accountType: "MOBILE_MONEY", siteId: { in: sites } },
    select: { id: true },
  });
  return accounts.map(account => account.id);
}

export async function assertMobileMoneyFxWalletAccess(tx: Prisma.TransactionClient, organizationId: string, userId: string, capability: MobileMoneyFxCapability, sourceId: string, targetId: string) {
  const ids = await mobileMoneyFxWalletScope(tx, organizationId, userId, capability);
  // For unrestricted actors, both wallet IDs must still belong to the tenant.
  const allowed = ids ?? (await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId, accountType: "MOBILE_MONEY", id: { in: [sourceId, targetId] } },
    select: { id: true },
  })).map(account => account.id);
  if (!allowed.includes(sourceId) || !allowed.includes(targetId)) {
    throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  }
}
