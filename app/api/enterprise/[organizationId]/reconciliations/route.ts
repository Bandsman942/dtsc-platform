import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createReconciliationSession } from "@/lib/enterprise/accounting/treasury-service";
import { reconciliationCreateSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECONCILIATION", "view");
  if (!auth.ok) return auth.response;

  const { page, pageSize, status } = financeListParams(req);
  const where = { organizationId, ...(status ? { status } : {}) };
  const [rawItems, total] = await Promise.all([
    prisma.enterpriseReconciliationSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        financialAccount: { select: { id: true, code: true, name: true, currencyCode: true } },
        _count: { select: { matches: true } },
      },
    }),
    prisma.enterpriseReconciliationSession.count({ where }),
  ]);
  const statementIds = [...new Set(rawItems.map((item) => item.bankStatementId).filter(Boolean) as string[])];
  const statements = await prisma.enterpriseBankStatement.findMany({
    where: { organizationId, id: { in: statementIds } },
    select: { id: true, reference: true, statementDate: true, periodStart: true, periodEnd: true, currencyCode: true, closingBalance: true },
  });
  const statementById = new Map(statements.map((statement) => [statement.id, statement]));
  const items = rawItems.map((item) => ({
    ...item,
    bankStatement: item.bankStatementId ? statementById.get(item.bankStatementId) || null : null,
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "reconciliations" } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECONCILIATION", "create", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = reconciliationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const session = await createReconciliationSession(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RECONCILIATION_CREATED",
      entity: "EnterpriseReconciliationSession",
      entityId: session.id,
      request: req,
      metadata: { organizationId, financialAccountId: session.financialAccountId, bankStatementId: session.bankStatementId },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "reconciliations" } });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "RECONCILIATION_CREATE_FAILED");
  }
}
