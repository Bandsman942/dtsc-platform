import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  applyTaskCoordinationAction,
  getTaskCoordinationContext,
  loadTaskCoordination,
  taskCoordinationActionSchema,
  TaskCoordinationError,
} from "@/lib/standard-work-coordination/task-coordination";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, id } = await params;
  const context = await getTaskCoordinationContext({ session, organizationId, taskId: id, action: "read" });
  if (!context) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const coordination = await loadTaskCoordination(organizationId, id);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, taskId: id, domain: "task-coordination" } });
  return NextResponse.json({ task: context.task, coordination, capabilities: { canUpdate: context.canMutate, canManage: context.access.canManage } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `task-coordination:${session.userId}`), 180, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop d’actions sur cette tâche en peu de temps." }, { status: 429 });
  const { organizationId, id } = await params;
  const context = await getTaskCoordinationContext({ session, organizationId, taskId: id, action: "write" });
  if (!context) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!context.canMutate) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = taskCoordinationActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Action de coordination invalide." }, { status: 400 });

  try {
    const result = await applyTaskCoordinationAction({ organizationId, taskId: id, actorUserId: session.userId, payload: parsed.data });
    const coordination = await loadTaskCoordination(organizationId, id);
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_TASK_${parsed.data.action}`, entity: "EnterpriseTask", entityId: id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, taskId: id, action: parsed.data.action, domain: "task-coordination" } });
    return NextResponse.json({ ok: true, result, coordination });
  } catch (error) {
    const known = error instanceof TaskCoordinationError ? error : null;
    const status = known?.status || 500;
    const code = known?.code || "INTERNAL_ERROR";
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { organizationId, taskId: id, action: parsed.data.action, code } });
    return NextResponse.json({ error: code, message: known?.message || "L’action sur la tâche a échoué." }, { status });
  }
}
