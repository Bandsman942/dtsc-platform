import { NextResponse } from "next/server";
import { UserStatus, type Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { createGroupSystemMessage, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { notifyUser } from "@/lib/notifications";
import {
  DTSC_INTERNAL_ORGANIZATION_ID,
  getActiveOrganizationId,
  hasActiveOrganizationSubscription,
  isDtscInternalSession,
} from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { collaborationGroupSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);
  const activeOrganizationId = getActiveOrganizationId(session);
  const organizationSubscriptionActive = await hasActiveOrganizationSubscription(activeOrganizationId);
  if (activeOrganizationId && activeOrganizationId !== DTSC_INTERNAL_ORGANIZATION_ID && !organizationSubscriptionActive) {
    await writeApiLog({ request: req, statusCode: 402, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Subscription required", groups: [], invitations: [], users: [] }, { status: 402 });
  }
  const crossOrganizationGroupFilter: Prisma.CollaborationGroupWhereInput = { groupType: { in: ["CROSS_ORGANIZATION", "PRIVATE_NETWORK", "DTSC_SUPPORT"] } };
  const scopedGroupFilter: Prisma.CollaborationGroupWhereInput = isDtscInternalSession(session)
    ? { OR: [{ organizationId: DTSC_INTERNAL_ORGANIZATION_ID }, { organizationId: null }] }
    : activeOrganizationId && organizationSubscriptionActive
      ? { OR: [{ organizationId: activeOrganizationId }, crossOrganizationGroupFilter] }
      : crossOrganizationGroupFilter;

  const [groups, invitations, users] = await Promise.all([
    prisma.collaborationGroup.findMany({
      where: {
        status: "ACTIVE",
        members: { some: { userId: session.userId, status: "ACTIVE" } },
        ...scopedGroupFilter,
      },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        members: {
          where: { status: "ACTIVE" },
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } } },
          orderBy: { joinedAt: "asc" },
        },
        invitations: {
          where: { status: "PENDING" },
          include: { invitedUser: { select: { id: true, name: true, email: true } }, invitedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { name: true } } },
        },
        calls: {
          orderBy: { startedAt: "desc" },
          take: 5,
          include: { participants: true },
        },
        _count: { select: { messages: true, members: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.collaborationGroupInvitation.findMany({
      where: {
        status: "PENDING",
        OR: [{ invitedUserId: session.userId }, { invitedEmail: session.email.toLowerCase() }],
        group: { is: scopedGroupFilter },
      },
      include: { group: { select: { id: true, name: true, description: true } }, invitedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, role: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);
  const groupIds = groups.map((group) => group.id);
  const unreadMentions = groupIds.length
    ? await prisma.collaborationMessageMention.findMany({
        where: {
          mentionedUserId: session.userId,
          isRead: false,
          message: { groupId: { in: groupIds }, deletedAt: null },
        },
        select: { message: { select: { groupId: true, content: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const unreadMessages = groupIds.length
    ? await prisma.collaborationGroupMessage.groupBy({
        by: ["groupId"],
        where: {
          groupId: { in: groupIds },
          authorId: { not: session.userId },
          deletedAt: null,
          messageType: { not: "SYSTEM" },
          reads: { none: { userId: session.userId } },
        },
        _count: { _all: true },
      })
    : [];
  const unreadMentionByGroup = new Map<string, { count: number; preview: string; createdAt: Date }>();
  const unreadMessageByGroup = new Map(unreadMessages.map((item) => [item.groupId, item._count._all]));
  for (const mention of unreadMentions) {
    const current = unreadMentionByGroup.get(mention.message.groupId);
    unreadMentionByGroup.set(mention.message.groupId, {
      count: (current?.count || 0) + 1,
      preview: current?.preview || mention.message.content,
      createdAt: current?.createdAt || mention.message.createdAt,
    });
  }
  const groupsWithMentionState = groups.map((group) => {
    const mention = unreadMentionByGroup.get(group.id);
    return {
      ...group,
      unreadMessageCount: unreadMessageByGroup.get(group.id) || 0,
      unreadMentionCount: mention?.count || 0,
      unreadMentionPreview: mention?.preview || null,
      lastMentionAt: mention?.createdAt || null,
    };
  });

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ groups: groupsWithMentionState, invitations, users });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = collaborationGroupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid group" }, { status: 400 });
  }

  const activeOrganizationId = getActiveOrganizationId(session);
  const organizationSubscriptionActive = await hasActiveOrganizationSubscription(activeOrganizationId);
  const isCrossOrganizationGroup = parsed.data.groupType === "CROSS_ORGANIZATION" || parsed.data.groupType === "PRIVATE_NETWORK" || parsed.data.groupType === "DTSC_SUPPORT";
  if (activeOrganizationId && activeOrganizationId !== DTSC_INTERNAL_ORGANIZATION_ID && !organizationSubscriptionActive && !isCrossOrganizationGroup) {
    await writeApiLog({ request: req, statusCode: 402, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Subscription required" }, { status: 402 });
  }

  const organizationId = activeOrganizationId && (!isCrossOrganizationGroup || activeOrganizationId === DTSC_INTERNAL_ORGANIZATION_ID)
    ? activeOrganizationId
    : null;
  const group = await prisma.collaborationGroup.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      groupType: parsed.data.groupType,
      visibility: parsed.data.visibility,
      ownerId: session.userId,
      organizationId,
      members: {
        create: { userId: session.userId, role: "OWNER", status: "ACTIVE" },
      },
    },
    include: { members: true },
  });

  await createGroupSystemMessage({ groupId: group.id, actorId: session.userId, content: `${session.name} a créé le groupe.` });
  await writeGroupAudit({ groupId: group.id, actorId: session.userId, action: "group.create", entityType: "CollaborationGroup", entityId: group.id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.group.create", entity: "CollaborationGroup", entityId: group.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  await notifyUser({ userId: session.userId, title: "Groupe collaboratif créé", body: group.name, type: "COLLABORATION", targetUrl: "/collaborators", organizationId });

  return NextResponse.json({ ok: true, group }, { status: 201 });
}
