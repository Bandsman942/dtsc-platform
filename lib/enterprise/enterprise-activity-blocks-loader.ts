import { prisma } from "@/lib/prisma";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";

export async function getEnterpriseActivityBlocks(organizationId: string) {
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
  return blocks.filter((block) => !block.targetModuleCode || allowedModuleCodes.has(block.targetModuleCode));
}
