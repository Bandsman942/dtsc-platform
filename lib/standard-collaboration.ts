import { createHash } from "node:crypto";
import { Prisma, UserStatus, type UserRole } from "@prisma/client";
import { collaborationGroupScopeWhere } from "@/lib/collaboration";
import { collaboratorsNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

const ACTIVE_IDENTITY_LINK_STATUSES = ["ACTIVE", "APPROVED", "LINKED"];
const ACTIVE_PRESENCE_WINDOW_MS = 90_000;

export type AuthorizedCollaborator = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  role: UserRole;
  lastSeenAt: Date | null;
};

export function collaborationContextType(session: Pick<SessionPayload, "activeContext"> | null | undefined) {
  if (session?.activeContext === "DTSC_INTERNAL") return "DTSC_INTERNAL";
  if (session?.activeContext === "ORGANIZATION") return "ORGANIZATION";
  if (session?.activeContext === "COMMUNITY") return "COMMUNITY";
  return "PERSONAL";
}

export function directConversationKey(session: Pick<SessionPayload, "activeContext" | "activeOrganizationId">, leftUserId: string, rightUserId: string) {
  const users = [leftUserId, rightUserId].sort();
  const context = `${collaborationContextType(session)}:${getActiveOrganizationId(session) || "GLOBAL"}`;
  return createHash("sha256").update(`${context}:${users.join(":")}`).digest("hex");
}

export async function isCollaborationBlocked(leftUserId: string, rightUserId: string) {
  if (leftUserId === rightUserId) return false;
  const record = await prisma.collaborationUserBlock.findFirst({
    where: {
      revokedAt: null,
      OR: [
        { blockerId: leftUserId, blockedId: rightUserId },
        { blockerId: rightUserId, blockedId: leftUserId },
      ],
    },
    select: { id: true },
  });
  return Boolean(record);
}

async function authorizedOrganizationIds(session: SessionPayload) {
  const activeOrganizationId = getActiveOrganizationId(session);
  if (activeOrganizationId) return [activeOrganizationId];

  const [memberships, identityLinks] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { userId: session.userId, status: "ACTIVE", removedAt: null, organization: { status: "ACTIVE", deletedAt: null } },
      select: { organizationId: true },
      take: 100,
    }),
    prisma.enterpriseIdentityLink.findMany({
      where: { userId: session.userId, status: { in: ACTIVE_IDENTITY_LINK_STATUSES } },
      select: { organizationId: true },
      take: 100,
    }),
  ]);
  return [...new Set([...memberships.map((item) => item.organizationId), ...identityLinks.map((item) => item.organizationId)])];
}

export async function authorizedCollaboratorIds(session: SessionPayload) {
  const organizationIds = await authorizedOrganizationIds(session);
  const scopedGroupFilter = collaborationGroupScopeWhere(session);
  const [memberships, identityLinks, sharedGroupMembers, blocks] = await Promise.all([
    organizationIds.length
      ? prisma.organizationMember.findMany({
          where: {
            organizationId: { in: organizationIds },
            status: "ACTIVE",
            removedAt: null,
            user: { status: UserStatus.ACTIVE },
          },
          select: { userId: true },
          take: 2_000,
        })
      : Promise.resolve([]),
    organizationIds.length
      ? prisma.enterpriseIdentityLink.findMany({
          where: {
            organizationId: { in: organizationIds },
            status: { in: ACTIVE_IDENTITY_LINK_STATUSES },
            userId: { not: null },
          },
          select: { userId: true },
          take: 2_000,
        })
      : Promise.resolve([]),
    prisma.collaborationGroupMember.findMany({
      where: {
        userId: { not: session.userId },
        status: "ACTIVE",
        group: {
          status: "ACTIVE",
          members: { some: { userId: session.userId, status: "ACTIVE" } },
          ...scopedGroupFilter,
        },
      },
      select: { userId: true },
      take: 2_000,
    }),
    prisma.collaborationUserBlock.findMany({
      where: { revokedAt: null, OR: [{ blockerId: session.userId }, { blockedId: session.userId }] },
      select: { blockerId: true, blockedId: true },
      take: 2_000,
    }),
  ]);

  const blockedIds = new Set(blocks.map((item) => item.blockerId === session.userId ? item.blockedId : item.blockerId));
  const ids = new Set<string>();
  for (const item of memberships) ids.add(item.userId);
  for (const item of identityLinks) if (item.userId) ids.add(item.userId);
  for (const item of sharedGroupMembers) ids.add(item.userId);
  ids.delete(session.userId);
  for (const blockedId of blockedIds) ids.delete(blockedId);
  return [...ids];
}

