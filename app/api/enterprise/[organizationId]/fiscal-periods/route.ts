import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { createFiscalPeriod } from "@/lib/enterprise/accounting/master-service";
import { fiscalPeriodCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view"); if (!auth.ok) return auth.response;
  const items = await prisma.enterpriseFiscalPeriod.findMany({ where: { organizationId }, orderBy: { startDate: "desc" }, include: { fiscalYear: true, financialCloses: { orderBy: { createdAt: "desc" }, take: 1 } } });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "fiscal-periods" } });
  return NextResponse.json({ items });
}
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "create", { mutation: true, limit: 80 }); if (!auth.ok) return auth.response;
  const parsed = fiscalPeriodCreateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try { const period = await createFiscalPeriod(organizationId, auth.session.userId, parsed.data); await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_FISCAL_PERIOD_CREATED", entity: "EnterpriseFiscalPeriod", entityId: period.id, request: req, metadata: { organizationId, code: period.code } }); await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "fiscal-periods" } }); return NextResponse.json({ ok: true, period }, { status: 201 }); } catch (error) { return financeErrorResponse(error, "FISCAL_PERIOD_CREATE_FAILED"); }
}
