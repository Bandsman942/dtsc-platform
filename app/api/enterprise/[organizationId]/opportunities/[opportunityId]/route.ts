import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog, writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { updateEnterpriseOpportunity } from "@/lib/enterprise/crm-sales/service";
import { opportunityUpdateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; opportunityId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, opportunityId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_PIPELINE", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const page = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get("page") || "1") || 1));
  const opportunity = await prisma.enterpriseOpportunity.findFirst({
    where: { id: opportunityId, organizationId, archivedAt: null },
    include: { quotes: { where: { archivedAt: null }, select: { id: true, reference: true, status: true, currency: true, totalAmount: true }, orderBy: { createdAt: "desc" }, take: 25 } },
  });
  if (!opportunity) return NextResponse.json({ error: "OPPORTUNITY_NOT_FOUND", message: "Opportunité introuvable." }, { status: 404 });
  const events = await prisma.enterpriseOperationalEvent.findMany({
    where: { organizationId, entityType: "EnterpriseOpportunity", entityId: opportunityId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 50,
    take: 51,
  });
  const visible = events.slice(0, 50);
  const commentIds = visible.flatMap((event) => {
    const value = event.metadataJson;
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const id = value.commentId;
    return typeof id === "string" ? [id] : [];
  });
  const comments = commentIds.length ? await prisma.enterpriseOperationalComment.findMany({
    where: { organizationId, entityType: "EnterpriseOpportunity", entityId: opportunityId, id: { in: commentIds }, deletedAt: null },
    select: { id: true, content: true },
  }) : [];
  const textById = new Map(comments.map((item) => [item.id, item.content]));
  const actorIds = [...new Set(visible.map((event) => event.actorUserId))];
  const actors = actorIds.length ? await prisma.user.findMany({
    where: { id: { in: actorIds }, organizationMemberships: { some: { organizationId } } },
    select: { id: true, name: true },
  }) : [];
  const nameById = new Map(actors.map((actor) => [actor.id, actor.name]));
  const timeline = visible.map((event) => {
    const metadata = event.metadataJson;
    const commentId = metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.commentId === "string" ? metadata.commentId : null;
    return {
      id: event.id, eventType: event.eventType, summary: event.summary,
      fromStatus: event.fromStatus, toStatus: event.toStatus,
      actorUserId: event.actorUserId, actorLabel: nameById.get(event.actorUserId) || null, createdAt: event.createdAt,
      metadataJson: event.eventType === "OPPORTUNITY_UPDATED" ? event.metadataJson : null,
      note: commentId ? textById.get(commentId) || null : null,
    };
  });
  const lead = await prisma.enterpriseLead.findFirst({
    where: { organizationId, convertedOpportunityId: opportunityId, archivedAt: null },
    select: { id: true, reference: true, status: true },
  });
  return NextResponse.json({
    opportunity, timeline, lead, page, hasMore: events.length > 50,
    canWrite: Boolean(access.canWrite || access.canManage),
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-opportunity-edit:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, opportunityId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_PIPELINE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = opportunityUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Opportunité invalide." }, { status: 400 });
  try {
    const opportunity = await updateEnterpriseOpportunity(organizationId, opportunityId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: "ENTERPRISE_OPPORTUNITY_UPDATED", entity: "EnterpriseOpportunity", entityId: opportunityId, request: req, metadata: { organizationId } }),
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "opportunities", action: "edit" } }),
    ]);
    return NextResponse.json({ ok: true, opportunity });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "OPPORTUNITY_UPDATE_FAILED", req);
  }
}
