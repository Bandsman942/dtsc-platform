import { prisma } from "@/lib/prisma";

export async function getAccountMembershipSnapshot(userId: string) {
  return prisma.organizationMember.findMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "INVITED"] },
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null },
    },
    select: {
      id: true,
      organizationId: true,
      role: true,
      status: true,
      invitedBy: true,
      createdAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          brandingJson: true,
          organizationType: true,
        },
      },
    },
  });
}

export type AccountMembershipSnapshot = Awaited<ReturnType<typeof getAccountMembershipSnapshot>>;

export function getActiveAccountMemberships(snapshot: AccountMembershipSnapshot, limit: number) {
  return snapshot
    .filter((membership) => membership.status === "ACTIVE")
    .sort((left, right) => left.organization.name.localeCompare(right.organization.name, "fr"))
    .slice(0, limit);
}

export function getPendingAccountInvitations(snapshot: AccountMembershipSnapshot) {
  return snapshot
    .filter((membership) => membership.status === "INVITED" && membership.organization.organizationType === "CLIENT")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}
