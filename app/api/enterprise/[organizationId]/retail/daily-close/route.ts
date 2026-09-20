import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailDailyCloseCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createRetailDailyClose } from "@/lib/enterprise/retail/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, status, from, to } = retailListParams(req);
  const where: Prisma.EnterpriseRetailDailyCloseWhereInput = { organizationId, ...(status ? { status } : {}), ...(from || to ? { businessDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) };
  const [rawItems, total] = await Promise.all([
    prisma.enterpriseRetailDailyClose.findMany({ where, orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { lines: true } }),
    prisma.enterpriseRetailDailyClose.count({ where }),
  ]);
  const cashSessionIds = [...new Set(rawItems.flatMap((item) => item.lines.map((line) => line.cashSessionId).filter((id): id is string => Boolean(id))))];
  const [cashSessions, cashApprovals] = cashSessionIds.length ? await Promise.all([
    prisma.enterpriseCashSession.findMany({ where: { organizationId, id: { in: cashSessionIds } }, select: { id: true, status: true } }),
    prisma.enterpriseApproval.findMany({
      where: { organizationId, targetEntityType: "EnterpriseCashSession", targetEntityId: { in: cashSessionIds }, status: "PENDING", archivedAt: null },
      select: { targetEntityId: true, approverUserId: true },
    }),
  ]) : [[], []];
  const cashStatusById = new Map(cashSessions.map((session) => [session.id, session.status]));
  const cashApproverById = new Map(cashApprovals.map((approval) => [approval.targetEntityId, approval.approverUserId]));
  const items = rawItems.map((item) => {
    const linkedCashSessionIds = item.lines.map((line) => line.cashSessionId).filter((id): id is string => Boolean(id));
    const canManage = auth.access.canManage && item.status === "SUBMITTED";
    const canApprove = canManage && linkedCashSessionIds.every((sessionId) => {
      const status = cashStatusById.get(sessionId);
      return status === "CLOSED" || (status === "PENDING_VALIDATION" && cashApproverById.get(sessionId) === auth.session.userId);
    });
    const canReject = canManage && linkedCashSessionIds.every((sessionId) => {
      const status = cashStatusById.get(sessionId);
      return status === "REJECTED" || (status === "PENDING_VALIDATION" && cashApproverById.get(sessionId) === auth.session.userId);
    });
    return { ...item, capabilities: { canApprove, canReject } };
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-daily-close", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "submit", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = retailDailyCloseCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Clôture invalide." }, { status: 400 });
  try {
    const result = await createRetailDailyClose(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_DAILY_CLOSE_SUBMITTED", entity: "EnterpriseRetailDailyClose", entityId: result.close.id, request: req, metadata: { organizationId, number: result.close.number, businessDate: result.close.businessDate.toISOString(), lineCount: result.close.lines.length, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-daily-close", action: "submit" } });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_DAILY_CLOSE_CREATE_FAILED");
  }
}
