import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { startWorkflowRun } from "@/lib/enterprise/workflows/engine";
import { normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { workflowManualStartSchema } from "@/lib/enterprise/workflows/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflow-start:${session.userId}`), 60, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canStartManual) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = workflowManualStartSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "INVALID_WORKFLOW_START", message: parsed.error.issues[0]?.message || "Lancement invalide." }, { status: 400 });
  try {
    const run = await startWorkflowRun({ organizationId, workflowDefinitionId: parsed.data.workflowDefinitionId, sourceEntityType: parsed.data.sourceEntityType, sourceEntityId: parsed.data.sourceEntityId, triggerType: "MANUAL", startedByUserId: session.userId });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_RUN_STARTED", entity: "EnterpriseWorkflowRun", entityId: run.id, request: req, metadata: { organizationId, workflowDefinitionId: parsed.data.workflowDefinitionId, sourceEntityType: parsed.data.sourceEntityType, sourceEntityId: parsed.data.sourceEntityId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-run-start", runId: run.id } });
    return NextResponse.json({ ok: true, run }, { status: 201 });
  } catch (error) { const normalized = normalizeWorkflowError(error); await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-run-start", error: normalized.code } }); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
