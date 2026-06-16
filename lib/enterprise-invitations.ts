import { prisma } from "@/lib/prisma";

export async function getPendingEnterpriseInvitationsForUser(userId: string) {
  return prisma.organizationMember.findMany({
    where: {
      userId,
      status: "INVITED",
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    },
    select: {
      id: true,
      organizationId: true,
      role: true,
      invitedBy: true,
      createdAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          organizationType: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingEnterpriseInvitationCount(userId: string) {
  return prisma.organizationMember.count({
    where: {
      userId,
      status: "INVITED",
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    },
  });
}
