import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { enterpriseOperationalCommentSchema } from "@/lib/enterprise/core-v2/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
type OperationalEntityType = "EnterpriseTask" | "EnterpriseRequest" | "EnterpriseApproval" | "EnterpriseMeeting";

function moduleCodeFor(entityType: OperationalEntityType) {
  if (entityType === "EnterpriseTask") return "TASKS_OPERATIONS";
  if (entityType === "EnterpriseRequest") return "INTERNAL_REQUESTS";
  if (entityType === "EnterpriseApproval") return "VALIDATIONS";
  return "MEETINGS";
}

async function canAccessEntity(organizationId: string, userId: string, canSeeAll: boolean, entityType: OperationalEntityType, entityId: string) {
  if (entityType === "EnterpriseTask") return Boolean(await prisma.enterpriseTask.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(canSeeAll ? {} : { OR: [{ createdByUserId: userId }, { assignedToUserId: userId }] }) }, select: { id: true } }));
  if (entityType === "EnterpriseRequest") return Boolean(await prisma.enterpriseRequest.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(canSeeAll ? {} : { OR: [{ requestedByUserId: userId }, { assignedToUserId: userId }] }) }, select: { id: true } }));
  if (entityType === "EnterpriseApproval") return Boolean(await prisma.enterpriseApproval.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(canSeeAll ? {} : { OR: [{ requestedByUserId: userId }, { approverUserId: userId }] }) }, select: { id: true } }));
  return Boolean(await prisma.enterpriseMeeting.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(canSeeAll ? {} : { OR: [{ organizerUserId: userId }, { participants: { some: { userId } } }] }) }, select: { id: true } }));
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") as OperationalEntityType | null;
  const entityId = url.searchParams.get("entityId")?.trim() || "";
  if (!entityType || !["EnterpriseTask", "EnterpriseRequest", "EnterpriseApproval", "EnterpriseMeeting"].includes(entityType) || !entityId) return NextResponse.json({ error: "Invalid query", message: "Objet opérationnel invalide." }, { status: 400 });
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: moduleCodeFor(entityType), action: "read" });
  if (!access || !(await canAccessEntity(organizationId, session.userId, access.canSeeAll, entityType, entityId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(30, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const [comments, total, events] = await Promise.all([
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType, entityId, deletedAt: null }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseOperationalComment.count({ where: { organizationId, entityType, entityId, deletedAt: null } }),
    page === 1 ? prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType, entityId }, orderBy: { createdAt: "desc" }, take: 30 }) : Promise.resolve([]),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, entityType, entityId, page } });
  return NextResponse.json({ comments, events, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-operational-comment:${session.userId}`), 160, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const parsed = enterpriseOperationalCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Commentaire invalide." }, { status: 400 });
  const data = parsed.data;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: moduleCodeFor(data.entityType), action: "submit" });
  if (!access || !(await canAccessEntity(organizationId, session.userId, access.canSeeAll, data.entityType, data.entityId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const comment = await prisma.$transaction(async (tx) => {
    const saved = await tx.enterpriseOperationalComment.create({ data: { organizationId, entityType: data.entityType, entityId: data.entityId, authorUserId: session.userId, content: data.content } });
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: data.entityType, entityId: data.entityId, eventType: "COMMENT_ADDED", summary: "Commentaire ajouté.", actorUserId: session.userId } });
    return saved;
  });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_OPERATIONAL_COMMENT_CREATED", entity: data.entityType, entityId: data.entityId, request: req, metadata: { organizationId, commentId: comment.id } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, entityType: data.entityType, entityId: data.entityId } });
  return NextResponse.json({ ok: true, comment }, { status: 201 });
}