export async function getAuthorizedCollaborators(session: SessionPayload, options: { query?: string; limit?: number } = {}) {
  const ids = await authorizedCollaboratorIds(session);
  if (!ids.length) return [] as AuthorizedCollaborator[];
  const query = options.query?.trim();
  const limit = Math.min(Math.max(options.limit || 80, 1), 100);
  return prisma.user.findMany({
    where: {
      id: { in: ids },
      status: UserStatus.ACTIVE,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { jobTitle: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, role: true, lastSeenAt: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: limit,
  });
}

export async function getCollaborationPresenceMap(userIds: string[]) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return new Map<string, Date>();
  const threshold = new Date(Date.now() - ACTIVE_PRESENCE_WINDOW_MS);
  const sessions = await prisma.collaborationPresenceSession.findMany({
    where: { userId: { in: ids }, disconnectedAt: null, lastHeartbeatAt: { gte: threshold } },
    select: { userId: true, lastHeartbeatAt: true },
    orderBy: { lastHeartbeatAt: "desc" },
    take: Math.min(ids.length * 3, 3_000),
  });
  const map = new Map<string, Date>();
  for (const item of sessions) if (!map.has(item.userId)) map.set(item.userId, item.lastHeartbeatAt);
  return map;
}

export async function resolveDirectConversation(session: SessionPayload, targetUserId: string) {
  if (targetUserId === session.userId) throw new Error("DIRECT_CONVERSATION_SELF");
  const allowedIds = await authorizedCollaboratorIds(session);
  if (!allowedIds.includes(targetUserId)) throw new Error("DIRECT_CONVERSATION_NOT_ALLOWED");
  if (await isCollaborationBlocked(session.userId, targetUserId)) throw new Error("DIRECT_CONVERSATION_BLOCKED");

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, status: UserStatus.ACTIVE },
    select: { id: true, name: true, jobTitle: true },
  });
  if (!target) throw new Error("DIRECT_CONVERSATION_NOT_FOUND");

  const directKey = directConversationKey(session, session.userId, targetUserId);
  const existing = await prisma.collaborationGroup.findUnique({ where: { directKey } });
  if (existing) return { group: existing, created: false };

  const organizationId = getActiveOrganizationId(session);
  try {
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.collaborationGroup.create({
        data: {
          name: target.name,
          description: target.jobTitle || "Conversation directe",
          groupType: "DIRECT",
          contextType: collaborationContextType(session),
          directKey,
          ownerId: session.userId,
          organizationId,
          visibility: "PRIVATE",
          lastActivityAt: new Date(),
          members: {
            create: [
              { userId: session.userId, role: "OWNER", status: "ACTIVE" },
              { userId: targetUserId, role: "MEMBER", status: "ACTIVE" },
            ],
          },
        },
      });
      await tx.collaborationGroupAuditLog.create({
        data: { groupId: created.id, actorId: session.userId, action: "direct.resolve", entityType: "CollaborationGroup", entityId: created.id },
      });
      return created;
    });
    await notifyUser({
      userId: targetUserId,
      title: "Nouvelle conversation professionnelle",
      body: `${session.name} a ouvert une conversation avec vous.`,
      type: "COLLABORATION",
      targetUrl: collaboratorsNotificationTarget(group.id),
      organizationId,
      idempotencyKey: `collaboration:direct:${directKey}:${targetUserId}`,
    });
    return { group, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const group = await prisma.collaborationGroup.findUnique({ where: { directKey } });
      if (group) return { group, created: false };
    }
    throw error;
  }
}

export function directConversationDisplayName<T extends { groupType: string; name: string; description?: string | null; members: Array<{ userId: string; user: { name: string; jobTitle?: string | null } }> }>(group: T, currentUserId: string): T {
  if (group.groupType !== "DIRECT") return group;
  const other = group.members.find((member) => member.userId !== currentUserId)?.user;
  return { ...group, name: other?.name || group.name, description: other?.jobTitle || "Conversation directe" };
}
