import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { enterpriseAiConversationUpdateSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_conversation_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-conversation:${session.userId}`), 90, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'actions sur les conversations IA." }, { status: 429 });
  }
  const parsed = enterpriseAiConversationUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Action de conversation invalide." }, { status: 400 });
  }
  const data = parsed.data;
  const access = await getEnterpriseAiAccess(session, data.organizationId, "chat");
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  }
  const { id } = await params;
  const conversation = await prisma.enterpriseAiConversation.findFirst({
    where: { id, organizationId: data.organizationId, userId: session.userId, deletedAt: null },
    select: { id: true },
  });
  if (!conversation) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Not found", message: "Conversation IA introuvable." }, { status: 404 });
  }

  const now = new Date();
  const projectName = typeof data.projectName === "string" ? data.projectName.trim() || null : undefined;
  const updated = await prisma.enterpriseAiConversation.update({
    where: { id },
    data: {
      ...(data.action === "archive" ? { status: "ARCHIVED", archivedAt: now } : {}),
      ...(data.action === "restore" ? { status: "ACTIVE", archivedAt: null } : {}),
      ...(data.action === "delete" ? { status: "DELETED", deletedAt: now } : {}),
      ...(data.action === "update" && data.title ? { title: data.title } : {}),
      ...(data.action === "update" && typeof projectName !== "undefined" ? { projectName } : {}),
    },
    select: { id: true, title: true, projectName: true, status: true, updatedAt: true },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_AI_CONVERSATION_UPDATED",
    entity: "EnterpriseAiConversation",
    entityId: id,
    request: req,
    metadata: { organizationId: data.organizationId, action: data.action },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, conversationId: id } });
  return NextResponse.json({ ok: true, conversation: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_conversation_delete_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId") || "";
  const access = organizationId ? await getEnterpriseAiAccess(session, organizationId, "chat") : null;
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { organizationId } });
    return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  }
  const { id } = await params;
  const now = new Date();
  const updated = await prisma.enterpriseAiConversation.updateMany({
    where: { id, organizationId, userId: session.userId, deletedAt: null },
    data: { status: "DELETED", deletedAt: now },
  });
  if (!updated.count) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { organizationId } });
    return NextResponse.json({ error: "Not found", message: "Conversation IA introuvable." }, { status: 404 });
  }
  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_AI_CONVERSATION_DELETED",
    entity: "EnterpriseAiConversation",
    entityId: id,
    request: req,
    metadata: { organizationId },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, conversationId: id } });
  return NextResponse.json({ ok: true });
}
