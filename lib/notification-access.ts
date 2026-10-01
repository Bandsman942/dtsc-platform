import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/session";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export const ENTERPRISE_INVITATION_NOTIFICATION_TYPES = ["ENTERPRISE_INVITATION", "ORGANIZATION_INVITATION"] as const;
export const GLOBAL_ACCOUNT_NOTIFICATION_TYPES = ["ENTERPRISE_IDENTITY"] as const;

type NotificationMembership = { organizationId: string; status: string };

async function getNotificationMembershipOrganizationIds(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "INVITED"] },
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null },
    },
    select: { organizationId: true, status: true },
  });
  return notificationMembershipOrganizationIds(memberships);
}

function notificationMembershipOrganizationIds(memberships: NotificationMembership[]) {
  return {
    activeOrganizationIds: memberships.filter((membership) => membership.status === "ACTIVE").map((membership) => membership.organizationId),
    invitedOrganizationIds: memberships.filter((membership) => membership.status === "INVITED").map((membership) => membership.organizationId),
  };
}

export function buildVisibleNotificationWhereForSession(
  session: SessionPayload,
  memberships: NotificationMembership[],
): Prisma.NotificationWhereInput {
  const activeOrganizationId = getActiveOrganizationId(session);
  const { activeOrganizationIds, invitedOrganizationIds } = notificationMembershipOrganizationIds(memberships);
  const allowedInvitationOrganizationIds = Array.from(new Set([...activeOrganizationIds, ...invitedOrganizationIds]));
  const contextClauses: Prisma.NotificationWhereInput[] = [
    { organizationId: null },
    { type: { in: [...GLOBAL_ACCOUNT_NOTIFICATION_TYPES] } },
  ];

  if (activeOrganizationId) {
    contextClauses.push({ organizationId: activeOrganizationId });
  }
  if (allowedInvitationOrganizationIds.length) {
    contextClauses.push({
      organizationId: { in: allowedInvitationOrganizationIds },
      type: { in: [...ENTERPRISE_INVITATION_NOTIFICATION_TYPES] },
    });
  }

  return {
    userId: session.userId,
    OR: contextClauses,
  };
}

export async function getVisibleNotificationWhereForSession(session: SessionPayload): Promise<Prisma.NotificationWhereInput> {
  const memberships = await getNotificationMembershipOrganizationIds(session.userId);
  return buildVisibleNotificationWhereForSession(
    session,
    [
      ...memberships.activeOrganizationIds.map((organizationId) => ({ organizationId, status: "ACTIVE" })),
      ...memberships.invitedOrganizationIds.map((organizationId) => ({ organizationId, status: "INVITED" })),
    ],
  );
}
