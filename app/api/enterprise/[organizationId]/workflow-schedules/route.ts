import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { createDisabledWorkflowSchedule, disabledWorkflowScheduleCreateSchema } from "@/lib/enterprise/workflows/schedule-authoring";
import { normalizeWorkflowError } from "@/lib/enterprise/workflows/errors";
import { listReadableWorkflowEntityTypes, requireWorkflowSourceAccess } from "@/lib/enterprise/workflows/source-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

function boundedInteger(raw: string | null, fallback: number, max: number) {
  if (!raw || !/^[0-9]{1,6}$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? Math.max(1, Math.min(value, max)) : fallback;
}

/** WF-06S2A: read ONLY inert, tenant-owned drafts; STAGED is internal-only. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseWorkflowAccess(session, organizationId);
  if (!access?.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const readableTypes = await listReadableWorkflowEntityTypes(session.userId, organizationId);
  const url = new URL(req.url);
  const page = boundedInteger(url.searchParams.get("page"), 1, 10000);
  const pageSize = boundedInteger(url.searchParams.get("pageSize"), 20, 50);
  const where = {
    organizationId,
    status: "DISABLED" as const,
    definition: { triggerEntityType: { in: [...readableTypes] } },
  };
  const [schedules, total] = await Promise.all([
    prisma.enterpriseWorkflowSchedule.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, workflowDefinitionId: true, workflowVersionId: true,
        frequency: true, timeZone: true, hour: true, minute: true, dayOfWeek: true,
        status: true, nextRunAt: true, revision: true, createdAt: true,
        sourceEntityType: true, sourceEntityId: true, executionActorUserId: true,
        mandateVerifiedAt: true,
        definition: { select: { code: true, name: true, triggerEntityType: true } },
      },
    }),
    prisma.enterpriseWorkflowSchedule.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-schedules", page, pageSize } });
  return NextResponse.json({ schedules, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

/**
 * Create an inert DISABLED row only. There is no ENABLE action, scheduled
 * workflow run, source-entity execution actor, outbox or worker integration.
 */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-workflow-schedules:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseWorkflowAccess(session, organizationId);
  if (!access?.canCreateDraft) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const payload = disabledWorkflowScheduleCreateSchema.safeParse(await req.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: "WORKFLOW_SCHEDULE_INPUT_INVALID", message: "Vérifiez la définition, la version et les champs de l’horaire." }, { status: 400 });
  }
  try {
    const definition = await prisma.enterpriseWorkflowDefinition.findFirst({
      where: { id: payload.data.workflowDefinitionId, organizationId, archivedAt: null },
      select: { triggerEntityType: true },
    });
    if (!definition?.triggerEntityType) {
      return NextResponse.json({ error: "WORKFLOW_SCHEDULE_SOURCE_REQUIRED", message: "Le workflow ou son module source n’est pas disponible." }, { status: 404 });
    }
    await requireWorkflowSourceAccess({
      userId: session.userId,
      organizationId,
      sourceEntityType: definition.triggerEntityType,
      action: "read",
    });
    const schedule = await createDisabledWorkflowSchedule({
      organizationId, actorUserId: session.userId, payload: payload.data,
    });
    await writeAuditLog({
      userId: session.userId, action: "ENTERPRISE_WORKFLOW_SCHEDULE_DRAFT_CREATED",
      entity: "EnterpriseWorkflowSchedule", entityId: schedule.id,
      request: req, metadata: { organizationId, workflowDefinitionId: schedule.workflowDefinitionId, workflowVersionId: schedule.workflowVersionId, status: "DISABLED" },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-schedules" } });
    return NextResponse.json({ ok: true, schedule }, { status: 201 });
  } catch (error) {
    const normalized = normalizeWorkflowError(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-schedules", error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
