import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { enterpriseExpenseVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { financeVisibleDocumentWhere, validateFinanceDocumentIds } from "@/lib/enterprise/finance/document-visibility";
import { updateEnterpriseExpense } from "@/lib/enterprise/finance/expense-service";
import { enterpriseExpenseUpdateSchema } from "@/lib/enterprise/finance/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const visibility = enterpriseExpenseVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll });
  const expense = await prisma.enterpriseExpense.findFirst({ where: { AND: [visibility, { id }] }, include: { supplier: true, purchase: { include: { receipts: { include: { items: true } } } }, budgetLine: { include: { budget: true } } } });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [links, events, approval] = await Promise.all([
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseExpense", sourceEntityId: id }, { targetEntityType: "EnterpriseExpense", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterpriseExpense", entityId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseExpense", targetEntityId: id, archivedAt: null }, orderBy: { requestedAt: "desc" } }),
  ]);
  const documentIds = links.filter((link) => link.sourceEntityType === "EnterpriseDocument" && link.linkType === "SUPPORTING_DOCUMENT").map((link) => link.sourceEntityId);
  const documentVisibility = await financeVisibleDocumentWhere(organizationId, session.userId);
  const documents = documentIds.length ? await prisma.enterpriseDocument.findMany({ where: { AND: [documentVisibility, { id: { in: documentIds } }] }, select: { id: true, title: true, documentType: true, visibility: true, currentVersion: true } }) : [];
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "expenses", expenseId: id } });
  return NextResponse.json({ expense: { ...expense, budgetStatus: expense.budgetLineId ? "BUDGETED" : "UNBUDGETED" }, documents, links, events, approval, canManage: access.canManage });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-expense-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const current = await prisma.enterpriseExpense.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage && current.createdByUserId !== session.userId && current.requestedByUserId !== session.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseExpenseUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Dépense invalide." }, { status: 400 });
  let data = parsed.data;
  if (parsed.data.documentIds !== undefined) {
    const documents = await validateFinanceDocumentIds(organizationId, session.userId, parsed.data.documentIds);
    if (!documents.ok) return NextResponse.json({ error: "INVALID_EXPENSE_DOCUMENT", message: "Un justificatif n’est pas accessible dans votre contexte actuel." }, { status: 400 });
    data = { ...parsed.data, documentIds: documents.ids };
  }
  try {
    const expense = await updateEnterpriseExpense(organizationId, id, session.userId, data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_EXPENSE_UPDATED", entity: "EnterpriseExpense", entityId: id, request: req, metadata: { organizationId, revision: parsed.data.revision } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "expenses", expenseId: id } });
    return NextResponse.json({ ok: true, expense });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}