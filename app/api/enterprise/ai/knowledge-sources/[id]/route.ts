import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { enterpriseAiKnowledgeActionSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_source_action_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-source-action:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = enterpriseAiKnowledgeActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const access = await getEnterpriseAiAccess(session, parsed.data.organizationId, "source_manage");
  if (!access || !access.canManageSources) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const source = await prisma.enterpriseAiKnowledgeSource.findFirst({ where: { id, organizationId: parsed.data.organizationId }, select: { id: true } });
  if (!source) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const saved = await prisma.enterpriseAiKnowledgeSource.update({
    where: { id },
    data: parsed.data.action === "archive" ? { status: "ARCHIVED", archivedAt: new Date() } : { status: "READY", archivedAt: null },
    select: { id: true, title: true, status: true, archivedAt: true },
  });
  await writeAuditLog({ userId: session.userId, action: parsed.data.action === "archive" ? "ENTERPRISE_AI_SOURCE_ARCHIVED" : "ENTERPRISE_AI_SOURCE_RESTORED", entity: "EnterpriseAiKnowledgeSource", entityId: id, request: req, metadata: { organizationId: parsed.data.organizationId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: parsed.data.organizationId, sourceId: id } });
  return NextResponse.json({ ok: true, source: { ...saved, archivedAt: saved.archivedAt?.toISOString() || null } });
}
