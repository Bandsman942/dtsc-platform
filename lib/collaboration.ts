import { UserRole, type Prisma } from "@prisma/client";
import { canUseFeature } from "@/lib/billing/entitlements";
import type { SessionPayload } from "@/lib/session";
import { DTSC_INTERNAL_ORGANIZATION_ID, getActiveOrganizationId, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export async function getActiveGroupMember(groupId: string, userId: string) {
  return prisma.collaborationGroupMember.findFirst({
    where: { groupId, userId, status: "ACTIVE", group: { status: "ACTIVE" } },
    include: { group: true },
  });
}

export function canManageGroup(member: { role: string } | null, role?: UserRole) {
  return role === UserRole.ADMIN || member?.role === "OWNER" || member?.role === "ADMIN";
}

export async function assertGroupMember(groupId: string, userId: string) {
  const member = await getActiveGroupMember(groupId, userId);
  if (!member) {
    return null;
  }
  return member;
}

function isCrossContextGroup(group: { groupType: string }) {
  return group.groupType === "CROSS_ORGANIZATION" || group.groupType === "PRIVATE_NETWORK" || group.groupType === "DTSC_SUPPORT";
}

export function collaborationGroupScopeWhere(
  session: Pick<SessionPayload, "activeContext" | "activeOrganizationId"> | null | undefined
): Prisma.CollaborationGroupWhereInput {
  const crossContextGroups: Prisma.CollaborationGroupWhereInput = {
    groupType: { in: ["CROSS_ORGANIZATION", "PRIVATE_NETWORK", "DTSC_SUPPORT"] },
  };

  if (isDtscInternalSession(session)) {
    return { OR: [{ organizationId: DTSC_INTERNAL_ORGANIZATION_ID }, { organizationId: null }, crossContextGroups] };
  }

  const activeOrganizationId = getActiveOrganizationId(session);
  if (activeOrganizationId) {
    return { OR: [{ organizationId: activeOrganizationId }, crossContextGroups] };
  }

  return { OR: [{ organizationId: null }, crossContextGroups] };
}

export function canAccessGroupInSession(
  group: { organizationId: string | null; groupType: string },
  session: Pick<SessionPayload, "activeContext" | "activeOrganizationId"> | null | undefined
) {
  if (isDtscInternalSession(session)) {
    return group.organizationId === DTSC_INTERNAL_ORGANIZATION_ID || group.organizationId === null || isCrossContextGroup(group);
  }

  const activeOrganizationId = getActiveOrganizationId(session);
  if (activeOrganizationId) {
    return group.organizationId === activeOrganizationId || isCrossContextGroup(group);
  }

  return group.organizationId === null || isCrossContextGroup(group);
}

export async function canAccessGroupInSessionWithSubscription(
  group: { organizationId: string | null; groupType: string },
  session: Pick<SessionPayload, "activeContext" | "activeOrganizationId"> | null | undefined
) {
  if (!canAccessGroupInSession(group, session)) {
    return false;
  }
  if (!group.organizationId || isCrossContextGroup(group) || isDtscInternalSession(session)) {
    return true;
  }
  const featureAccess = await canUseFeature(group.organizationId, "collaborators");
  return featureAccess.allowed;
}

export async function assertGroupMemberForSession(groupId: string, session: SessionPayload) {
  const member = await getActiveGroupMember(groupId, session.userId);
  if (!member || !(await canAccessGroupInSessionWithSubscription(member.group, session))) {
    return null;
  }
  return member;
}

export async function parseMentionedUserIds(values: string[] | undefined, allowedUserIds: string[]) {
  const allowed = new Set(allowedUserIds);
  return [...new Set((values || []).filter((id) => allowed.has(id)))];
}

export async function groupMemberUserIds(groupId: string) {
  const members = await prisma.collaborationGroupMember.findMany({
    where: { groupId, status: "ACTIVE" },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

export async function writeGroupAudit({
  groupId,
  actorId,
  action,
  entityType,
  entityId,
}: {
  groupId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
}) {
  return prisma.collaborationGroupAuditLog.create({
    data: {
      groupId,
      actorId: actorId || null,
      action,
      entityType,
      entityId: entityId || null,
    },
  }).catch(() => null);
}

export async function createGroupSystemMessage({
  groupId,
  actorId,
  content,
}: {
  groupId: string;
  actorId: string;
  content: string;
}) {
  return prisma.collaborationGroupMessage
    .create({
      data: {
        groupId,
        authorId: actorId,
        content,
        messageType: "SYSTEM",
        status: "SENT",
      },
    })
    .catch(() => null);
}

export async function markGroupMessagesRead({
  groupId,
  userId,
  messageIds,
}: {
  groupId: string;
  userId: string;
  messageIds: string[];
}) {
  const uniqueMessageIds = [...new Set(messageIds)].filter(Boolean);
  if (!uniqueMessageIds.length) {
    return null;
  }
  const now = new Date();
  return prisma.collaborationGroupMessageRead
    .createMany({
      data: uniqueMessageIds.map((messageId) => ({
        groupId,
        userId,
        messageId,
        readAt: now,
      })),
      skipDuplicates: true,
    })
    .catch(() => null);
}

export async function touchUserPresence(userId: string) {
  return prisma.user
    .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
    .catch(() => null);
}
