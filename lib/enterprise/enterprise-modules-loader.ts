import { prisma } from "@/lib/prisma";

export async function getEnterpriseModulesDataset(organizationId: string) {
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

  return { modules, activityBlocks };
}
