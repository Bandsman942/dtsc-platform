import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { createWorkflowDefinition, createWorkflowFromTemplate, listWorkflowDefinitions } from "@/lib/enterprise/workflows/definitions";
import { normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { ENTERPRISE_WORKFLOW_TEMPLATES } from "@/lib/enterprise/workflows/templates";
import { workflowDefinitionCreateSchema } from "@/lib/enterprise/workflows/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const templateRequestSchema = z.object({ templateCode: z.string().trim().min(1).max(80), locale: z.enum(["fr", "en"]).default("fr") });

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [definitions, legacyCount] = await Promise.all([listWorkflowDefinitions(organizationId), prisma.enterpriseWorkflow.count({ where: { organizationId } })]);
  const templates = ENTERPRISE_WORKFLOW_TEMPLATES.map((template) => ({
    code: template.code,
    nameFr: template.nameFr,
    nameEn: template.nameEn,
    descriptionFr: template.descriptionFr,
    descriptionEn: template.descriptionEn,
    triggerEntityType: template.triggerEntityType,
    triggerEventType: template.triggerEventType,
  }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-definitions" } });
  return NextResponse.json({ definitions, templates, legacy: { count: legacyCount, strategy: "CATALOG_READ_ONLY" }, permissions: access });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflows:${session.userId}`), 40, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canCreateDraft) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const templateParsed = templateRequestSchema.safeParse(body);
  const definitionParsed = workflowDefinitionCreateSchema.safeParse(body);
  if (!templateParsed.success && !definitionParsed.success) return NextResponse.json({ error: "INVALID_WORKFLOW_PAYLOAD", message: definitionParsed.error?.issues[0]?.message || templateParsed.error?.issues[0]?.message || "Workflow invalide." }, { status: 400 });
  try {
    const definition = templateParsed.success ? await createWorkflowFromTemplate(organizationId, session.userId, templateParsed.data.templateCode, templateParsed.data.locale) : await createWorkflowDefinition(organizationId, session.userId, definitionParsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_CREATED", entity: "EnterpriseWorkflowDefinition", entityId: definition.id, request: req, metadata: { organizationId, code: definition.code, source: templateParsed.success ? "TEMPLATE" : "MANUAL" } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-definitions" } });
    return NextResponse.json({ ok: true, definition }, { status: 201 });
  } catch (error) {
    const normalized = normalizeWorkflowError(error); await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-definitions", error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
