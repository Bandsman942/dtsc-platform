import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { enterpriseAiUsageQuerySchema, enterpriseAiSettingsUpdateSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const parsed = enterpriseAiUsageQuerySchema.safeParse({ organizationId: url.searchParams.get("organizationId") || "" });
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const access = (await getEnterpriseAiAccess(session, parsed.data.organizationId, "read")) || (await getEnterpriseAiAccess(session, parsed.data.organizationId, "settings"));
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await prisma.enterpriseAiSetting.upsert({
    where: { organizationId: parsed.data.organizationId },
    create: { organizationId: parsed.data.organizationId, updatedById: session.userId },
    update: {},
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: parsed.data.organizationId } });
  return NextResponse.json({
    settings: {
      enabled: settings.enabled,
      defaultLanguage: settings.defaultLanguage,
      allowKnowledgeUpload: settings.allowKnowledgeUpload,
      allowReadTools: settings.allowReadTools,
      allowActionDrafts: settings.allowActionDrafts,
      retentionDays: settings.retentionDays,
    },
    permissions: { canManageSettings: access.canManageSettings },
  });
}

export async function PATCH(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_settings_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-settings:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = enterpriseAiSettingsUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Paramètres IA invalides." }, { status: 400 });
  }
  const access = await getEnterpriseAiAccess(session, parsed.data.organizationId, "settings");
  if (!access || !access.canManageSettings) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await prisma.enterpriseAiSetting.upsert({
    where: { organizationId: parsed.data.organizationId },
    create: { ...parsed.data, updatedById: session.userId },
    update: {
      enabled: parsed.data.enabled,
      defaultLanguage: parsed.data.defaultLanguage,
      allowKnowledgeUpload: parsed.data.allowKnowledgeUpload,
      allowReadTools: parsed.data.allowReadTools,
      allowActionDrafts: parsed.data.allowActionDrafts,
      retentionDays: parsed.data.retentionDays,
      updatedById: session.userId,
    },
  });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_AI_SETTINGS_UPDATED", entity: "EnterpriseAiSetting", entityId: settings.id, request: req, metadata: { organizationId: parsed.data.organizationId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: parsed.data.organizationId } });
  return NextResponse.json({ ok: true, settings });
}
