import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const commentSchema = z.object({
  entityType: z.enum(["TASK", "OPERATION", "DEPARTMENT_REQUEST", "BLOCKER", "MEETING", "REPORT", "WORKFLOW", "PAYROLL"]),
  entityId: z.string().min(5),
  content: z.string().min(2).max(2000),
});

export async function GET(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const url = new URL(req.url);
  const parsed = commentSchema.pick({ entityType: true, entityId: true }).safeParse({
    entityType: url.searchParams.get("entityType"),
    entityId: url.searchParams.get("entityId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", message: "Commentaires introuvables." }, { status: 400 });
  }
  if (!(await canAccessEntity(user, parsed.data.entityType, parsed.data.entityId))) {
    return NextResponse.json({ error: "Forbidden", message: "Vous n'avez pas accès à ces commentaires." }, { status: 403 });
  }
  const comments = await prisma.cooComment.findMany({
    where: parsed.data,
    include: { author: { select: { name: true, role: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: parsed.data });
  return NextResponse.json({ comments });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const parsed = commentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", message: "Le commentaire est invalide." }, { status: 400 });
  }
  if (!(await canAccessEntity(user, parsed.data.entityType, parsed.data.entityId))) {
    return NextResponse.json({ error: "Forbidden", message: "Vous n'êtes pas autorisé à commenter cet élément." }, { status: 403 });
  }
  const comment = await prisma.cooComment.create({
    data: {
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      authorId: user.id,
      content: parsed.data.content,
    },
    include: { author: { select: { name: true, role: true, avatarUrl: true } } },
  });
  await notifyEntityParticipants(user.id, parsed.data.entityType, parsed.data.entityId, "Nouveau commentaire COO", parsed.data.content);
  await writeApiLog({ request: req, statusCode: 201, userId: user.id, startedAt, metadata: { entityType: parsed.data.entityType, entityId: parsed.data.entityId } });
  return NextResponse.json({ ok: true, comment }, { status: 201 });
}

async function canAccessEntity(user: { id: string; role: UserRole }, entityType: string, entityId: string) {
  if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER || user.role === UserRole.SUPPORT) {
    return true;
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { userId: user.id, status: { not: "EXITED" } }, select: { id: true, fullName: true } });
  if (!employee) {
    return false;
  }
  if (entityType === "TASK") {
    return Boolean(await prisma.cooTask.findFirst({ where: { id: entityId, OR: [{ assigneeEmployeeId: employee.id }, { responsibleEmployeeId: employee.id }] }, select: { id: true } }));
  }
  if (entityType === "OPERATION") {
    return Boolean(await prisma.cooOperation.findFirst({ where: { id: entityId, OR: [{ leadEmployeeId: employee.id }, { collaborators: { contains: employee.id } }, { collaborators: { contains: employee.fullName, mode: "insensitive" } }] }, select: { id: true } }));
  }
  if (entityType === "DEPARTMENT_REQUEST") {
    return Boolean(await prisma.cooDepartmentRequest.findFirst({ where: { id: entityId, OR: [{ requesterEmployeeId: employee.id }, { targetResponsibleEmployeeId: employee.id }] }, select: { id: true } }));
  }
  if (entityType === "BLOCKER") {
    return Boolean(await prisma.cooBlocker.findFirst({ where: { id: entityId, responsibleEmployeeId: employee.id }, select: { id: true } }));
  }
  if (entityType === "MEETING") {
    return Boolean(await prisma.cooMeeting.findFirst({ where: { id: entityId, OR: [{ reportOwnerEmployeeId: employee.id }, { participants: { contains: employee.id } }, { participants: { contains: employee.fullName, mode: "insensitive" } }] }, select: { id: true } }));
  }
  if (entityType === "REPORT") {
    return Boolean(await prisma.cooOperationalReport.findFirst({ where: { id: entityId, OR: [{ employeeId: employee.id }, { recipientEmployeeId: employee.id }] }, select: { id: true } }));
  }
  if (entityType === "PAYROLL") {
    return Boolean(await prisma.hrcfoPayroll.findFirst({ where: { id: entityId, employeeId: employee.id }, select: { id: true } }));
  }
  return Boolean(await prisma.cooWorkflowShare.findFirst({ where: { workflowId: entityId, employeeId: employee.id }, select: { id: true } }));
}

async function notifyEntityParticipants(senderId: string, entityType: string, entityId: string, title: string, content: string) {
  const userIds = await relatedUserIds(entityType, entityId);
  const recipients = [...new Set(userIds.filter((id) => id && id !== senderId))];
  for (const userId of recipients) {
    await prisma.notification.create({
      data: {
        userId,
        title,
        body: content.slice(0, 220),
        type: `COO_${entityType}`,
        targetUrl: "/activities",
      },
    });
  }
}

async function relatedUserIds(entityType: string, entityId: string) {
  if (entityType === "TASK") {
    const task = await prisma.cooTask.findUnique({ where: { id: entityId }, select: { assigneeEmployeeId: true, responsibleEmployeeId: true, createdById: true } });
    return employeesToUserIds([task?.assigneeEmployeeId, task?.responsibleEmployeeId], task?.createdById);
  }
  if (entityType === "DEPARTMENT_REQUEST") {
    const request = await prisma.cooDepartmentRequest.findUnique({ where: { id: entityId }, select: { requesterEmployeeId: true, targetResponsibleEmployeeId: true, createdById: true } });
    return employeesToUserIds([request?.requesterEmployeeId, request?.targetResponsibleEmployeeId], request?.createdById);
  }
  if (entityType === "MEETING") {
    const meeting = await prisma.cooMeeting.findUnique({ where: { id: entityId }, select: { reportOwnerEmployeeId: true, participants: true, createdById: true } });
    return employeesToUserIds([meeting?.reportOwnerEmployeeId, ...(meeting?.participants || "").split(",")], meeting?.createdById);
  }
  if (entityType === "REPORT") {
    const report = await prisma.cooOperationalReport.findUnique({ where: { id: entityId }, select: { employeeId: true, recipientEmployeeId: true, createdById: true } });
    return employeesToUserIds([report?.employeeId, report?.recipientEmployeeId], report?.createdById);
  }
  if (entityType === "PAYROLL") {
    const payroll = await prisma.hrcfoPayroll.findUnique({ where: { id: entityId }, select: { employeeId: true, createdById: true } });
    return employeesToUserIds([payroll?.employeeId], payroll?.createdById);
  }
  if (entityType === "WORKFLOW") {
    const shares = await prisma.cooWorkflowShare.findMany({ where: { workflowId: entityId }, select: { userId: true, createdById: true } });
    return shares.flatMap((share) => [share.userId, share.createdById]).filter((id): id is string => Boolean(id));
  }
  const employees = await prisma.hrcfoEmployee.findMany({ where: { status: { not: "EXITED" } }, select: { userId: true } });
  return employees.map((employee) => employee.userId).filter((id): id is string => Boolean(id));
}

async function employeesToUserIds(employeeIds: Array<string | null | undefined>, createdById?: string | null) {
  const ids = employeeIds.map((id) => String(id || "").trim()).filter(Boolean);
  const employees = ids.length ? await prisma.hrcfoEmployee.findMany({ where: { id: { in: ids } }, select: { userId: true } }) : [];
  return [...employees.map((employee) => employee.userId), createdById].filter((id): id is string => Boolean(id));
}
