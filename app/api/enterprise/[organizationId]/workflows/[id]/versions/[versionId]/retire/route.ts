import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { retireWorkflowVersion } from "@/lib/enterprise/workflows/definitions";
import { normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string; versionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflow-retire:${session.userId}`), 20, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id, versionId } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canRetire) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await retireWorkflowVersion(organizationId, id, versionId, session.userId);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_RETIRED", entity: "EnterpriseWorkflowVersion", entityId: versionId, request: req, metadata: { organizationId, definitionId: id } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-retire", definitionId: id, versionId } });
    return NextResponse.json({ ok: true });
  } catch (error) { const normalized = normalizeWorkflowError(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
