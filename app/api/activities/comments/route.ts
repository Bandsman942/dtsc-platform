import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizePositionCode } from "@/lib/business-roles";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const commentSchema = z.object({
  entityType: z.enum(["TASK", "OPERATION", "DEPARTMENT_REQUEST", "BLOCKER", "MEETING", "REPORT", "WORKFLOW", "PAYROLL", "CEO_OBJECTIVE", "CEO_SUPERVISION", "COLLAB_REQUEST", "SCO_PURCHASE_REQUEST", "SCO_VENDOR", "SCO_MATERIAL", "SCO_INVENTORY", "SCO_ASSET", "SCO_LOGISTICS", "MPO_PROJECT", "MPO_RECORD", "CTO_PROJECT", "CTO_RECORD", "LEGAL_CASE", "LEGAL_CONTRACT", "LEGAL_TEMPLATE", "LEGAL_RISK", "LEGAL_DOCUMENT", "LEGAL_DISPUTE", "LEGAL_REQUEST", "LEGAL_REPORT"]),
  entityId: z.string().min(5),
  content: z.string().min(2).max(2000),
  mentionedUserIds: z.array(z.string().min(5)).max(30).default([]),
  replyToId: z.string().min(5).max(120).optional().or(z.literal("")),
});

const commentMutationSchema = z.object({
  id: z.string().min(5).max(120),
  content: z.string().min(2).max(2000).optional(),
});

export async function GET(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `activity-comments-read:${user.id}`), 600, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests", message: "Trop de chargements de commentaires sur une courte période." }, { status: 429 });
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
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 50);
  const cursor = url.searchParams.get("cursor") || undefined;
  const records = await prisma.cooComment.findMany({
    where: parsed.data,
    include: {
      author: { select: { id: true, name: true, role: true, avatarUrl: true } },
      replyTo: { select: { id: true, content: true, deletedAt: true, author: { select: { name: true } } } },
      mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = records.length > limit;
  const comments = records.slice(0, limit).reverse();
  const nextCursor = hasMore ? records[limit - 1]?.id : null;
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: parsed.data });
  return NextResponse.json({ comments, nextCursor, hasMore });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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
  const limited = await rateLimit(getRateLimitKey(req, `activity-comment:${user.id}`), 120, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests", message: "Trop de commentaires sur une courte période." }, { status: 429 });
  }
  if (parsed.data.replyToId) {
    const replyTarget = await prisma.cooComment.findFirst({
      where: { id: parsed.data.replyToId, entityType: parsed.data.entityType, entityId: parsed.data.entityId },
      select: { id: true },
    });
    if (!replyTarget) {
      return NextResponse.json({ error: "Invalid reply target", message: "Le commentaire source est introuvable." }, { status: 400 });
    }
  }
  const allowedUserIds = await relatedUserIds(parsed.data.entityType, parsed.data.entityId);
  const mentionedUserIds = [...new Set(parsed.data.mentionedUserIds.filter((id) => allowedUserIds.includes(id)))];
  const comment = await prisma.cooComment.create({
    data: {
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      authorId: user.id,
      content: parsed.data.content,
      replyToId: parsed.data.replyToId || null,
      mentions: { create: mentionedUserIds.map((mentionedUserId) => ({ mentionedUserId })) },
    },
    include: {
      author: { select: { id: true, name: true, role: true, avatarUrl: true } },
      replyTo: { select: { id: true, content: true, deletedAt: true, author: { select: { name: true } } } },
      mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
    },
  });
  await notifyEntityParticipants(user.id, parsed.data.entityType, parsed.data.entityId, "Nouveau commentaire DTSC", parsed.data.content);
  if (mentionedUserIds.length) {
    for (const mentionedUserId of mentionedUserIds.filter((id) => id !== user.id)) {
      await prisma.notification.create({
        data: {
          userId: mentionedUserId,
          title: "Mention dans un commentaire DTSC",
          body: parsed.data.content.slice(0, 220),
          type: `MENTION_${parsed.data.entityType}`,
          targetUrl: "/activities",
        },
      });
    }
  }
  await writeApiLog({ request: req, statusCode: 201, userId: user.id, startedAt, metadata: { entityType: parsed.data.entityType, entityId: parsed.data.entityId } });
  return NextResponse.json({ ok: true, comment }, { status: 201 });
}

