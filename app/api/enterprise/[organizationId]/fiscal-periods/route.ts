import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createFiscalPeriod } from "@/lib/enterprise/accounting/master-service";
import { fiscalPeriodCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view"); if (!auth.ok) return auth.response;
  const url = new URL(req.url); const { page, pageSize, search, status } = financeListParams(req); const recordId = url.searchParams.get("recordId")?.trim() || undefined; const fiscalYearId = url.searchParams.get("fiscalYearId")?.trim() || undefined;
  const where: Prisma.EnterpriseFiscalPeriodWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(fiscalYearId ? { fiscalYearId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { fiscalYear: { code: { contains: search, mode: "insensitive" } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseFiscalPeriod.findMany({ where, orderBy: { startDate: "desc" }, skip: recordId ? 0 : (page - 1) * pageSize, take: recordId ? 1 : pageSize, include: { fiscalYear: true, closes: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.enterpriseFiscalPeriod.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "fiscal-periods", recordId: recordId || null, hasSearch: Boolean(search) } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "create", { mutation: true, limit: 80 }); if (!auth.ok) return auth.response;
  const parsed = fiscalPeriodCreateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try { const period = await createFiscalPeriod(organizationId, auth.session.userId, parsed.data); await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_FISCAL_PERIOD_CREATED", entity: "EnterpriseFiscalPeriod", entityId: period.id, request: req, metadata: { organizationId, code: period.code } }); await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "fiscal-periods" } }); return NextResponse.json({ ok: true, period }, { status: 201 }); } catch (error) { return financeErrorResponse(error, "FISCAL_PERIOD_CREATE_FAILED"); }
}
