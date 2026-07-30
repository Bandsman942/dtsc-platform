import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { enterpriseAiMessageUpdateSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-message:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions sur les messages IA." }, { status: 429 });
  const parsed = enterpriseAiMessageUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Action de message invalide." }, { status: 400 });
  const data = parsed.data;
  const access = await getEnterpriseAiAccess(session, data.organizationId, "chat");
  if (!access) return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  const { id } = await params;
  const message = await prisma.enterpriseAiMessage.findFirst({
    where: { id, organizationId: data.organizationId, deletedAt: null, conversation: { userId: session.userId, deletedAt: null } },
    select: { id: true, role: true, userId: true, conversationId: true },
  });
  if (!message) return NextResponse.json({ error: "Not found", message: "Message IA introuvable." }, { status: 404 });

  if (data.action === "feedback") {
    if (message.role !== "assistant") return NextResponse.json({ error: "Forbidden", message: "Le feedback s'applique uniquement aux réponses de l'assistant." }, { status: 403 });
    if (data.feedbackValue === null) {
      await prisma.enterpriseAiMessageFeedback.deleteMany({ where: { messageId: id, organizationId: data.organizationId, userId: session.userId } });
    } else if (data.feedbackValue === 1 || data.feedbackValue === -1) {
      await prisma.enterpriseAiMessageFeedback.upsert({
        where: { messageId: id },
        update: { value: data.feedbackValue, organizationId: data.organizationId, userId: session.userId },
        create: { messageId: id, organizationId: data.organizationId, userId: session.userId, value: data.feedbackValue },
      });
    } else {
      return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
    }
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_AI_MESSAGE_FEEDBACK", entity: "EnterpriseAiMessage", entityId: id, request: req, metadata: { organizationId: data.organizationId, value: data.feedbackValue ?? null } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, messageId: id, action: "feedback" } });
    return NextResponse.json({ ok: true, feedbackValue: data.feedbackValue ?? null });
  }

  if (data.action === "edit" && (message.role !== "user" || message.userId !== session.userId || !data.content)) {
    return NextResponse.json({ error: "Forbidden", message: "Seuls vos messages utilisateur peuvent être modifiés." }, { status: 403 });
  }
  const now = new Date();
  const updated = await prisma.enterpriseAiMessage.update({
    where: { id },
    data: data.action === "delete" ? { deletedAt: now } : { content: data.content, editedAt: now },
    select: { id: true, role: true, content: true, createdAt: true, updatedAt: true, editedAt: true, deletedAt: true },
  });
  await prisma.enterpriseAiConversation.update({ where: { id: message.conversationId }, data: { updatedAt: now } });
  await writeAuditLog({ userId: session.userId, action: data.action === "delete" ? "ENTERPRISE_AI_MESSAGE_DELETED" : "ENTERPRISE_AI_MESSAGE_EDITED", entity: "EnterpriseAiMessage", entityId: id, request: req, metadata: { organizationId: data.organizationId, conversationId: message.conversationId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, messageId: id } });
  return NextResponse.json({ ok: true, message: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId") || "";
  const access = organizationId ? await getEnterpriseAiAccess(session, organizationId, "chat") : null;
  if (!access) return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  const { id } = await params;
  const message = await prisma.enterpriseAiMessage.findFirst({
    where: { id, organizationId, deletedAt: null, conversation: { userId: session.userId, deletedAt: null } },
    select: { id: true, conversationId: true },
  });
  if (!message) return NextResponse.json({ error: "Not found", message: "Message IA introuvable." }, { status: 404 });
  const now = new Date();
  await prisma.enterpriseAiMessage.update({ where: { id }, data: { deletedAt: now } });
  await prisma.enterpriseAiConversation.update({ where: { id: message.conversationId }, data: { updatedAt: now } });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_AI_MESSAGE_DELETED", entity: "EnterpriseAiMessage", entityId: id, request: req, metadata: { organizationId, conversationId: message.conversationId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, messageId: id } });
  return NextResponse.json({ ok: true });
}
