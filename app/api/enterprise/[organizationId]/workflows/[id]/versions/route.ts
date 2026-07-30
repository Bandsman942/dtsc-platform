import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { duplicateWorkflowVersion, getWorkflowDefinition } from "@/lib/enterprise/workflows/definitions";
import { normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };
const schema = z.object({ sourceVersionId: z.string().trim().min(1).max(191).optional() });

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflow-version:${session.userId}`), 50, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canCreateDraft) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "INVALID_WORKFLOW_VERSION_PAYLOAD" }, { status: 400 });
  try {
    const definition = await getWorkflowDefinition(organizationId, id); const sourceVersionId = parsed.data.sourceVersionId || definition.currentVersionId || definition.versions[0]?.id;
    if (!sourceVersionId) return NextResponse.json({ error: "WORKFLOW_SOURCE_VERSION_REQUIRED", message: "Aucune version source n’est disponible." }, { status: 409 });
    const version = await duplicateWorkflowVersion(organizationId, id, sourceVersionId, session.userId);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_VERSION_CREATED", entity: "EnterpriseWorkflowVersion", entityId: version.id, request: req, metadata: { organizationId, definitionId: id, sourceVersionId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-version", definitionId: id } });
    return NextResponse.json({ ok: true, version }, { status: 201 });
  } catch (error) { const normalized = normalizeWorkflowError(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
