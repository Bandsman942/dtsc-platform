import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { openCashSession } from "@/lib/enterprise/accounting/treasury-service";
import { cashSessionOpenSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "view");
  if (!auth.ok) return auth.response;

  const { page, pageSize, status } = financeListParams(req);
  const where = { organizationId, ...(status ? { status } : {}) };
  const [rawItems, total] = await Promise.all([
    prisma.enterpriseCashSession.findMany({
      where,
      orderBy: { openedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        financialAccount: { select: { id: true, code: true, name: true, currencyCode: true } },
        _count: { select: { movements: true, counts: true, discrepancies: true } },
      },
    }),
    prisma.enterpriseCashSession.count({ where }),
  ]);
  const items = rawItems.map((item) => ({
    ...item,
    theoreticalClosingAmount: item.expectedClosingAmount,
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "cash-sessions" } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "create", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = cashSessionOpenSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const session = await openCashSession(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CASH_SESSION_OPENED",
      entity: "EnterpriseCashSession",
      entityId: session.id,
      request: req,
      metadata: { organizationId, financialAccountId: session.financialAccountId, openingAmount: session.openingAmount.toFixed() },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "cash-sessions" } });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "CASH_SESSION_OPEN_FAILED");
  }
}
