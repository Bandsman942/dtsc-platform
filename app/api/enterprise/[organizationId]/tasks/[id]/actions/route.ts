import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { transitionEnterpriseTask } from "@/lib/enterprise/core-v2/service";
import { enterpriseTaskActionSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-task-action:${session.userId}`), 160, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "TASKS_OPERATIONS", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseTaskActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "L’action demandée est invalide." }, { status: 400 });
  const task = await prisma.enterpriseTask.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = parsed.data;
  const isAssigned = task.assignedToUserId === session.userId;
  const isCreator = task.createdByUserId === session.userId;
  const allowed = data.action === "ARCHIVE"
    ? access.canManage
    : data.action === "CANCEL"
      ? access.canManage || isCreator
      : access.canManage || isAssigned || (!task.assignedToUserId && isCreator);
  if (!allowed) return NextResponse.json({ error: "Forbidden", message: "Vous n’êtes pas autorisé à exécuter cette transition." }, { status: 403 });

  try {
    const updated = await transitionEnterpriseTask({ organizationId, taskId: id, actorUserId: session.userId, action: data.action, revision: data.revision, comment: data.comment || undefined });
    if (data.action === "BLOCK" && task.createdByUserId !== session.userId) {
      await notifyUser({ userId: task.createdByUserId, organizationId, type: "ENTERPRISE_TASK", title: "Tâche bloquée", body: task.title, targetUrl: "/enterprise-modules/TASKS_OPERATIONS" });
    }
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_TASK_${data.action}`, entity: "EnterpriseTask", entityId: id, request: req, metadata: { organizationId, fromStatus: task.status, toStatus: updated?.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks", taskId: id, action: data.action } });
    return NextResponse.json({ ok: true, task: updated });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks", taskId: id, action: data.action, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
