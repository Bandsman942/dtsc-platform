import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { createFiscalYear } from "@/lib/enterprise/accounting/master-service";
import { fiscalYearCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view"); if (!auth.ok) return auth.response;
  const items = await prisma.enterpriseFiscalYear.findMany({ where: { organizationId }, orderBy: { startDate: "desc" }, include: { periods: { orderBy: { startDate: "asc" } } } });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "fiscal-years" } });
  return NextResponse.json({ items });
}
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "create", { mutation: true, limit: 40 }); if (!auth.ok) return auth.response;
  const parsed = fiscalYearCreateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try { const year = await createFiscalYear(organizationId, auth.session.userId, parsed.data); await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_FISCAL_YEAR_CREATED", entity: "EnterpriseFiscalYear", entityId: year.id, request: req, metadata: { organizationId, code: year.code } }); await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "fiscal-years" } }); return NextResponse.json({ ok: true, year }, { status: 201 }); } catch (error) { return financeErrorResponse(error, "FISCAL_YEAR_CREATE_FAILED"); }
}
