import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { enterpriseBudgetVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { createEnterpriseBudget } from "@/lib/enterprise/finance/budget-service";
import { getBudgetPosition } from "@/lib/enterprise/finance/commitments";
import { enterpriseBudgetCreateSchema } from "@/lib/enterprise/finance/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url); const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1); const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const status = url.searchParams.get("status")?.trim(); const currency = url.searchParams.get("currency")?.trim().toUpperCase(); const departmentId = url.searchParams.get("departmentId")?.trim(); const search = url.searchParams.get("search")?.trim(); const from = url.searchParams.get("from"); const to = url.searchParams.get("to");
  const filters: Prisma.EnterpriseBudgetWhereInput[] = [enterpriseBudgetVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll })];
  if (status) filters.push({ status }); if (currency) filters.push({ currency }); if (departmentId) filters.push({ departmentId }); if (search) filters.push({ OR: [{ reference: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] });
  if (from) filters.push({ periodEnd: { gte: new Date(from) } }); if (to) filters.push({ periodStart: { lte: new Date(to) } });
  const where: Prisma.EnterpriseBudgetWhereInput = { AND: filters };
  const [budgets, total] = await Promise.all([prisma.enterpriseBudget.findMany({ where, orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }), prisma.enterpriseBudget.count({ where })]);
  const items = await prisma.$transaction(async (tx) => Promise.all(budgets.map(async (budget) => { const position = await getBudgetPosition(tx, organizationId, budget.id); return { ...budget, plannedAmount: position.planned, committedAmount: position.committedRemaining, actualAmount: position.actual, availableAmount: position.available, lineCount: position.lines.length }; }));
  const currencies = await prisma.enterpriseBudget.findMany({ where: enterpriseBudgetVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }), distinct: ["currency"], select: { currency: true }, orderBy: { currency: "asc" }, take: 50 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "budgets", page, pageSize } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, currencies: currencies.map((item) => item.currency), canManage: access.canManage, canCreate: access.canCreate });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-budgets:${session.userId}`), 80, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "write" }); if (!access?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseBudgetCreateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Budget invalide." }, { status: 400 });
  try { const position = await createEnterpriseBudget(organizationId, session.userId, parsed.data); await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_BUDGET_CREATED", entity: "EnterpriseBudget", entityId: position.budget.id, request: req, metadata: { organizationId, reference: position.budget.reference, currency: position.budget.currency } }); await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "budgets" } }); return NextResponse.json({ ok: true, budget: position.budget, position }, { status: 201 }); }
  catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "budgets", error: normalized.code } }); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
