import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterprisePreferenceView, getEnterpriseAiConversationPreference } from "@/lib/assistant-conversation-preferences";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { enterpriseAiConversationListSchema, enterpriseAiConversationUpdateSchema } from "@/lib/enterprise-ai/validators";
import { isConfiguredOpenAIModel } from "@/lib/openai-config";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-conversation:${session.userId}`), 90, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions sur les conversations IA." }, { status: 429 });
  const parsed = enterpriseAiConversationUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Action de conversation invalide." }, { status: 400 });
  const data = parsed.data;
  const access = await getEnterpriseAiAccess(session, data.organizationId, "chat");
  if (!access) return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  const { id } = await params;
  const conversation = await prisma.enterpriseAiConversation.findFirst({
    where: { id, organizationId: data.organizationId, userId: session.userId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!conversation) return NextResponse.json({ error: "Not found", message: "Conversation IA introuvable." }, { status: 404 });

  if (typeof data.modelOverride !== "undefined") {
    const modelOverride = data.modelOverride?.trim() || "";
    if (modelOverride && !isConfiguredOpenAIModel(modelOverride)) return NextResponse.json({ error: "Model not configured" }, { status: 400 });
  }

  const now = new Date();
  let project: { id: string; name: string } | null | undefined;
  if (data.action === "update" && typeof data.projectId !== "undefined") {
    const projectId = data.projectId.trim();
    if (projectId) {
      project = await prisma.enterpriseAiConversationProject.findFirst({ where: { id: projectId, organizationId: data.organizationId, userId: session.userId }, select: { id: true, name: true } });
      if (!project) return NextResponse.json({ error: "Not found", message: "Projet IA introuvable." }, { status: 404 });
    } else project = null;
  } else if (data.action === "update" && typeof data.projectName !== "undefined") {
    const projectName = data.projectName.trim();
    project = projectName
      ? await prisma.enterpriseAiConversationProject.findFirst({ where: { organizationId: data.organizationId, userId: session.userId, name: projectName }, select: { id: true, name: true } }) ||
        await prisma.enterpriseAiConversationProject.create({ data: { organizationId: data.organizationId, userId: session.userId, name: projectName }, select: { id: true, name: true } })
      : null;
  }

  if (["update", "archive", "restore", "delete"].includes(data.action)) {
    await prisma.enterpriseAiConversation.update({
      where: { id },
      data: {
        ...(data.action === "archive" ? { status: "ARCHIVED", archivedAt: now } : {}),
        ...(data.action === "restore" ? { status: "ACTIVE", archivedAt: null } : {}),
        ...(data.action === "delete" ? { status: "DELETED", deletedAt: now } : {}),
        ...(data.action === "update" && data.title ? { title: data.title } : {}),
        ...(data.action === "update" && typeof project !== "undefined" ? { projectId: project?.id || null, projectName: project?.name || null } : {}),
      },
    });
  }

  const shouldTouchPreference = ["configure", "pin", "unpin"].includes(data.action) ||
    typeof data.modelOverride !== "undefined" || typeof data.responseStyle !== "undefined" || typeof data.responseLength !== "undefined" ||
    typeof data.useKnowledge !== "undefined" || typeof data.useTools !== "undefined" || typeof data.customInstructions !== "undefined";
  if (shouldTouchPreference) {
    const preferenceData = {
      ...(data.action === "pin" ? { pinnedAt: now } : {}),
      ...(data.action === "unpin" ? { pinnedAt: null } : {}),
      ...(typeof data.modelOverride !== "undefined" ? { modelOverride: data.modelOverride?.trim() || null } : {}),
      ...(typeof data.responseStyle !== "undefined" ? { responseStyle: data.responseStyle } : {}),
      ...(typeof data.responseLength !== "undefined" ? { responseLength: data.responseLength } : {}),
      ...(typeof data.useKnowledge !== "undefined" ? { useKnowledge: data.useKnowledge } : {}),
      ...(typeof data.useTools !== "undefined" ? { useTools: data.useTools } : {}),
      ...(typeof data.customInstructions !== "undefined" ? { customInstructions: data.customInstructions?.trim() || null } : {}),
    };
    await prisma.enterpriseAiConversationPreference.upsert({
      where: { conversationId: id },
      update: preferenceData,
      create: { conversationId: id, organizationId: data.organizationId, userId: session.userId, ...preferenceData },
    });
  }

  const preference = await getEnterpriseAiConversationPreference({ conversationId: id, organizationId: data.organizationId, userId: session.userId });
  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_AI_CONVERSATION_UPDATED",
    entity: "EnterpriseAiConversation",
    entityId: id,
    request: req,
    metadata: { organizationId: data.organizationId, action: data.action },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, conversationId: id } });
  return NextResponse.json({ ok: true, preference: enterprisePreferenceView(preference) });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const parsed = enterpriseAiConversationListSchema.safeParse({ organizationId: url.searchParams.get("organizationId") || "" });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query", message: "Organisation invalide." }, { status: 400 });
  const organizationId = parsed.data.organizationId;
  const access = await getEnterpriseAiAccess(session, organizationId, "chat");
  if (!access) return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  const { id } = await params;
  const now = new Date();
  const updated = await prisma.enterpriseAiConversation.updateMany({
    where: { id, organizationId, userId: session.userId, deletedAt: null },
    data: { status: "DELETED", deletedAt: now },
  });
  if (!updated.count) return NextResponse.json({ error: "Not found", message: "Conversation IA introuvable." }, { status: 404 });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_AI_CONVERSATION_DELETED", entity: "EnterpriseAiConversation", entityId: id, request: req, metadata: { organizationId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, conversationId: id } });
  return NextResponse.json({ ok: true });
}
