import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { archiveWorkflowDefinition, getWorkflowDefinition, getWorkflowVersionReadiness, updateWorkflowDefinition } from "@/lib/enterprise/workflows/definitions";
import { normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { workflowDefinitionUpdateSchema } from "@/lib/enterprise/workflows/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const definition = await getWorkflowDefinition(organizationId, id);
    const readinessEntries = await Promise.all(definition.versions.filter((version) => version.status === "DRAFT").map(async (version) => [version.id, await getWorkflowVersionReadiness(organizationId, id, version.id)] as const));
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-definition", definitionId: id } });
    return NextResponse.json({ definition, readiness: Object.fromEntries(readinessEntries), permissions: access });
  } catch (error) { const normalized = normalizeWorkflowError(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflow-update:${session.userId}`), 80, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canEditDraft) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = workflowDefinitionUpdateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "INVALID_WORKFLOW_PAYLOAD", message: parsed.error.issues[0]?.message || "Workflow invalide." }, { status: 400 });
  try {
    const definition = await updateWorkflowDefinition(organizationId, id, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_UPDATED", entity: "EnterpriseWorkflowDefinition", entityId: id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-definition", definitionId: id } });
    return NextResponse.json({ ok: true, definition });
  } catch (error) { const normalized = normalizeWorkflowError(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflow-archive:${session.userId}`), 30, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canRetire) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await archiveWorkflowDefinition(organizationId, id, session.userId);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_ARCHIVED", entity: "EnterpriseWorkflowDefinition", entityId: id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-definition", definitionId: id } });
    return NextResponse.json({ ok: true });
  } catch (error) { const normalized = normalizeWorkflowError(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
