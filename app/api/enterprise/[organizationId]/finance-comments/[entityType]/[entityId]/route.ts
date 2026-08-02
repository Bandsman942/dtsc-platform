import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

const ENTITY_MODULE = {
  EnterpriseSalesInvoice: "FINANCE_RECEIVABLES",
  EnterpriseSupplierInvoice: "FINANCE_PAYABLES",
  EnterprisePayment: "FINANCE_PAYMENTS",
  EnterpriseFinancialAccount: "FINANCE_TREASURY",
  EnterpriseCashSession: "FINANCE_CASH",
  EnterpriseBankStatement: "FINANCE_BANK",
  EnterpriseReconciliationSession: "FINANCE_RECONCILIATION",
} as const;

type FinanceEntityType = keyof typeof ENTITY_MODULE;
type Params = { params: Promise<{ organizationId: string; entityType: string; entityId: string }> };
const createSchema = z.object({ content: z.string().trim().min(1).max(4000) });
const updateSchema = z.object({ commentId: z.string().cuid(), content: z.string().trim().min(1).max(4000) });
const deleteSchema = z.object({ commentId: z.string().cuid() });

function isFinanceEntityType(value: string): value is FinanceEntityType {
  return Object.prototype.hasOwnProperty.call(ENTITY_MODULE, value);
}