export async function PATCH(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const parsed = commentMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.content) {
    return NextResponse.json({ error: "Invalid payload", message: "Le commentaire est invalide." }, { status: 400 });
  }
  const comment = await prisma.cooComment.findUnique({ where: { id: parsed.data.id } });
  if (!comment || !(await canAccessEntity(user, comment.entityType, comment.entityId)) || (comment.authorId !== user.id && user.role !== UserRole.ADMIN) || comment.deletedAt) {
    return NextResponse.json({ error: "Forbidden", message: "Modification non autorisée." }, { status: 403 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `activity-comment-update:${user.id}`), 120, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests", message: "Trop de modifications sur une courte période." }, { status: 429 });
  }
  const updated = await prisma.cooComment.update({ where: { id: comment.id }, data: { content: parsed.data.content } });
  await writeAuditLog({ userId: user.id, action: "OPERATIONAL_COMMENT_UPDATED", entity: "CooComment", entityId: comment.id, request: req, metadata: { entityType: comment.entityType, entityId: comment.entityId } });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { commentId: comment.id, entityType: comment.entityType, entityId: comment.entityId } });
  return NextResponse.json({ ok: true, comment: updated });
}

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const parsed = commentMutationSchema.pick({ id: true }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const comment = await prisma.cooComment.findUnique({ where: { id: parsed.data.id } });
  if (!comment || !(await canAccessEntity(user, comment.entityType, comment.entityId)) || (comment.authorId !== user.id && user.role !== UserRole.ADMIN)) {
    return NextResponse.json({ error: "Forbidden", message: "Suppression non autorisée." }, { status: 403 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `activity-comment-delete:${user.id}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests", message: "Trop de suppressions sur une courte période." }, { status: 429 });
  }
  await prisma.cooComment.update({ where: { id: comment.id }, data: { content: "Commentaire supprimé", deletedAt: new Date() } });
  await writeAuditLog({ userId: user.id, action: "OPERATIONAL_COMMENT_DELETED", entity: "CooComment", entityId: comment.id, request: req, metadata: { entityType: comment.entityType, entityId: comment.entityId } });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { commentId: comment.id, entityType: comment.entityType, entityId: comment.entityId } });
  return NextResponse.json({ ok: true });
}

async function canAccessEntity(user: { id: string; role: UserRole }, entityType: string, entityId: string) {
  if (entityType.startsWith("LEGAL_") && user.role === UserRole.ADMIN) {
    return true;
  }
  if (entityType === "COLLAB_REQUEST" && user.role === UserRole.ADMIN) {
    return true;
  }
  if (!entityType.startsWith("LEGAL_") && entityType !== "COLLAB_REQUEST" && (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER || user.role === UserRole.SUPPORT)) {
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
  if (entityType === "COLLAB_REQUEST") {
    return Boolean(await prisma.collaboratorRequest.findFirst({ where: { id: entityId, OR: [{ requesterEmployeeId: employee.id }, { targetEmployeeId: employee.id }] }, select: { id: true } }));
  }
  if (positionCode === "CEO") {
    return true;
  }
  if ((positionCode === "LA" || positionCode === "LEGAL_ADVISOR") && entityType.startsWith("LEGAL_")) {
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
  if (positionCode === "COO" && entityType !== "PAYROLL" && entityType !== "CEO_OBJECTIVE" && entityType !== "CEO_SUPERVISION" && entityType !== "COLLAB_REQUEST") {
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
  if (entityType === "LEGAL_CASE") {
    return Boolean(await prisma.legalCase.findFirst({ where: { id: entityId, OR: [{ requesterEmployeeId: employee.id }, { responsibleLegalId: employee.id }, { createdById: user.id }] }, select: { id: true } }));
  }
  if (entityType === "LEGAL_CONTRACT") {
    return Boolean(await prisma.legalContract.findFirst({ where: { id: entityId, OR: [{ internalResponsibleId: employee.id }, { createdById: user.id }] }, select: { id: true } }));
  }
  if (entityType === "LEGAL_TEMPLATE") {
    return Boolean(await prisma.legalTemplate.findFirst({ where: { id: entityId, authorId: employee.id }, select: { id: true } }));
  }
  if (entityType === "LEGAL_RISK") {
    return Boolean(await prisma.legalRisk.findFirst({ where: { id: entityId, OR: [{ responsibleEmployeeId: employee.id }, { createdById: user.id }] }, select: { id: true } }));
  }
  if (entityType === "LEGAL_DISPUTE") {
    return Boolean(await prisma.legalDispute.findFirst({ where: { id: entityId, OR: [{ followUpResponsibleId: employee.id }, { createdById: user.id }] }, select: { id: true } }));
  }
  if (entityType === "LEGAL_REQUEST") {
    return Boolean(await prisma.legalRequest.findFirst({ where: { id: entityId, OR: [{ requesterEmployeeId: employee.id }, { createdById: user.id }] }, select: { id: true } }));
  }
  if (entityType === "LEGAL_REPORT") {
    return Boolean(await prisma.legalReport.findFirst({ where: { id: entityId, responsibleLegalId: employee.id }, select: { id: true } }));
  }
  if (entityType === "LEGAL_DOCUMENT") {
    const document = await prisma.legalDocument.findUnique({ where: { id: entityId }, select: { confidentialityLevel: true, createdById: true } });
    return document?.createdById === user.id && document.confidentialityLevel === "INTERNAL_PUBLIC";
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
  if (entityType === "COLLAB_REQUEST") {
    const request = await prisma.collaboratorRequest.findUnique({ where: { id: entityId }, select: { requesterUserId: true, targetUserId: true, createdById: true } });
    return uniqueUserIds([request?.requesterUserId, request?.targetUserId, request?.createdById]);
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
  if (entityType === "LEGAL_CASE") {
    const record = await prisma.legalCase.findUnique({ where: { id: entityId }, select: { requesterEmployeeId: true, responsibleLegalId: true, ceoValidationRequired: true, riskLevel: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("LA")), ...(await employeesToUserIds([record?.requesterEmployeeId, record?.responsibleLegalId], record?.createdById)), ...((record?.ceoValidationRequired || record?.riskLevel === "CRITICAL") ? await employeesByPosition("CEO") : [])]);
  }
  if (entityType === "LEGAL_CONTRACT") {
    const record = await prisma.legalContract.findUnique({ where: { id: entityId }, select: { internalResponsibleId: true, ceoValidationRequired: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("LA")), ...(await employeesToUserIds([record?.internalResponsibleId], record?.createdById)), ...(record?.ceoValidationRequired ? await employeesByPosition("CEO") : [])]);
  }
  if (entityType === "LEGAL_TEMPLATE") {
    const record = await prisma.legalTemplate.findUnique({ where: { id: entityId }, select: { authorId: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("LA")), ...(await employeesToUserIds([record?.authorId], record?.createdById))]);
  }
  if (entityType === "LEGAL_RISK") {
    const record = await prisma.legalRisk.findUnique({ where: { id: entityId }, select: { responsibleEmployeeId: true, ceoEscalation: true, riskLevel: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("LA")), ...(await employeesToUserIds([record?.responsibleEmployeeId], record?.createdById)), ...((record?.ceoEscalation || record?.riskLevel === "CRITICAL") ? await employeesByPosition("CEO") : [])]);
  }
  if (entityType === "LEGAL_DOCUMENT") {
    const record = await prisma.legalDocument.findUnique({ where: { id: entityId }, select: { confidentialityLevel: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("LA")), ...((record?.confidentialityLevel === "CEO_ONLY" || record?.confidentialityLevel === "LA_CEO_ONLY") ? await employeesByPosition("CEO") : []), record?.createdById]);
  }
  if (entityType === "LEGAL_DISPUTE") {
    const record = await prisma.legalDispute.findUnique({ where: { id: entityId }, select: { followUpResponsibleId: true, riskLevel: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("LA")), ...(await employeesToUserIds([record?.followUpResponsibleId], record?.createdById)), ...(record?.riskLevel === "CRITICAL" ? await employeesByPosition("CEO") : [])]);
  }
  if (entityType === "LEGAL_REQUEST") {
    const record = await prisma.legalRequest.findUnique({ where: { id: entityId }, select: { requesterEmployeeId: true, priority: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("LA")), ...(await employeesToUserIds([record?.requesterEmployeeId], record?.createdById)), ...(record?.priority === "CRITICAL" ? await employeesByPosition("CEO") : [])]);
  }
  if (entityType === "LEGAL_REPORT") {
    const record = await prisma.legalReport.findUnique({ where: { id: entityId }, select: { responsibleLegalId: true, priority: true, createdById: true } });
    return uniqueUserIds([...(await employeesByPosition("LA")), ...(await employeesToUserIds([record?.responsibleLegalId], record?.createdById)), ...(record?.priority === "CRITICAL" ? await employeesByPosition("CEO") : [])]);
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
  const codes = positionCode === "LA" ? ["LA", "LEGAL_ADVISOR"] : [positionCode];
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { status: { not: "EXITED" }, OR: [{ positionCode: { in: codes } }, { position: { is: { code: { in: codes } } } }] },
    select: { userId: true },
  });
  return employees.map((employee) => employee.userId).filter((id): id is string => Boolean(id));
}

function uniqueUserIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((id): id is string => Boolean(id)))];
}
