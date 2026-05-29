import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, groupMemberUserIds, markGroupMessagesRead, parseMentionedUserIds, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { notifyUsers } from "@/lib/notifications";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { collaborationMessageSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 30), 1), 50);
  const cursor = url.searchParams.get("cursor") || undefined;
  const records = await prisma.collaborationGroupMessage.findMany({
    where: { groupId: id, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } },
      replyTo: { select: { id: true, content: true, author: { select: { id: true, name: true } }, createdAt: true, deletedAt: true } },
      mentions: { include: { mentionedUser: { select: { id: true, name: true, email: true, jobTitle: true } } } },
      reads: { select: { userId: true, readAt: true } },
      sharedChatbotConversation: { select: { id: true, title: true, updatedAt: true } },
      sharedConversationSnapshot: { select: { id: true, title: true, status: true, createdAt: true, deletedAt: true } },
    },
  });
  const hasMore = records.length > limit;
  const messages = records.slice(0, limit).reverse();
  const nextCursor = hasMore ? records[limit - 1]?.createdAt.toISOString() : null;
  await markGroupMessagesRead({ groupId: id, userId: session.userId, messageIds: messages.map((message) => message.id) });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ messages, nextCursor, hasMore });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || member.group.status !== "ACTIVE") {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = collaborationMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  const organizationId = getActiveOrganizationId(session);
  const sharedConversation = parsed.data.sharedChatbotConversationId
    ? await prisma.conversation.findFirst({
      where: { id: parsed.data.sharedChatbotConversationId, userId: session.userId, organizationId },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: 300,
          select: { id: true, role: true, content: true, createdAt: true },
        },
      },
    })
    : null;
  if (parsed.data.sharedChatbotConversationId && !sharedConversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  const memberUserIds = await groupMemberUserIds(id);
  const mentionedUserIds = await parseMentionedUserIds(parsed.data.mentionedUserIds, memberUserIds);
  const message = await prisma.$transaction(async (tx) => {
    const savedMessage = await tx.collaborationGroupMessage.create({
      data: {
        groupId: id,
        authorId: session.userId,
        content: parsed.data.content,
        messageType: parsed.data.messageType,
        replyToId: parsed.data.replyToId || null,
        sharedChatbotConversationId: parsed.data.sharedChatbotConversationId || null,
        mentions: { create: mentionedUserIds.map((mentionedUserId) => ({ mentionedUserId, isRead: mentionedUserId === session.userId })) },
      },
    });
    if (sharedConversation) {
      await tx.collaborationSharedConversation.create({
        data: {
          originalConversationId: sharedConversation.id,
          sharedById: session.userId,
          groupId: id,
          messageId: savedMessage.id,
          title: sharedConversation.title,
          snapshotJson: {
            conversationId: sharedConversation.id,
            title: sharedConversation.title,
            updatedAt: sharedConversation.updatedAt.toISOString(),
            messages: sharedConversation.messages.map((item) => ({
              id: item.id,
              role: item.role,
              content: item.content,
              createdAt: item.createdAt.toISOString(),
            })),
          },
        },
      });
    }
    return tx.collaborationGroupMessage.findUniqueOrThrow({
      where: { id: savedMessage.id },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } },
        replyTo: { select: { id: true, content: true, author: { select: { id: true, name: true } }, createdAt: true, deletedAt: true } },
        mentions: { include: { mentionedUser: { select: { id: true, name: true, email: true, jobTitle: true } } } },
        reads: { select: { userId: true, readAt: true } },
        sharedChatbotConversation: { select: { id: true, title: true, updatedAt: true } },
        sharedConversationSnapshot: { select: { id: true, title: true, status: true, createdAt: true, deletedAt: true } },
      },
    });
  });
  await markGroupMessagesRead({ groupId: id, userId: session.userId, messageIds: [message.id] });

  const recipients = mentionedUserIds.length
    ? mentionedUserIds.filter((userId) => userId !== session.userId)
    : memberUserIds.filter((userId) => userId !== session.userId);
  await notifyUsers({
    userIds: [...new Set(recipients)],
    title: mentionedUserIds.length ? "Mention dans un groupe DTSC" : "Nouveau message de groupe",
    body: `${session.name}: ${parsed.data.content.slice(0, 160)}`,
    type: "COLLABORATION",
    targetUrl: "/collaborators",
    organizationId: member.group.organizationId,
  });
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "message.create", entityType: "CollaborationGroupMessage", entityId: message.id });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, message }, { status: 201 });
}
