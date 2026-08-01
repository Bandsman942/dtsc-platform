import { prisma } from "@/lib/prisma";

/**
 * Workflow Engine v2 is the only active workflow source. The administration
 * dashboard still needs recent activity requests, but it must not load the
 * legacy EnterpriseWorkflow catalogue on every render.
 *
 * The archive delegate (`prisma.enterpriseWorkflow`) remains available only
 * for protected historical/read-only endpoints and explicit migration audits.
 */
export async function getEnterpriseWorkflowsDataset(organizationId: string) {
  const [recentRequests, openRequestsCount] = await Promise.all([
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

  return { workflows: [], recentRequests, openRequestsCount };
}
