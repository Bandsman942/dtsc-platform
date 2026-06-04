import { prisma } from "@/lib/prisma";

export async function getEnterpriseActivityWorkflows(organizationId: string) {
  return prisma.enterpriseWorkflow.findMany({
    where: { organizationId, isEnabled: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      workflowCode: true,
      labelFr: true,
      labelEn: true,
      descriptionFr: true,
      stepsJson: true,
      updatedAt: true,
    },
  });
}
