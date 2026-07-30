import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { retryWorkflowStep } from "@/lib/enterprise/workflows/engine";
import { normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { workflowRetrySchema } from "@/lib/enterprise/workflows/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflow-retry:${session.userId}`), 20, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canRetry) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = workflowRetrySchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "INVALID_WORKFLOW_RETRY", message: parsed.error.issues[0]?.message || "Retry invalide." }, { status: 400 });
  const scoped = await prisma.enterpriseWorkflowRun.findFirst({ where: { id, organizationId }, select: { id: true } }); if (!scoped) return NextResponse.json({ error: "WORKFLOW_RUN_NOT_FOUND" }, { status: 404 });
  try {
    const run = await retryWorkflowStep(id, session.userId, parsed.data.reason);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORKFLOW_RUN_RETRIED", entity: "EnterpriseWorkflowRun", entityId: id, request: req, metadata: { organizationId, reason: parsed.data.reason } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-retry", runId: id } });
    return NextResponse.json({ ok: true, run });
  } catch (error) { const normalized = normalizeWorkflowError(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
