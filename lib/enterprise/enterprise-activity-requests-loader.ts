import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function canSeeAllEnterpriseActivityRequests(role: string | null | undefined) {
  return role === "OWNER" || role === "ADMIN_ENTREPRISE" || role === "ADMIN_ENTERPRISE" || role === "MANAGER";
}

export async function getEnterpriseActivityRequests({
  organizationId,
  userId,
  membershipRole,
}: {
  organizationId: string;
  userId: string;
  membershipRole: string | null | undefined;
}) {
  const requestWhere: Prisma.EnterpriseActivityRequestWhereInput = canSeeAllEnterpriseActivityRequests(membershipRole)
    ? { organizationId }
    : {
        organizationId,
        OR: [{ createdById: userId }, { assignedToUserId: userId }],
      };

  return prisma.enterpriseActivityRequest.findMany({
    where: requestWhere,
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      createdBy: { select: { name: true, email: true } },
      block: { select: { labelFr: true, labelEn: true, icon: true } },
    },
  });
}
