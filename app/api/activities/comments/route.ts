import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { normalizePositionCode } from "@/lib/business-roles";
import { prisma } from "@/lib/prisma";

const commentSchema = z.object({
  entityType: z.enum(["TASK", "OPERATION", "DEPARTMENT_REQUEST", "BLOCKER", "MEETING", "REPORT", "WORKFLOW", "PAYROLL", "CEO_OBJECTIVE", "CEO_SUPERVISION", "SCO_PURCHASE_REQUEST", "SCO_VENDOR", "SCO_MATERIAL", "SCO_INVENTORY", "SCO_ASSET", "SCO_LOGISTICS", "MPO_PROJECT", "MPO_RECORD", "CTO_PROJECT", "CTO_RECORD"]),
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
  await notifyEntityParticipants(user.id, parsed.data.entityType, parsed.data.entityId, "Nouveau commentaire DTSC", parsed.data.content);
  await writeApiLog({ request: req, statusCode: 201, userId: user.id, startedAt, metadata: { entityType: parsed.data.entityType, entityId: parsed.data.entityId } });
  return NextResponse.json({ ok: true, comment }, { status: 201 });
}

async function canAccessEntity(user: { id: string; role: UserRole }, entityType: string, entityId: string) {
  if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER || user.role === UserRole.SUPPORT) {
    return true;
  }
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { userId: user.id, status: { not: "EXITED" } },
    include: { position: true },
  });
  if (!employee) {
    return false;
  }
  const positionCode = normalizePositionCode(employee.position?.code || employee.positionCode || employee.jobTitle);
  if (positionCode === "CEO") {
    return true;
  }
  if (positionCode === "SCO" && entityType.startsWith("SCO_")) {
    return true;
  }
  if (positionCode === "MPO" && (entityType.startsWith("MPO_") || entityType.startsWith("CTO_") || entityType.startsWith("SCO_"))) {
    return true;
  }
  if (positionCode === "CTO" && (entityType.startsWith("CTO_") || entityType.startsWith("MPO_") || entityType.startsWith("SCO_"))) {
    return true;
  }
  if (positionCode === "COO" && entityType !== "PAYROLL" && entityType !== "CEO_OBJECTIVE" && entityType !== "CEO_SUPERVISION") {
    return true;
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
  if (entityType === "CEO_OBJECTIVE") {
    return Boolean(await prisma.ceoObjective.findFirst({ where: { id: entityId, responsibleEmployeeId: employee.id }, select: { id: true } }));
  }
  if (entityType === "CEO_SUPERVISION") {
    return Boolean(await prisma.ceoSupervisionLog.findFirst({ where: { id: entityId, OR: [{ employeeId: employee.id }, { followUpResponsibleId: employee.id }] }, select: { id: true } }));
  }
  if (entityType === "SCO_PURCHASE_REQUEST") {
    return Boolean(await prisma.scoPurchaseRequest.findFirst({ where: { id: entityId, OR: [{ requesterName: employee.fullName }, { selectedVendorName: { contains: employee.fullName, mode: "insensitive" } }] }, select: { id: true } }));
  }
  if (entityType === "SCO_ASSET") {
    return Boolean(await prisma.scoAsset.findFirst({ where: { id: entityId, assignedTo: employee.fullName }, select: { id: true } }));
  }
  if (entityType === "SCO_LOGISTICS") {
    return Boolean(await prisma.scoLogisticsEvent.findFirst({ where: { id: entityId, OR: [{ ownerName: employee.fullName }, { requesterName: employee.fullName }, { participants: { contains: employee.fullName, mode: "insensitive" } }] }, select: { id: true } }));
  }
  if (entityType === "SCO_VENDOR" || entityType === "SCO_MATERIAL" || entityType === "SCO_INVENTORY") {
    return positionCode === "SCO";
  }
  if (entityType === "MPO_PROJECT") {
    return Boolean(await prisma.mpoProject.findFirst({ where: { id: entityId, OR: [{ responsibleMpoId: employee.id }, { ctoEmployeeId: employee.id }, { cooEmployeeId: employee.id }, { hrCfoEmployeeId: employee.id }, { scoEmployeeId: employee.id }, { ceoEmployeeId: employee.id }, { collaborators: { contains: employee.id } }, { collaborators: { contains: employee.fullName, mode: "insensitive" } }] }, select: { id: true } }));
  }
  if (entityType === "MPO_RECORD") {
    return Boolean(await prisma.mpoProjectRecord.findFirst({ where: { id: entityId, OR: [{ responsibleEmployeeId: employee.id }, { targetEmployeeId: employee.id }, { project: { OR: [{ responsibleMpoId: employee.id }, { ctoEmployeeId: employee.id }, { cooEmployeeId: employee.id }, { hrCfoEmployeeId: employee.id }, { scoEmployeeId: employee.id }, { ceoEmployeeId: employee.id }] } }] }, select: { id: true } }));
  }
  if (entityType === "CTO_PROJECT") {
    return Boolean(await prisma.ctoTechnicalProject.findFirst({ where: { id: entityId, OR: [{ responsibleCtoId: employee.id }, { technicalCollaborators: { contains: employee.id } }, { technicalCollaborators: { contains: employee.fullName, mode: "insensitive" } }, { mpoProject: { OR: [{ responsibleMpoId: employee.id }, { ctoEmployeeId: employee.id }, { scoEmployeeId: employee.id }, { ceoEmployeeId: employee.id }] } }] }, select: { id: true } }));
  }
  if (entityType === "CTO_RECORD") {
    return Boolean(await prisma.ctoTechnicalRecord.findFirst({ where: { id: entityId, OR: [{ responsibleEmployeeId: employee.id }, { assigneeEmployeeId: employee.id }, { technicalProject: { OR: [{ responsibleCtoId: employee.id }, { technicalCollaborators: { contains: employee.id } }, { technicalCollaborators: { contains: employee.fullName, mode: "insensitive" } }] } }] }, select: { id: true } }));
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
        type: `ACTIVITY_${entityType}`,
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
  if (entityType === "OPERATION") {
    const operation = await prisma.cooOperation.findUnique({ where: { id: entityId }, select: { leadEmployeeId: true, collaborators: true, createdById: true } });
    const collaboratorRefs = (operation?.collaborators || "").split(",").map((item) => item.trim()).filter(Boolean);
    return uniqueUserIds([
      ...(await employeesToUserIds([operation?.leadEmployeeId, ...collaboratorRefs], operation?.createdById)),
      ...(await employeesByNames(collaboratorRefs)),
    ]);
  }
  if (entityType === "DEPARTMENT_REQUEST") {
    const request = await prisma.cooDepartmentRequest.findUnique({ where: { id: entityId }, select: { requesterEmployeeId: true, targetResponsibleEmployeeId: true, createdById: true } });
    return employeesToUserIds([request?.requesterEmployeeId, request?.targetResponsibleEmployeeId], request?.createdById);
  }
  if (entityType === "BLOCKER") {
    const blocker = await prisma.cooBlocker.findUnique({ where: { id: entityId }, select: { responsibleEmployeeId: true, createdById: true } });
    return employeesToUserIds([blocker?.responsibleEmployeeId], blocker?.createdById);
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
  if (entityType === "CEO_OBJECTIVE") {
    const objective = await prisma.ceoObjective.findUnique({ where: { id: entityId }, select: { responsibleEmployeeId: true, createdById: true } });
    return employeesToUserIds([objective?.responsibleEmployeeId], objective?.createdById);
  }
  if (entityType === "CEO_SUPERVISION") {
    const log = await prisma.ceoSupervisionLog.findUnique({ where: { id: entityId }, select: { employeeId: true, followUpResponsibleId: true, createdById: true } });
    return employeesToUserIds([log?.employeeId, log?.followUpResponsibleId], log?.createdById);
  }
  if (entityType === "WORKFLOW") {
    const shares = await prisma.cooWorkflowShare.findMany({ where: { workflowId: entityId }, select: { userId: true, createdById: true } });
    return shares.flatMap((share) => [share.userId, share.createdById]).filter((id): id is string => Boolean(id));
  }
  if (entityType === "SCO_PURCHASE_REQUEST") {
    const request = await prisma.scoPurchaseRequest.findUnique({ where: { id: entityId }, select: { requesterName: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("SCO")), ...(await employeesByNames([request?.requesterName], request?.createdById))]);
  }
  if (entityType === "SCO_VENDOR") {
    const vendor = await prisma.scoVendor.findUnique({ where: { id: entityId }, select: { createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("SCO")), vendor?.createdById]);
  }
  if (entityType === "SCO_MATERIAL") {
    const material = await prisma.materialItem.findUnique({ where: { id: entityId }, select: { currentOwnerName: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("SCO")), ...(await employeesByNames([material?.currentOwnerName], material?.createdById))]);
  }
  if (entityType === "SCO_INVENTORY") {
    const item = await prisma.scoInventoryItem.findUnique({ where: { id: entityId }, select: { ownerName: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("SCO")), ...(await employeesByNames([item?.ownerName], item?.createdById))]);
  }
  if (entityType === "SCO_ASSET") {
    const asset = await prisma.scoAsset.findUnique({ where: { id: entityId }, select: { assignedTo: true, createdById: true } });
    return employeesByNames([asset?.assignedTo], asset?.createdById);
  }
  if (entityType === "SCO_LOGISTICS") {
    const mission = await prisma.scoLogisticsEvent.findUnique({ where: { id: entityId }, select: { ownerName: true, requesterName: true, participants: true, createdById: true } });
    return employeesByNames([mission?.ownerName, mission?.requesterName, ...(mission?.participants || "").split(",")], mission?.createdById);
  }
  if (entityType === "MPO_PROJECT") {
    const project = await prisma.mpoProject.findUnique({ where: { id: entityId }, select: { responsibleMpoId: true, ctoEmployeeId: true, cooEmployeeId: true, hrCfoEmployeeId: true, scoEmployeeId: true, ceoEmployeeId: true, createdById: true } });
    return employeesToUserIds([project?.responsibleMpoId, project?.ctoEmployeeId, project?.cooEmployeeId, project?.hrCfoEmployeeId, project?.scoEmployeeId, project?.ceoEmployeeId], project?.createdById);
  }
  if (entityType === "MPO_RECORD") {
    const record = await prisma.mpoProjectRecord.findUnique({ where: { id: entityId }, select: { responsibleEmployeeId: true, targetEmployeeId: true, createdById: true } });
    return employeesToUserIds([record?.responsibleEmployeeId, record?.targetEmployeeId], record?.createdById);
  }
  if (entityType === "CTO_PROJECT") {
    const project = await prisma.ctoTechnicalProject.findUnique({ where: { id: entityId }, select: { responsibleCtoId: true, createdById: true } });
    return employeesToUserIds([project?.responsibleCtoId], project?.createdById);
  }
  if (entityType === "CTO_RECORD") {
    const record = await prisma.ctoTechnicalRecord.findUnique({ where: { id: entityId }, select: { responsibleEmployeeId: true, assigneeEmployeeId: true, createdById: true } });
    return employeesToUserIds([record?.responsibleEmployeeId, record?.assigneeEmployeeId], record?.createdById);
  }
  return [];
}

async function employeesByNames(names: Array<string | null | undefined>, createdById?: string | null) {
  const values = names.map((name) => String(name || "").trim()).filter(Boolean);
  const employees = values.length ? await prisma.hrcfoEmployee.findMany({ where: { fullName: { in: values } }, select: { userId: true } }) : [];
  return [...employees.map((employee) => employee.userId), createdById].filter((id): id is string => Boolean(id));
}

async function employeesToUserIds(employeeIds: Array<string | null | undefined>, createdById?: string | null) {
  const ids = employeeIds.map((id) => String(id || "").trim()).filter(Boolean);
  const employees = ids.length ? await prisma.hrcfoEmployee.findMany({ where: { id: { in: ids } }, select: { userId: true } }) : [];
  return [...employees.map((employee) => employee.userId), createdById].filter((id): id is string => Boolean(id));
}

async function employeesByPosition(positionCode: string) {
  const employees = await prisma.hrcfoEmployee.findMany({ where: { positionCode, status: { not: "EXITED" } }, select: { userId: true } });
  return employees.map((employee) => employee.userId).filter((id): id is string => Boolean(id));
}

function uniqueUserIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((id): id is string => Boolean(id)))];
}
