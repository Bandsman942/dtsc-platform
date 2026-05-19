import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMember, groupMemberUserIds, parseMentionedUserIds, writeGroupAudit } from "@/lib/collaboration";
import { notifyUsers } from "@/lib/notifications";
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
  const { id } = await params;
  const member = await assertGroupMember(id, session.userId);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const messages = await prisma.collaborationGroupMessage.findMany({
    where: { groupId: id },
    orderBy: { createdAt: "asc" },
    take: 300,
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true } },
      mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
      sharedChatbotConversation: { select: { id: true, title: true, updatedAt: true } },
    },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ messages });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const member = await assertGroupMember(id, session.userId);
  if (!member || member.group.status !== "ACTIVE") {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = collaborationMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  if (parsed.data.sharedChatbotConversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: parsed.data.sharedChatbotConversationId, userId: session.userId },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  }
  const memberUserIds = await groupMemberUserIds(id);
  const mentionedUserIds = await parseMentionedUserIds(parsed.data.mentionedUserIds, memberUserIds);
  const message = await prisma.collaborationGroupMessage.create({
    data: {
      groupId: id,
      authorId: session.userId,
      content: parsed.data.content,
      messageType: parsed.data.messageType,
      replyToId: parsed.data.replyToId || null,
      sharedChatbotConversationId: parsed.data.sharedChatbotConversationId || null,
      mentions: { create: mentionedUserIds.map((mentionedUserId) => ({ mentionedUserId })) },
    },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true } },
      mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
      sharedChatbotConversation: { select: { id: true, title: true, updatedAt: true } },
    },
  });

  const recipients = [...new Set([...mentionedUserIds, ...memberUserIds.filter((userId) => userId !== session.userId)])];
  await notifyUsers({
    userIds: recipients,
    title: mentionedUserIds.length ? "Mention dans un groupe DTSC" : "Nouveau message de groupe",
    body: `${session.name}: ${parsed.data.content.slice(0, 160)}`,
    type: "COLLABORATION",
    targetUrl: "/collaborators",
  });
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "message.create", entityType: "CollaborationGroupMessage", entityId: message.id });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, message }, { status: 201 });
}
