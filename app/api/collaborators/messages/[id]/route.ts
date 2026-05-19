import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { canManageGroup, groupMemberUserIds, parseMentionedUserIds, writeGroupAudit } from "@/lib/collaboration";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { collaborationMessageUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const message = await prisma.collaborationGroupMessage.findUnique({
    where: { id },
    include: { group: { include: { members: { where: { userId: session.userId, status: "ACTIVE" } } } } },
  });
  const member = message?.group.members[0] || null;
  if (!message || (!canManageGroup(member, session.role) && message.authorId !== session.userId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = collaborationMessageUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  const memberUserIds = await groupMemberUserIds(message.groupId);
  const mentionedUserIds = await parseMentionedUserIds(parsed.data.mentionedUserIds, memberUserIds);
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.collaborationGroupMessage.update({
      where: { id },
      data: {
        ...(parsed.data.content ? { content: parsed.data.content, status: parsed.data.status || "EDITED" } : {}),
        ...(parsed.data.status === "DELETED" ? { status: "DELETED", deletedAt: new Date() } : {}),
        ...(parsed.data.status === "ARCHIVED" ? { status: "ARCHIVED" } : {}),
      },
    });
    await tx.collaborationMessageMention.deleteMany({ where: { messageId: id } });
    if (mentionedUserIds.length) {
      await tx.collaborationMessageMention.createMany({
        data: mentionedUserIds.map((mentionedUserId) => ({ messageId: id, mentionedUserId, isRead: mentionedUserId === session.userId })),
        skipDuplicates: true,
      });
    }
    if (parsed.data.status === "DELETED" || parsed.data.status === "ARCHIVED") {
      await tx.collaborationSharedConversation.updateMany({
        where: { messageId: id },
        data: { status: parsed.data.status, deletedAt: parsed.data.status === "DELETED" ? new Date() : null },
      });
    }
    return saved;
  });
  if (mentionedUserIds.length) {
    await notifyUsers({
      userIds: mentionedUserIds.filter((userId) => userId !== session.userId),
      title: "Mention dans un message DTSC",
      body: parsed.data.content?.slice(0, 160) || "Vous avez été mentionné dans un groupe.",
      type: "COLLABORATION",
      targetUrl: "/collaborators",
    });
  }
  await writeGroupAudit({ groupId: message.groupId, actorId: session.userId, action: "message.update", entityType: "CollaborationGroupMessage", entityId: id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, message: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const message = await prisma.collaborationGroupMessage.findUnique({
    where: { id },
    include: { group: { include: { members: { where: { userId: session.userId, status: "ACTIVE" } } } } },
  });
  const member = message?.group.members[0] || null;
  if (!message || (!canManageGroup(member, session.role) && message.authorId !== session.userId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.collaborationGroupMessage.update({
      where: { id },
      data: { status: "DELETED", deletedAt },
    });
    await tx.collaborationSharedConversation.updateMany({
      where: { messageId: id },
      data: { status: "DELETED", deletedAt },
    });
  });
  await writeGroupAudit({ groupId: message.groupId, actorId: session.userId, action: "message.delete", entityType: "CollaborationGroupMessage", entityId: id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
