import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreAccess } from "@/lib/enterprise/enterprise-core-access";
import { enterpriseCoreUpdateSchema } from "@/lib/enterprise/enterprise-core-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

const statusByAction = {
  START: "IN_PROGRESS",
  SUBMIT: "SUBMITTED",
  REQUEST_VALIDATION: "PENDING_VALIDATION",
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  COMPLETE: "COMPLETED",
  CANCEL: "CANCELLED",
  ARCHIVE: "ARCHIVED",
} as const;

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-core-update:${session.userId}`), 150, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const parsed = enterpriseCoreUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "L’action demandée est invalide." }, { status: 400 });
  const data = parsed.data;
  if (data.action === "REJECT" && !data.comment) {
    return NextResponse.json({ error: "Comment required", message: "Un motif est obligatoire pour rejeter un élément." }, { status: 400 });
  }
  const record = await prisma.enterpriseCoreRecord.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isDesignatedValidator = record.validatorUserId === session.userId && (data.action === "APPROVE" || data.action === "REJECT");
  const sensitiveAction = ["APPROVE", "REJECT", "ARCHIVE", "CANCEL"].includes(data.action) && !isDesignatedValidator;
  const access = await getEnterpriseCoreAccess({
    session,
    organizationId,
    moduleCode: record.moduleCode,
    action: sensitiveAction ? "write" : "submit",
  });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const related = [record.createdById, record.requestedById, record.assignedToUserId, record.validatorUserId].includes(session.userId);
  if (!access.canSeeAll && !related) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if ((data.action === "APPROVE" || data.action === "REJECT") && record.status !== "PENDING_VALIDATION") {
    return NextResponse.json({ error: "Invalid status", message: "Cet élément doit être en attente de validation avant toute décision." }, { status: 400 });
  }
  if ((data.action === "APPROVE" || data.action === "REJECT") && !access.canManage && !isDesignatedValidator) {
    return NextResponse.json({ error: "Forbidden", message: "Seul le validateur désigné ou un responsable peut prendre cette décision." }, { status: 403 });
  }

  const nextStatus = data.action === "COMMENT" ? record.status : statusByAction[data.action];
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.enterpriseCoreRecord.update({
      where: { id },
      data: {
        status: nextStatus,
        updatedById: session.userId,
        startedAt: data.action === "START" ? new Date() : undefined,
        completedAt: data.action === "COMPLETE" || data.action === "APPROVE" ? new Date() : undefined,
        archivedAt: data.action === "ARCHIVE" ? new Date() : undefined,
      },
    });
    await tx.enterpriseCoreEvent.create({
      data: {
        organizationId,
        recordId: id,
        eventType: data.action,
        summary: data.comment || `Statut mis à jour : ${nextStatus}.`,
        fromStatus: record.status,
        toStatus: nextStatus,
        actorUserId: session.userId,
      },
    });
    if (data.comment) {
      await tx.enterpriseCoreComment.create({
        data: { organizationId, recordId: id, authorUserId: session.userId, content: data.comment },
      });
    }
    return saved;
  });
  await writeAuditLog({
    userId: session.userId,
    action: `ENTERPRISE_CORE_${data.action}`,
    entity: "EnterpriseCoreRecord",
    entityId: id,
    request: req,
    metadata: { organizationId, moduleCode: record.moduleCode, fromStatus: record.status, toStatus: nextStatus },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, action: data.action } });
  return NextResponse.json({ ok: true, record: updated });
}
