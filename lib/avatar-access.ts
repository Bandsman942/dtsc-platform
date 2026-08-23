import { prisma } from "@/lib/prisma";
import { isCollaborationBlocked } from "@/lib/standard-collaboration";

export async function canReadUserAvatar({
  viewerUserId,
  targetUserId,
  publicProfileConsent,
}: {
  viewerUserId: string | null | undefined;
  targetUserId: string;
  publicProfileConsent: boolean;
}) {
  if (publicProfileConsent) return true;
  if (!viewerUserId) return false;
  if (viewerUserId === targetUserId) return true;

  const viewerMemberships = await prisma.organizationMember.findMany({
    where: {
      userId: viewerUserId,
      status: "ACTIVE",
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null },
    },
    select: { organizationId: true },
    take: 100,
  });

  if (viewerMemberships.length > 0) {
    const sharedOrganization = await prisma.organizationMember.findFirst({
      where: {
        userId: targetUserId,
        organizationId: { in: viewerMemberships.map((membership) => membership.organizationId) },
        status: "ACTIVE",
        removedAt: null,
        organization: { status: "ACTIVE", deletedAt: null },
      },
      select: { id: true },
    });
    if (sharedOrganization) return true;
  }

  const acceptedContact = await prisma.collaborationContactRequest.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: viewerUserId, targetUserId },
        { requesterId: targetUserId, targetUserId: viewerUserId },
      ],
    },
    select: { id: true },
  });
  if (!acceptedContact) return false;

  return !(await isCollaborationBlocked(viewerUserId, targetUserId));
}