async function financeEntityExists(organizationId: string, entityType: FinanceEntityType, entityId: string) {
  switch (entityType) {
    case "EnterpriseSalesInvoice":
      return Boolean(await prisma.enterpriseSalesInvoice.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
    case "EnterpriseSupplierInvoice":
      return Boolean(await prisma.enterpriseSupplierInvoice.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
    case "EnterprisePayment":
      return Boolean(await prisma.enterprisePayment.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
    case "EnterpriseFinancialAccount":
      return Boolean(await prisma.enterpriseFinancialAccount.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
    case "EnterpriseCashSession":
      return Boolean(await prisma.enterpriseCashSession.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
    case "EnterpriseBankStatement":
      return Boolean(await prisma.enterpriseBankStatement.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
    case "EnterpriseReconciliationSession":
      return Boolean(await prisma.enterpriseReconciliationSession.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }));
  }
}

async function resolveContext(req: Request, raw: { organizationId: string; entityType: string; entityId: string }, mutation = false) {
  if (!isFinanceEntityType(raw.entityType)) {
    return { ok: false as const, response: NextResponse.json({ error: "FINANCE_COMMENT_ENTITY_INVALID", message: "Cet objet financier ne prend pas en charge les commentaires." }, { status: 400 }) };
  }
  const moduleCode = ENTITY_MODULE[raw.entityType];
  const auth = await authorizeFinanceRequest(req, raw.organizationId, moduleCode, mutation ? "update" : "view", mutation ? { mutation: true, limit: 120 } : undefined);
  if (!auth.ok) return auth;
  if (!(await financeEntityExists(raw.organizationId, raw.entityType, raw.entityId))) {
    return { ok: false as const, response: NextResponse.json({ error: "FINANCE_COMMENT_ENTITY_NOT_FOUND", message: "L’objet financier demandé est introuvable." }, { status: 404 }) };
  }
  return { ok: true as const, auth, entityType: raw.entityType, moduleCode };
}

async function serializeComments(organizationId: string, entityType: FinanceEntityType, entityId: string, currentUserId: string) {
  const comments = await prisma.enterpriseFinanceComment.findMany({
    where: { organizationId, entityType, entityId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const authorIds = [...new Set(comments.map((comment) => comment.authorUserId))];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } });
  const byId = new Map(authors.map((author) => [author.id, author]));
  return comments.map((comment) => ({
    ...comment,
    author: byId.get(comment.authorUserId) || { id: comment.authorUserId, name: "Utilisateur", email: "" },
    canEdit: comment.authorUserId === currentUserId,
    canDelete: comment.authorUserId === currentUserId,
  }));
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const raw = await params;
  const context = await resolveContext(req, raw);
  if (!context.ok) return context.response;
  const comments = await serializeComments(raw.organizationId, context.entityType, raw.entityId, context.auth.session.userId);
  await writeApiLog({ request: req, statusCode: 200, userId: context.auth.session.userId, startedAt, metadata: { organizationId: raw.organizationId, domain: "finance-comments", entityType: context.entityType, entityId: raw.entityId } });
  return NextResponse.json({ comments });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const raw = await params;
  const context = await resolveContext(req, raw, true);
  if (!context.ok) return context.response;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "FINANCE_COMMENT_INVALID", message: parsed.error.issues[0]?.message || "Commentaire invalide." }, { status: 400 });
  const comment = await prisma.enterpriseFinanceComment.create({
    data: { organizationId: raw.organizationId, entityType: context.entityType, entityId: raw.entityId, authorUserId: context.auth.session.userId, content: parsed.data.content },
  });
  await writeAuditLog({ userId: context.auth.session.userId, action: "ENTERPRISE_FINANCE_COMMENT_CREATED", entity: context.entityType, entityId: raw.entityId, request: req, metadata: { organizationId: raw.organizationId, commentId: comment.id } });
  await writeApiLog({ request: req, statusCode: 201, userId: context.auth.session.userId, startedAt, metadata: { organizationId: raw.organizationId, domain: "finance-comments" } });
  return NextResponse.json({ ok: true, comment }, { status: 201 });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const raw = await params;
  const context = await resolveContext(req, raw, true);
  if (!context.ok) return context.response;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "FINANCE_COMMENT_INVALID", message: parsed.error.issues[0]?.message || "Commentaire invalide." }, { status: 400 });
  const existing = await prisma.enterpriseFinanceComment.findFirst({ where: { id: parsed.data.commentId, organizationId: raw.organizationId, entityType: context.entityType, entityId: raw.entityId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "FINANCE_COMMENT_NOT_FOUND", message: "Commentaire introuvable." }, { status: 404 });
  if (existing.authorUserId !== context.auth.session.userId) return NextResponse.json({ error: "FINANCE_COMMENT_AUTHOR_ONLY", message: "Seul l’auteur peut modifier ce commentaire." }, { status: 403 });
  const comment = await prisma.enterpriseFinanceComment.update({ where: { id: existing.id }, data: { content: parsed.data.content, revision: { increment: 1 } } });
  await writeAuditLog({ userId: context.auth.session.userId, action: "ENTERPRISE_FINANCE_COMMENT_UPDATED", entity: context.entityType, entityId: raw.entityId, request: req, metadata: { organizationId: raw.organizationId, commentId: comment.id, revision: comment.revision } });
  await writeApiLog({ request: req, statusCode: 200, userId: context.auth.session.userId, startedAt, metadata: { organizationId: raw.organizationId, domain: "finance-comments" } });
  return NextResponse.json({ ok: true, comment });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const raw = await params;
  const context = await resolveContext(req, raw, true);
  if (!context.ok) return context.response;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "FINANCE_COMMENT_INVALID", message: parsed.error.issues[0]?.message || "Commentaire invalide." }, { status: 400 });
  const existing = await prisma.enterpriseFinanceComment.findFirst({ where: { id: parsed.data.commentId, organizationId: raw.organizationId, entityType: context.entityType, entityId: raw.entityId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "FINANCE_COMMENT_NOT_FOUND", message: "Commentaire introuvable." }, { status: 404 });
  if (existing.authorUserId !== context.auth.session.userId) return NextResponse.json({ error: "FINANCE_COMMENT_AUTHOR_ONLY", message: "Seul l’auteur peut supprimer ce commentaire." }, { status: 403 });
  await prisma.enterpriseFinanceComment.update({ where: { id: existing.id }, data: { archivedAt: new Date(), revision: { increment: 1 } } });
  await writeAuditLog({ userId: context.auth.session.userId, action: "ENTERPRISE_FINANCE_COMMENT_ARCHIVED", entity: context.entityType, entityId: raw.entityId, request: req, metadata: { organizationId: raw.organizationId, commentId: existing.id } });
  await writeApiLog({ request: req, statusCode: 200, userId: context.auth.session.userId, startedAt, metadata: { organizationId: raw.organizationId, domain: "finance-comments" } });
  return NextResponse.json({ ok: true });
}
