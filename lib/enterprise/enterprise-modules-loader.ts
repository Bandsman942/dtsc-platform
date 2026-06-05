import { prisma } from "@/lib/prisma";
import type { OrganizationEntitlements } from "@/lib/billing/entitlements";

export async function getEnterpriseModulesDataset(organizationId: string, entitlements?: OrganizationEntitlements | null) {
  const [modules, activityBlocks] = await Promise.all([
    prisma.enterpriseModule.findMany({
      where: { organizationId },
      orderBy: [{ moduleCategory: "asc" }, { sortOrder: "asc" }, { labelFr: "asc" }],
    }),
    prisma.enterpriseActivityBlock.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
    }),
  ]);

  const moduleEntitlementByCode = new Map((entitlements?.modules || []).map((item) => [item.moduleCode, item]));
  const annotatedModules = modules.map((enterpriseModule) => {
    const moduleEntitlement = moduleEntitlementByCode.get(enterpriseModule.moduleCode);
    return {
      ...enterpriseModule,
      requiredPlan: moduleEntitlement?.requiredPlan || null,
      includedInPlan: moduleEntitlement?.includedInPlan ?? true,
      accessAllowed: moduleEntitlement?.allowed ?? enterpriseModule.isEnabled,
      accessMessage: moduleEntitlement?.message || null,
    };
  });
  const allowedModuleCodes = new Set(annotatedModules.filter((enterpriseModule) => enterpriseModule.accessAllowed).map((enterpriseModule) => enterpriseModule.moduleCode));
  const filteredActivityBlocks = activityBlocks.filter((block) => !block.targetModuleCode || allowedModuleCodes.has(block.targetModuleCode));

  return { modules: annotatedModules, activityBlocks: filteredActivityBlocks };
}
