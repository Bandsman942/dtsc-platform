import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { normalizePositionCode } from "@/lib/business-roles";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const taskUpdateSchema = z.object({
  status: z.enum(["IN_PROGRESS", "PENDING_VALIDATION", "COMPLETED", "BLOCKED"]).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  assigneeComment: z.string().max(1500).optional().or(z.literal("")),
  blockerReason: z.string().max(1000).optional().or(z.literal("")),
});

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { userId: user.id, status: { not: "EXITED" } }, include: { position: true } });
  if (!employee) {
    return NextResponse.json({ error: "Forbidden", message: "Aucun dossier collaborateur actif." }, { status: 403 });
  }
  const { id } = await params;
  const positionCode = normalizePositionCode(employee.position?.code || employee.positionCode || employee.jobTitle);
  const supervisesOperations = positionCode === "CEO" || positionCode === "COO";
  const task = await prisma.cooTask.findFirst({
    where: supervisesOperations ? { id } : { id, OR: [{ assigneeEmployeeId: employee.id }, { responsibleEmployeeId: employee.id }] },
  });
  if (!task) {
    return NextResponse.json({ error: "Forbidden", message: "Tâche introuvable ou non autorisée." }, { status: 403 });
  }
  const parsed = taskUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", message: "Mise à jour de tâche invalide." }, { status: 400 });
  }
  const status = parsed.data.status || task.status;
  const updated = await prisma.cooTask.update({
    where: { id },
    data: {
      status,
      progress: parsed.data.progress ?? (status === "COMPLETED" || status === "PENDING_VALIDATION" ? 100 : task.progress),
      assigneeComment: parsed.data.assigneeComment ?? task.assigneeComment,
      blockerReason: parsed.data.blockerReason ?? task.blockerReason,
      closedAt: status === "COMPLETED" ? new Date() : task.closedAt,
    },
  });
  if (status === "BLOCKED" && parsed.data.blockerReason) {
    await prisma.cooBlocker.create({
      data: {
        title: `Blocage: ${task.title}`,
        description: parsed.data.blockerReason,
        sourceType: "TASK",
        taskId: task.id,
        operationId: task.operationId,
        departmentId: task.departmentId,
        departmentName: task.departmentName,
        responsibleEmployeeId: task.responsibleEmployeeId,
        responsibleName: task.responsibleName,
        severity: task.priority === "CRITICAL" ? "CRITICAL" : "MEDIUM",
        impact: "Blocage déclaré depuis l'espace collaborateur.",
        correctiveAction: "Analyse COO requise.",
        status: "OPEN",
        declaredAt: new Date(),
        createdById: user.id,
      },
    });
  }
  await notifyTask(task, user.id, status);
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { taskId: id, status } });
  return NextResponse.json({ ok: true, task: updated });
}

async function notifyTask(task: { assigneeEmployeeId: string | null; responsibleEmployeeId: string | null; createdById: string | null; title: string }, actorId: string, status: string) {
  const employeeIds = [task.assigneeEmployeeId, task.responsibleEmployeeId].filter((id): id is string => Boolean(id));
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { id: { in: employeeIds } },
    select: { userId: true },
  });
  const recipients = [...new Set([...employees.map((employee) => employee.userId), task.createdById].filter((id): id is string => Boolean(id) && id !== actorId))];
  for (const userId of recipients) {
    await prisma.notification.create({
      data: {
        userId,
        title: "Tâche COO mise à jour",
        body: `${task.title} est maintenant ${status}.`,
        type: "COO_TASK",
        targetUrl: "/activities",
      },
    });
  }
}
