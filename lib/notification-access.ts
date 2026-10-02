import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/session";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export const ENTERPRISE_INVITATION_NOTIFICATION_TYPES = ["ENTERPRISE_INVITATION", "ORGANIZATION_INVITATION"] as const;
export const GLOBAL_ACCOUNT_NOTIFICATION_TYPES = ["ENTERPRISE_IDENTITY"] as const;


export function buildVisibleNotificationWhereForSession(
  session: SessionPayload,
  memberships: Array<{ organizationId: string; status: string }>,
): Prisma.NotificationWhereInput {
  const activeOrganizationId = getActiveOrganizationId(session);
  const activeOrganizationIds = memberships.filter((membership) => membership.status === "ACTIVE").map((membership) => membership.organizationId);
  const invitedOrganizationIds = memberships.filter((membership) => membership.status === "INVITED").map((membership) => membership.organizationId);
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
  const memberships = await prisma.organizationMember.findMany({
    where: {
      userId: session.userId,
      status: { in: ["ACTIVE", "INVITED"] },
      removedAt: null,
      organization: { status: "ACTIVE", deletedAt: null },
    },
    select: { organizationId: true, status: true },
  });
  return buildVisibleNotificationWhereForSession(session, memberships);
}
