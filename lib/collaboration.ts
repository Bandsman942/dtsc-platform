import { UserRole } from "@prisma/client";
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
