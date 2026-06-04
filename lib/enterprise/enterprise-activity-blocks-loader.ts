import { prisma } from "@/lib/prisma";

export async function getEnterpriseActivityBlocks(organizationId: string) {
  return prisma.enterpriseActivityBlock.findMany({
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
  });
}
