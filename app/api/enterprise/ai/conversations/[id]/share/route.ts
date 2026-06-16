import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, groupMemberUserIds, markGroupMessagesRead, writeGroupAudit } from "@/lib/collaboration";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { enterpriseAiConversationShareSchema } from "@/lib/enterprise-ai/validators";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

const jsonValue = (value: unknown) => value as Prisma.InputJsonValue;

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_share_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-share:${session.userId}`), 50, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de partages IA en peu de temps." }, { status: 429 });
  }
  const parsed = enterpriseAiConversationShareSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Partage IA invalide." }, { status: 400 });
  }
  const data = parsed.data;
  const access = await getEnterpriseAiAccess(session, data.organizationId, "read");
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  }
  const member = await assertGroupMemberForSession(data.groupId, session);
  if (!member || member.group.status !== "ACTIVE" || member.group.organizationId !== data.organizationId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, groupId: data.groupId } });
    return NextResponse.json({ error: "Forbidden", message: "Groupe de collaborateurs non autorisé." }, { status: 403 });
  }
  const { id } = await params;
  const conversation = await prisma.enterpriseAiConversation.findFirst({
    where: { id, organizationId: data.organizationId, userId: session.userId, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      title: true,
      projectName: true,
      updatedAt: true,
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 300,
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });
  if (!conversation) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Not found", message: "Conversation IA introuvable." }, { status: 404 });
  }

  const content = data.content || `Conversation IA Entreprise partagée: ${conversation.title}`;
  const message = await prisma.$transaction(async (tx) => {
    const savedMessage = await tx.collaborationGroupMessage.create({
      data: {
        groupId: data.groupId,
        authorId: session.userId,
        content,
        messageType: "ENTERPRISE_AI_SHARE",
      },
    });
    await tx.collaborationSharedConversation.create({
      data: {
        originalConversationId: null,
        sharedById: session.userId,
        groupId: data.groupId,
        messageId: savedMessage.id,
        title: conversation.title,
        snapshotJson: jsonValue({
          sourceType: "ENTERPRISE_AI",
          organizationId: data.organizationId,
          conversationId: conversation.id,
          title: conversation.title,
          projectName: conversation.projectName,
          updatedAt: conversation.updatedAt.toISOString(),
          messages: conversation.messages.map((item) => ({
            id: item.id,
            role: item.role,
            content: item.content,
            createdAt: item.createdAt.toISOString(),
          })),
        }),
      },
    });
    return tx.collaborationGroupMessage.findUniqueOrThrow({
      where: { id: savedMessage.id },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } },
        sharedConversationSnapshot: { select: { id: true, title: true, status: true, createdAt: true, deletedAt: true } },
      },
    });
  });
  await markGroupMessagesRead({ groupId: data.groupId, userId: session.userId, messageIds: [message.id] });
  const recipients = (await groupMemberUserIds(data.groupId)).filter((userId) => userId !== session.userId);
  await notifyUsers({
    userIds: recipients,
    title: "Conversation IA Entreprise partagée",
    body: `${session.name}: ${content.slice(0, 160)}`,
    type: "COLLABORATION",
    targetUrl: "/collaborators",
    organizationId: data.organizationId,
  });
  await writeGroupAudit({ groupId: data.groupId, actorId: session.userId, action: "enterprise_ai.share", entityType: "CollaborationGroupMessage", entityId: message.id });
  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_AI_CONVERSATION_SHARED",
    entity: "EnterpriseAiConversation",
    entityId: id,
    request: req,
    metadata: { organizationId: data.organizationId, groupId: data.groupId, messageId: message.id },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, conversationId: id, groupId: data.groupId } });
  return NextResponse.json({ ok: true, message }, { status: 201 });
}
