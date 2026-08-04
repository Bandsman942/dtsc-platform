import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { enterpriseBudgetVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { updateEnterpriseBudget } from "@/lib/enterprise/finance/budget-service";
import { getBudgetPosition } from "@/lib/enterprise/finance/commitments";
import { enterpriseBudgetUpdateSchema } from "@/lib/enterprise/finance/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const visibility = enterpriseBudgetVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll });
  const budget = await prisma.enterpriseBudget.findFirst({ where: { AND: [visibility, { id }] } }); if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const position = await prisma.$transaction((tx) => getBudgetPosition(tx, organizationId, id));
  const [purchases, expenses, links, events, approval] = await Promise.all([
    prisma.enterprisePurchase.findMany({ where: { organizationId, budgetLineId: { in: position.lines.map((line) => line.line.id) }, archivedAt: null }, select: { id: true, reference: true, title: true, status: true, currency: true, totalAmount: true, budgetLineId: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.enterpriseExpense.findMany({ where: { organizationId, budgetLineId: { in: position.lines.map((line) => line.line.id) }, archivedAt: null }, select: { id: true, reference: true, title: true, status: true, currency: true, amount: true, budgetLineId: true, expenseDate: true }, orderBy: { expenseDate: "desc" }, take: 100 }),
    prisma.enterpriseEntityLink.findMany({ where: { organizationId, OR: [{ sourceEntityType: "EnterpriseBudget", sourceEntityId: id }, { targetEntityType: "EnterpriseBudget", targetEntityId: id }] }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.enterpriseOperationalEvent.findMany({ where: { organizationId, entityType: "EnterpriseBudget", entityId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseBudget", targetEntityId: id, archivedAt: null }, orderBy: { requestedAt: "desc" } }),
  ]);
  const [alerts, versions] = await Promise.all([
    prisma.enterpriseBudgetAlert.findMany({ where: { organizationId, budgetId: id }, orderBy: [{ status: "asc" }, { severity: "desc" }, { triggeredAt: "desc" }], take: 100 }),
    prisma.enterpriseBudget.findMany({ where: { organizationId, OR: [{ id: position.budget.parentBudgetId || id }, { parentBudgetId: position.budget.parentBudgetId || id }], archivedAt: null }, select: { id: true, reference: true, title: true, scenarioCode: true, versionNumber: true, status: true, createdAt: true, approvedAt: true, frozenAt: true }, orderBy: { versionNumber: "desc" }, take: 50 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "budgets", budgetId: id } });
  return NextResponse.json({ budget: position.budget, lines: position.lines.map((entry) => ({ ...entry.line, plannedAmount: entry.planned, committedAmount: entry.remainingCommitment, actualAmount: entry.actual, availableAmount: entry.available })), totals: { plannedAmount: position.planned, committedAmount: position.committedRemaining, actualAmount: position.actual, availableAmount: position.available }, purchases, expenses, links, events, approval, alerts, versions, canManage: access.canManage });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const limited = await rateLimit(getRateLimitKey(req, `enterprise-budget-update:${session.userId}`), 100, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "write" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const current = await prisma.enterpriseBudget.findFirst({ where: { id, organizationId, archivedAt: null } }); if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 }); if (!access.canManage && current.createdByUserId !== session.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseBudgetUpdateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Budget invalide." }, { status: 400 });
  try { const position = await updateEnterpriseBudget(organizationId, id, session.userId, parsed.data); await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_BUDGET_UPDATED", entity: "EnterpriseBudget", entityId: id, request: req, metadata: { organizationId, revision: parsed.data.revision } }); await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "budgets", budgetId: id } }); return NextResponse.json({ ok: true, budget: position.budget, position }); }
  catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
