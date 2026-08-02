import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; contractId: string }> };

const createSchema = z.object({ content: z.string().trim().min(1).max(4000) });
const updateSchema = createSchema.extend({ commentId: z.string().trim().min(1) });
const deleteSchema = z.object({ commentId: z.string().trim().min(1) });

async function contractCommentAccess(organizationId: string, contractId: string, userId: string) {
  const contract = await prisma.enterpriseContract.findFirst({
    where: { id: contractId, organizationId, archivedAt: null },
    select: { id: true, ownerUserId: true, createdByUserId: true },
  });
  if (!contract) return null;
  const approval = await prisma.enterpriseApproval.findFirst({
    where: { organizationId, targetEntityType: "EnterpriseContract", targetEntityId: contractId, archivedAt: null },
    orderBy: { requestedAt: "desc" },
    select: { requestedByUserId: true, approverUserId: true },
  });
  const participant = [contract.ownerUserId, contract.createdByUserId, approval?.requestedByUserId, approval?.approverUserId].filter(Boolean).includes(userId);
  return { contract, approval, participant };
}

async function requireAccess(organizationId: string, contractId: string, session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const moduleAccess = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CONTRACTS", action: "read" });
  if (!moduleAccess) return null;
  const scoped = await contractCommentAccess(organizationId, contractId, session.userId);
  if (!scoped || (!scoped.participant && !moduleAccess.canManage)) return null;
  return { moduleAccess, ...scoped };
}

async function serializeComments(organizationId: string, contractId: string, currentUserId: string) {
  const comments = await prisma.enterpriseOperationalComment.findMany({
    where: { organizationId, entityType: "EnterpriseContract", entityId: contractId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  const users = comments.length ? await prisma.user.findMany({
    where: { id: { in: [...new Set(comments.map((comment) => comment.authorUserId))] } },
    select: { id: true, name: true, email: true },
  }) : [];
  const userById = new Map(users.map((user) => [user.id, user]));
  return comments.map((comment) => ({
    ...comment,
    author: userById.get(comment.authorUserId) || { id: comment.authorUserId, name: "Utilisateur", email: "" },
    canEdit: comment.authorUserId === currentUserId,
    canDelete: comment.authorUserId === currentUserId,
  }));
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, contractId } = await params;
  const access = await requireAccess(organizationId, contractId, session);
  if (!access) return NextResponse.json({ error: "Forbidden", message: "Vous ne participez pas à ce workflow contractuel." }, { status: 403 });
  const comments = await serializeComments(organizationId, contractId, session.userId);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, contractId, domain: "contract-comments" } });
  return NextResponse.json({ comments });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `contract-comment:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, contractId } = await params;
  const access = await requireAccess(organizationId, contractId, session);
  if (!access) return NextResponse.json({ error: "Forbidden", message: "Vous ne participez pas à ce workflow contractuel." }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Le commentaire doit contenir entre 1 et 4 000 caractères." }, { status: 400 });
  const comment = await prisma.enterpriseOperationalComment.create({
    data: { organizationId, entityType: "EnterpriseContract", entityId: contractId, authorUserId: session.userId, content: parsed.data.content, visibility: "PARTICIPANTS" },
  });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_CONTRACT_COMMENT_CREATED", entity: "EnterpriseOperationalComment", entityId: comment.id, request: req, metadata: { organizationId, contractId } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, contractId, domain: "contract-comments" } });
  return NextResponse.json({ ok: true, comment }, { status: 201 });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, contractId } = await params;
  const access = await requireAccess(organizationId, contractId, session);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Modification de commentaire invalide." }, { status: 400 });
  const updated = await prisma.enterpriseOperationalComment.updateMany({
    where: { id: parsed.data.commentId, organizationId, entityType: "EnterpriseContract", entityId: contractId, authorUserId: session.userId, deletedAt: null },
    data: { content: parsed.data.content },
  });
  if (updated.count !== 1) return NextResponse.json({ error: "Forbidden", message: "Seul l’auteur peut modifier ce commentaire." }, { status: 403 });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_CONTRACT_COMMENT_UPDATED", entity: "EnterpriseOperationalComment", entityId: parsed.data.commentId, request: req, metadata: { organizationId, contractId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, contractId, domain: "contract-comments" } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, contractId } = await params;
  const access = await requireAccess(organizationId, contractId, session);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const removed = await prisma.enterpriseOperationalComment.updateMany({
    where: { id: parsed.data.commentId, organizationId, entityType: "EnterpriseContract", entityId: contractId, authorUserId: session.userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (removed.count !== 1) return NextResponse.json({ error: "Forbidden", message: "Seul l’auteur peut supprimer ce commentaire." }, { status: 403 });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_CONTRACT_COMMENT_DELETED", entity: "EnterpriseOperationalComment", entityId: parsed.data.commentId, request: req, metadata: { organizationId, contractId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, contractId, domain: "contract-comments" } });
  return NextResponse.json({ ok: true });
}
