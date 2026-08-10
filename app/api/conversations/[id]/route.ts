import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { chatPreferenceView, getChatConversationPreference } from "@/lib/assistant-conversation-preferences";
import { isCatalogAiModelAllowed } from "@/lib/ai/catalog";
import { getAiErrorMessage } from "@/lib/ai/i18n";
import { writeApiLog } from "@/lib/audit";
import { getCanonicalAiUsageLimits } from "@/lib/billing/ai-usage-limits";
import { chatConversationActionSchema } from "@/lib/chat-conversation-validators";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  void req;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: session.userId, organizationId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const preference = await getChatConversationPreference({ conversationId: id, userId: session.userId, organizationId });
  return NextResponse.json({ conversation: { ...conversation, preference: chatPreferenceView(preference) } });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "conversation_update_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `conversation-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = chatConversationActionSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid conversation update" }, { status: 400 });

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const existing = await prisma.conversation.findFirst({
    where: { id, userId: session.userId, organizationId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const data = body.data;
  if (typeof data.modelOverride !== "undefined") {
    const modelOverride = data.modelOverride?.trim() || "";
    const userLocale = await prisma.user.findUnique({ where: { id: session.userId }, select: { locale: true } });
    const context = organizationId ? "ORGANIZATION" : session.activeContext === "DTSC_INTERNAL" ? "DTSC_INTERNAL" : "PERSONAL";
    const planCode = context === "DTSC_INTERNAL"
      ? "ENTERPRISE"
      : (await getCanonicalAiUsageLimits({ userId: session.userId, organizationId })).planCode;
    if (modelOverride && !isCatalogAiModelAllowed({ modelCode: modelOverride, context, locale: userLocale?.locale || "fr", planCode })) {
      return NextResponse.json({ reasonCode: "MODEL_UNAVAILABLE", message: getAiErrorMessage("MODEL_UNAVAILABLE", userLocale?.locale) }, { status: 400 });
    }
  }

  if (data.action === "update") {
    let projectName = data.projectName || null;
    const projectId = data.projectId || null;
    if (projectId) {
      const project = await prisma.conversationProject.findFirst({
        where: { id: projectId, userId: session.userId, organizationId },
        select: { id: true, name: true },
      });
      if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
      projectName = project.name;
    }
    await prisma.conversation.update({
      where: { id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(typeof data.projectName !== "undefined" || typeof data.projectId !== "undefined" ? { projectName, projectId } : {}),
      },
    });
  }

  const now = new Date();
  const shouldTouchPreference = data.action !== "update" ||
    typeof data.modelOverride !== "undefined" || typeof data.responseStyle !== "undefined" ||
    typeof data.responseLength !== "undefined" || typeof data.useCompanyContext !== "undefined" ||
    typeof data.useKnowledge !== "undefined" || typeof data.customInstructions !== "undefined";

  if (shouldTouchPreference) {
    const preferenceData = {
      ...(data.action === "pin" ? { pinnedAt: now } : {}),
      ...(data.action === "unpin" ? { pinnedAt: null } : {}),
      ...(data.action === "archive" ? { archivedAt: now, pinnedAt: null } : {}),
      ...(data.action === "restore" ? { archivedAt: null } : {}),
      ...(typeof data.modelOverride !== "undefined" ? { modelOverride: data.modelOverride?.trim() || null } : {}),
      ...(typeof data.responseStyle !== "undefined" ? { responseStyle: data.responseStyle || null } : {}),
      ...(typeof data.responseLength !== "undefined" ? { responseLength: data.responseLength || null } : {}),
      ...(typeof data.useCompanyContext !== "undefined" ? { useCompanyContext: data.useCompanyContext } : {}),
      ...(typeof data.useKnowledge !== "undefined" ? { useKnowledge: data.useKnowledge } : {}),
      ...(typeof data.customInstructions !== "undefined" ? { customInstructions: data.customInstructions?.trim() || null } : {}),
    };
    await prisma.chatConversationPreference.upsert({
      where: { conversationId: id },
      update: preferenceData,
      create: { conversationId: id, userId: session.userId, organizationId, ...preferenceData },
    });
  }

  const preference = await getChatConversationPreference({ conversationId: id, userId: session.userId, organizationId });
  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { action: `conversation_${data.action}`, conversationId: id },
  });
  return NextResponse.json({ ok: true, preference: chatPreferenceView(preference) });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "conversation_delete_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const existing = await prisma.conversation.findFirst({ where: { id, userId: session.userId, organizationId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.chatConversationPreference.deleteMany({ where: { conversationId: id, userId: session.userId, organizationId } }),
    prisma.conversation.deleteMany({ where: { id, userId: session.userId, organizationId } }),
  ]);

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "conversation_delete", conversationId: id } });
  return NextResponse.json({ ok: true });
}
