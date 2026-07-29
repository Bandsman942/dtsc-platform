import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { transitionEnterpriseRequest } from "@/lib/enterprise/core-v2/service";
import { enterpriseRequestActionSchema } from "@/lib/enterprise/core-v2/validators";
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
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-request-action:${session.userId}`), 140, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "INTERNAL_REQUESTS", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseRequestActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "L’action demandée est invalide." }, { status: 400 });
  const requestRecord = await prisma.enterpriseRequest.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!requestRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = parsed.data;
  const isRequester = requestRecord.requestedByUserId === session.userId;
  const isAssignee = requestRecord.assignedToUserId === session.userId;
  const allowed = data.action === "SUBMIT"
    ? isRequester
    : data.action === "TAKE" || data.action === "FULFILL"
      ? access.canManage || isAssignee
      : data.action === "CANCEL"
        ? access.canManage || isRequester
        : access.canManage;
  if (!allowed) return NextResponse.json({ error: "Forbidden", message: "Vous n’êtes pas autorisé à exécuter cette transition." }, { status: 403 });

  try {
    const updated = await transitionEnterpriseRequest({ organizationId, requestId: id, actorUserId: session.userId, action: data.action, revision: data.revision, comment: data.comment || undefined });
    if ((data.action === "FULFILL" || data.action === "CANCEL") && requestRecord.requestedByUserId !== session.userId) {
      await notifyUser({ userId: requestRecord.requestedByUserId, organizationId, type: "ENTERPRISE_REQUEST", title: data.action === "FULFILL" ? "Demande traitée" : "Demande annulée", body: requestRecord.title, targetUrl: "/enterprise-modules/INTERNAL_REQUESTS" });
    }
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_REQUEST_${data.action}`, entity: "EnterpriseRequest", entityId: id, request: req, metadata: { organizationId, fromStatus: requestRecord.status, toStatus: updated?.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests", requestId: id, action: data.action } });
    return NextResponse.json({ ok: true, request: updated });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests", requestId: id, action: data.action, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
