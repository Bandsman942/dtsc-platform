import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { saveWorkflowVersion } from "@/lib/enterprise/workflows/definitions";
import { normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { workflowVersionSchema } from "@/lib/enterprise/workflows/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string; versionId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflow-version-edit:${session.userId}`), 100, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id, versionId } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canEditDraft) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = workflowVersionSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "INVALID_WORKFLOW_VERSION_PAYLOAD", message: parsed.error.issues[0]?.message || "Version invalide." }, { status: 400 });
  try {
    const result = await saveWorkflowVersion(organizationId, id, versionId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_UPDATED", entity: "EnterpriseWorkflowVersion", entityId: versionId, request: req, metadata: { organizationId, definitionId: id, readiness: result.readiness.ready } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-version", definitionId: id, versionId } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { const normalized = normalizeWorkflowError(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
