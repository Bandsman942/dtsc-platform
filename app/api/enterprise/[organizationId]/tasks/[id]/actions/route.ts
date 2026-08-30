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

  const comment = (data.comment || "").trim();
  if (["BLOCK", "CANCEL", "ARCHIVE"].includes(data.action) && comment.length < 3) {
    return NextResponse.json({ error: "TASK_ACTION_REASON_REQUIRED", message: "Un motif professionnel d’au moins 3 caractères est obligatoire pour cette action." }, { status: 400 });
  }

  if (data.action === "COMPLETE") {
    const [incompleteChecklistCount, openBlockerCount, incomingDependencies] = await Promise.all([
      prisma.enterpriseTaskChecklistItem.count({ where: { organizationId, taskId: id, isCompleted: false } }),
      prisma.enterpriseTaskBlocker.count({ where: { organizationId, taskId: id, status: "OPEN" } }),
      prisma.enterpriseTaskDependency.findMany({
        where: { organizationId, successorId: id },
        select: { predecessorId: true },
        take: 500,
      }),
    ]);
    if (incompleteChecklistCount > 0) {
      return NextResponse.json({ error: "TASK_CHECKLIST_INCOMPLETE", message: `Cette tâche contient encore ${incompleteChecklistCount} élément${incompleteChecklistCount > 1 ? "s" : ""} de checklist à terminer.` }, { status: 409 });
    }
    if (openBlockerCount > 0) {
      return NextResponse.json({ error: "TASK_OPEN_BLOCKERS", message: `Cette tâche contient encore ${openBlockerCount} blocage${openBlockerCount > 1 ? "s" : ""} actif${openBlockerCount > 1 ? "s" : ""}.` }, { status: 409 });
    }
    if (incomingDependencies.length) {
      const predecessorIds = [...new Set(incomingDependencies.map((dependency) => dependency.predecessorId))];
      const completedPredecessors = await prisma.enterpriseTask.findMany({
        where: { organizationId, id: { in: predecessorIds }, status: "DONE", archivedAt: null },
        select: { id: true },
        take: 500,
      });
      const completedIds = new Set(completedPredecessors.map((item) => item.id));
      const blockingDependencyCount = predecessorIds.filter((predecessorId) => !completedIds.has(predecessorId)).length;
      if (blockingDependencyCount > 0) {
        return NextResponse.json({ error: "TASK_DEPENDENCIES_INCOMPLETE", message: `Cette tâche dépend encore de ${blockingDependencyCount} tâche${blockingDependencyCount > 1 ? "s" : ""} non terminée${blockingDependencyCount > 1 ? "s" : ""}.` }, { status: 409 });
      }
    }
  }

  try {
    const updated = await transitionEnterpriseTask({ organizationId, taskId: id, actorUserId: session.userId, action: data.action, revision: data.revision, comment: comment || undefined });
    if (data.action === "BLOCK" && task.createdByUserId !== session.userId) {
      await notifyUser({ userId: task.createdByUserId, organizationId, type: "ENTERPRISE_TASK", title: "Tâche bloquée", body: task.title, targetUrl: "/enterprise-modules/TASKS_OPERATIONS" });
    }
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_TASK_${data.action}`, entity: "EnterpriseTask", entityId: id, request: req, metadata: { organizationId, fromStatus: task.status, toStatus: updated?.status, reason: comment || null } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks", taskId: id, action: data.action } });
    return NextResponse.json({ ok: true, task: updated });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "tasks", taskId: id, action: data.action, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
