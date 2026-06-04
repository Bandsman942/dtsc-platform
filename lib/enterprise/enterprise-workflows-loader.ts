import { prisma } from "@/lib/prisma";

export async function getEnterpriseWorkflowsDataset(organizationId: string) {
  const [workflows, recentRequests, openRequestsCount] = await Promise.all([
    prisma.enterpriseWorkflow.findMany({ where: { organizationId }, orderBy: { labelFr: "asc" } }),
    prisma.enterpriseActivityRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { createdBy: { select: { name: true, email: true } } },
    }),
    prisma.enterpriseActivityRequest.count({
      where: { organizationId, status: { in: ["SUBMITTED", "IN_PROGRESS", "PENDING"] } },
    }),
  ]);

  return { workflows, recentRequests, openRequestsCount };
}
