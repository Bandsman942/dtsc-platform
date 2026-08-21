import { getHistoricalImportWorkspace } from "@/lib/enterprise/retail/historical-import-service";
import { prisma } from "@/lib/prisma";

export async function getHistoricalImportWorkspaceView(organizationId: string, actorUserId: string) {
  const [workspace, providerAccounts] = await Promise.all([
    getHistoricalImportWorkspace(organizationId, actorUserId),
    prisma.enterpriseRetailProviderAccount.findMany({
      where: {
        organizationId,
        accountUse: { in: ["MOBILE_MONEY_FLOAT", "TELCO_FLOAT"] },
        isActive: true,
      },
      orderBy: [{ providerCode: "asc" }, { accountUse: "asc" }, { currencyCode: "asc" }],
      select: {
        providerId: true,
        providerCode: true,
        accountUse: true,
        currencyCode: true,
        financialAccountId: true,
      },
    }),
  ]);
  return { ...workspace, providerAccounts };
}
