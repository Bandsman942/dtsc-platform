import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterprisePreferenceView, getEnterpriseAiConversationPreferences } from "@/lib/assistant-conversation-preferences";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { enterpriseAiConversationCreateSchema, enterpriseAiConversationListSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const parsed = enterpriseAiConversationListSchema.safeParse({ organizationId: url.searchParams.get("organizationId") || "" });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const organizationId = parsed.data.organizationId;
  const access = await getEnterpriseAiAccess(session, organizationId, "read");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const conversations = await prisma.enterpriseAiConversation.findMany({
    where: { organizationId, userId: session.userId, status: { in: ["ACTIVE", "ARCHIVED"] }, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 80,
        select: { id: true, role: true, content: true, createdAt: true, updatedAt: true, editedAt: true, citationsJson: true, toolResultsJson: true },
      },
      project: { select: { id: true, name: true } },
      _count: { select: { messages: { where: { deletedAt: null } } } },
    },
  });
  const [projects, preferences] = await Promise.all([
    prisma.enterpriseAiConversationProject.findMany({
      where: { organizationId, userId: session.userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { conversations: { where: { status: "ACTIVE", deletedAt: null } } } } },
    }),
    getEnterpriseAiConversationPreferences({ conversationIds: conversations.map((item) => item.id), organizationId, userId: session.userId }),
  ]);
  const messageIds = conversations.flatMap((conversation) => conversation.messages.map((message) => message.id));
  const feedback = messageIds.length ? await prisma.enterpriseAiMessageFeedback.findMany({
    where: { organizationId, userId: session.userId, messageId: { in: messageIds } },
    select: { messageId: true, value: true },
  }) : [];
  const preferenceByConversationId = new Map(preferences.map((preference) => [preference.conversationId, preference]));
  const feedbackByMessageId = new Map(feedback.map((item) => [item.messageId, item.value]));

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId } });
  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      projectId: conversation.projectId,
      projectName: conversation.project?.name || conversation.projectName,
      status: conversation.status,
      archivedAt: conversation.archivedAt?.toISOString() || null,
      updatedAt: conversation.updatedAt.toISOString(),
      lastMessageAt: conversation.lastMessageAt?.toISOString() || null,
      preference: enterprisePreferenceView(preferenceByConversationId.get(conversation.id) || null),
      _count: conversation._count,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
        editedAt: message.editedAt?.toISOString() || null,
        citations: message.citationsJson,
        toolResults: message.toolResultsJson,
        feedbackValue: feedbackByMessageId.get(message.id) || null,
      })),
    })),
    projects: projects.map((project) => ({ id: project.id, name: project.name, updatedAt: project.updatedAt.toISOString(), _count: project._count })),
    permissions: { canChat: access.canChat, canUseReadTools: access.canUseReadTools, canUseActionDrafts: access.canUseActionDrafts },
  });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-conversation-create:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop de créations de conversations IA." }, { status: 429 });
  const parsed = enterpriseAiConversationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Création de conversation IA invalide." }, { status: 400 });
  const data = parsed.data;
  const access = await getEnterpriseAiAccess(session, data.organizationId, "chat");
  if (!access) return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });

  const projectNameInput = typeof data.projectName === "string" ? data.projectName.trim() : "";
  const projectIdInput = typeof data.projectId === "string" ? data.projectId.trim() : "";
  let project: { id: string; name: string } | null = null;
  if (projectIdInput) {
    project = await prisma.enterpriseAiConversationProject.findFirst({ where: { id: projectIdInput, organizationId: data.organizationId, userId: session.userId }, select: { id: true, name: true } });
    if (!project) return NextResponse.json({ error: "Not found", message: "Projet IA introuvable." }, { status: 404 });
  } else if (projectNameInput) {
    project = await prisma.enterpriseAiConversationProject.findFirst({ where: { organizationId: data.organizationId, userId: session.userId, name: projectNameInput }, select: { id: true, name: true } }) ||
      await prisma.enterpriseAiConversationProject.create({ data: { organizationId: data.organizationId, userId: session.userId, name: projectNameInput }, select: { id: true, name: true } });
  }

  const conversation = await prisma.$transaction(async (tx) => {
    const created = await tx.enterpriseAiConversation.create({
      data: { organizationId: data.organizationId, assistantId: access.assistantId, userId: session.userId, title: data.title?.trim() || "Nouvelle conversation", projectId: project?.id || null, projectName: project?.name || null },
      select: { id: true, title: true, projectId: true, projectName: true, updatedAt: true },
    });
    await tx.enterpriseAiConversationPreference.create({ data: { conversationId: created.id, organizationId: data.organizationId, userId: session.userId } });
    return created;
  });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_AI_CONVERSATION_CREATED", entity: "EnterpriseAiConversation", entityId: conversation.id, request: req, metadata: { organizationId: data.organizationId, projectId: project?.id || null } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, conversationId: conversation.id } });
  return NextResponse.json({ ok: true, conversation: { ...conversation, preference: enterprisePreferenceView(null), status: "ACTIVE", archivedAt: null, messages: [] } }, { status: 201 });
}
