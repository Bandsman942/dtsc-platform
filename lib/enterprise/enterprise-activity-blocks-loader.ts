import { prisma } from "@/lib/prisma";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { canAccessEnterpriseActivity } from "@/lib/enterprise-sector-templates";

export async function getEnterpriseActivityBlocks(organizationId: string, userId?: string) {
  const [blocks, entitlements] = await Promise.all([
    prisma.enterpriseActivityBlock.findMany({
      where: { organizationId, isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
      select: {
        id: true,
        blockCode: true,
        labelFr: true,
        labelEn: true,
        descriptionFr: true,
        icon: true,
        targetModuleCode: true,
      },
    }),
    getOrganizationEntitlements(organizationId),
  ]);
  const allowedModuleCodes = new Set((entitlements?.modules || []).filter((enterpriseModule) => enterpriseModule.allowed).map((enterpriseModule) => enterpriseModule.moduleCode));
  const entitledBlocks = blocks.filter((block) => !block.targetModuleCode || allowedModuleCodes.has(block.targetModuleCode));
  if (!userId) {
    return entitledBlocks;
  }
  const accessChecks = await Promise.all(
    entitledBlocks.map(async (block) => ({
      block,
      allowed: await canAccessEnterpriseActivity(userId, organizationId, block.blockCode, "read"),
    }))
  );
  return accessChecks.filter((item) => item.allowed).map((item) => item.block);
}
