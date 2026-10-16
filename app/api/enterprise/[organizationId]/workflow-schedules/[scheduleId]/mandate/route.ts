import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { bindDisabledScheduleMandate, disabledScheduleMandateSchema } from "@/lib/enterprise/workflows/schedule-mandate";
import { normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { requireWorkflowSourceAccess } from "@/lib/enterprise/workflows/source-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; scheduleId: string }> };

/** WF-06S2B: attest a specific ERP entity and SELF actor, DISABLED only. */
export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `workflow-schedule-mandate:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, scheduleId } = await params;
  const access = await getEnterpriseWorkflowAccess(session, organizationId);
  if (!access?.canEditDraft) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const payload = disabledScheduleMandateSchema.safeParse(await req.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: "WORKFLOW_MANDATE_INPUT_INVALID", message: "Vérifiez l'entité et la version de l'horaire." }, { status: 400 });
  }
  try {
    const existing = await prisma.enterpriseWorkflowSchedule.findFirst({
      where: { organizationId, id: scheduleId, status: "DISABLED" },
      select: { definition: { select: { triggerEntityType: true } } },
    });
    if (!existing?.definition.triggerEntityType) {
      return NextResponse.json({ error: "WORKFLOW_MANDATE_SCHEDULE_NOT_FOUND" }, { status: 404 });
    }
    await requireWorkflowSourceAccess({
      userId: session.userId,
      organizationId,
      sourceEntityType: existing.definition.triggerEntityType,
      action: "read",
    });
    const bound = await bindDisabledScheduleMandate({
      organizationId, scheduleId, actorUserId: session.userId, payload: payload.data,
    });
    await writeAuditLog({
      userId: session.userId, action: "ENTERPRISE_WORKFLOW_SCHEDULE_MANDATE_ATTESTED",
      entity: "EnterpriseWorkflowSchedule", entityId: bound.id, request: req,
      metadata: { organizationId, workflowDefinitionId: bound.workflowDefinitionId,
        workflowVersionId: bound.workflowVersionId, sourceEntityType: bound.sourceEntityType,
        revision: bound.revision, status: "DISABLED" },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt,
      metadata: { organizationId, domain: "workflow-schedule-mandate" } });
    return NextResponse.json({ ok: true, schedule: bound });
  } catch (error) {
    const normalized = normalizeWorkflowError(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt,
      metadata: { organizationId, domain: "workflow-schedule-mandate", error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
