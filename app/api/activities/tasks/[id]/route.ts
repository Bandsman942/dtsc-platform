import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { getOperationalActor, operationalChecklistProgress, resolveOperationalObjectAccess } from "@/lib/operational-access";
import { syncDerivedOperationalProgress, validateOperationalClosure } from "@/lib/operational-progress";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

const taskUpdateSchema = z.object({
  status: z.enum(["IN_PROGRESS", "PENDING_VALIDATION", "COMPLETED", "BLOCKED"]).optional(),
  assigneeComment: z.string().max(1500).optional().or(z.literal("")),
  blockerReason: z.string().max(1000).optional().or(z.literal("")),
}).strict();

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `activity-task-transition:${user.id}`), 180, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await params;
  const actor = await getOperationalActor(user);
  const access = await resolveOperationalObjectAccess({ actor, objectType: "TASK", objectId: id, action: "status" });
  if (!access.allowed) {
    await writeApiLog({ request: req, statusCode: access.reason === "NOT_FOUND" ? 404 : 403, userId: user.id, startedAt });
    return NextResponse.json({ error: access.reason || "Forbidden", message: "Seul le collaborateur assigné ou responsable peut faire évoluer cette tâche." }, { status: access.reason === "NOT_FOUND" ? 404 : 403 });
  }
  const task = await prisma.cooTask.findUnique({ where: { id } });
  if (!task) {
    await writeApiLog({ request: req, statusCode: 404, userId: user.id, startedAt });
    return NextResponse.json({ error: "NOT_FOUND", message: "Tâche introuvable." }, { status: 404 });
  }
  const parsed = taskUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Mise à jour de tâche invalide." }, { status: 400 });

  const status = parsed.data.status || task.status;
  const checklist = await operationalChecklistProgress("TASK", task.id);
  const closureError = await validateOperationalClosure("TASK", task.id, status);
  if (closureError) {
    return NextResponse.json({ error: "CHECKLIST_INCOMPLETE", message: closureError }, { status: 409 });
  }
  if (status === "BLOCKED" && !parsed.data.blockerReason?.trim()) {
    return NextResponse.json({ error: "BLOCKER_REASON_REQUIRED", message: "Décrivez le blocage avant de changer le statut." }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.cooTask.update({
      where: { id },
      data: {
        status,
        progress: checklist.progress,
        assigneeComment: parsed.data.assigneeComment ?? task.assigneeComment,
        blockerReason: parsed.data.blockerReason ?? task.blockerReason,
        closedAt: status === "COMPLETED" ? new Date() : task.closedAt,
      },
    });
    await syncDerivedOperationalProgress("TASK", task.id, tx);
    // OperationalStatusTransition is the append-only record of every task status mutation.
    await tx.operationalStatusTransition.create({
      data: {
        objectType: "TASK",
        objectId: task.id,
        fromStatus: task.status,
        toStatus: status,
        actorUserId: user.id,
        actorEmployeeId: actor.employeeId,
        reason: parsed.data.blockerReason || parsed.data.assigneeComment || null,
        metadataJson: { progress: checklist.progress, checklistCompleted: checklist.completed, checklistTotal: checklist.total },
      },
    });
    if (status === "BLOCKED" && parsed.data.blockerReason) {
      await tx.cooBlocker.create({
        data: {
          title: `Blocage: ${task.title}`,
          description: parsed.data.blockerReason,
          sourceType: "TASK",
          taskId: task.id,
          operationId: task.operationId,
          departmentId: task.departmentId,
          departmentName: task.departmentName,
          responsibleEmployeeId: task.responsibleEmployeeId || task.assigneeEmployeeId,
          responsibleName: task.responsibleName || task.assigneeName,
          severity: task.priority === "CRITICAL" ? "CRITICAL" : "MEDIUM",
          impact: "Blocage déclaré depuis l'espace collaborateur.",
          correctiveAction: "Analyse et résolution par le responsable.",
          status: "OPEN",
          declaredAt: new Date(),
          createdById: user.id,
        },
      });
    }
    return next;
  });

  await notifyTask(task, user.id, status);
  await writeAuditLog({ userId: user.id, action: "COO_TASK_STATUS_CHANGED", entity: "CooTask", entityId: task.id, request: req, metadata: { fromStatus: task.status, toStatus: status, progress: checklist.progress } });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { taskId: id, status, progress: checklist.progress } });
  return NextResponse.json({ ok: true, task: updated, progress: checklist.progress });
}

async function notifyTask(task: { id: string; assigneeEmployeeId: string | null; responsibleEmployeeId: string | null; createdById: string | null; title: string }, actorId: string, status: string) {
  const employeeIds = [task.assigneeEmployeeId, task.responsibleEmployeeId].filter((id): id is string => Boolean(id));
  const employees = await prisma.hrcfoEmployee.findMany({ where: { id: { in: employeeIds } }, select: { userId: true } });
  const recipients = [...new Set([...employees.map((employee) => employee.userId), task.createdById].filter((recipientId): recipientId is string => Boolean(recipientId) && recipientId !== actorId))];
  await notifyUsers({ userIds: recipients, title: "Tâche COO mise à jour", body: `${task.title} est maintenant ${status}.`, type: "COO_TASK", targetUrl: `/activities?task=${encodeURIComponent(task.id)}` });
}
