import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canMutateOwnedObject, enterpriseRequestVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseOperationalTimeline, updateEnterpriseRequest } from "@/lib/enterprise/core-v2/service";
import { enterpriseRequestUpdateSchema } from "@/lib/enterprise/core-v2/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "INTERNAL_REQUESTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const requestRecord = await prisma.enterpriseRequest.findFirst({ where: { ...enterpriseRequestVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), id } });
  if (!requestRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [timeline, approvals, links] = await Promise.all([
    getEnterpriseOperationalTimeline({ organizationId, entityType: "EnterpriseRequest", entityId: id }),
    prisma.enterpriseApproval.findMany({ where: { organizationId, targetEntityType: "EnterpriseRequest", targetEntityId: id, archivedAt: null }, orderBy: { requestedAt: "desc" }, take: 20 }),
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseRequest", sourceEntityId: id }, { targetEntityType: "EnterpriseRequest", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests", requestId: id } });
  return NextResponse.json({ request: requestRecord, timeline, approvals, links, canManage: access.canManage, currentUserId: session.userId });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-request-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "INTERNAL_REQUESTS", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseRequestUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Modification invalide." }, { status: 400 });
  const existing = await prisma.enterpriseRequest.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canMutateOwnedObject({ canManage: access.canManage, userId: session.userId, relatedUserIds: [existing.requestedByUserId, existing.assignedToUserId] })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access.canManage && existing.status !== "DRAFT") return NextResponse.json({ error: "Forbidden", message: "Le demandeur ne peut modifier librement que son brouillon." }, { status: 403 });
  try {
    const data = parsed.data;
    const requestRecord = await updateEnterpriseRequest({
      organizationId,
      requestId: id,
      actorUserId: session.userId,
      revision: data.revision,
      data: {
        requestType: data.requestType,
        title: data.title,
        description: data.description,
        priority: data.priority,
        assignedToUserId: data.assignedToUserId === undefined ? undefined : data.assignedToUserId || null,
        departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
        dueAt: data.dueAt === undefined ? undefined : data.dueAt instanceof Date ? data.dueAt : null,
      },
    });
    if (requestRecord?.assignedToUserId && requestRecord.assignedToUserId !== existing.assignedToUserId && requestRecord.assignedToUserId !== session.userId) {
      await notifyUser({ userId: requestRecord.assignedToUserId, organizationId, type: "ENTERPRISE_REQUEST", title: "Demande affectée", body: requestRecord.title, targetUrl: "/enterprise-modules/INTERNAL_REQUESTS" });
    }
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_REQUEST_UPDATED", entity: "EnterpriseRequest", entityId: id, request: req, metadata: { organizationId, revision: data.revision } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests", requestId: id } });
    return NextResponse.json({ ok: true, request: requestRecord });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "requests", requestId: id, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
