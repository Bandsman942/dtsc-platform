import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { organizationId } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const url = new URL(req.url); const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1); const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 50) || 50)); const search = url.searchParams.get("search")?.trim(); const currency = url.searchParams.get("currency")?.trim().toUpperCase(); const status = url.searchParams.get("status")?.trim() || "ACTIVE"; const departmentId = url.searchParams.get("departmentId")?.trim(); const where: Prisma.EnterpriseBudgetLineWhereInput = { organizationId, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { budget: { title: { contains: search, mode: "insensitive" } } }] } : {}), ...(departmentId ? { OR: [{ departmentId }, { budget: { departmentId } }] } : {}), budget: { organizationId, archivedAt: null, status, ...(currency ? { currency } : {}) } }; const [items, total] = await Promise.all([prisma.enterpriseBudgetLine.findMany({ where, include: { budget: { select: { id: true, reference: true, title: true, status: true, currency: true } } }, orderBy: [{ budgetId: "asc" }, { createdAt: "asc" }], skip: (page - 1) * pageSize, take: pageSize }), prisma.enterpriseBudgetLine.count({ where })]); await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "budget-lines", page, pageSize } }); return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}
