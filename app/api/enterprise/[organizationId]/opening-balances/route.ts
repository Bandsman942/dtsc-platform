import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { openingBalanceSchema } from "@/lib/enterprise/accounting/finance-domain-schemas";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createOpeningBalanceImport } from "@/lib/enterprise/accounting/opening-balance-service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;

  const { page, pageSize, status } = financeListParams(req);
  const where = { organizationId, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    prisma.enterpriseOpeningBalanceImport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { lines: true } } },
    }),
    prisma.enterpriseOpeningBalanceImport.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "opening-balances" } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "create", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;

  const parsed = openingBalanceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const opening = await createOpeningBalanceImport(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_OPENING_BALANCE_CREATED",
      entity: "EnterpriseOpeningBalanceImport",
      entityId: opening.id,
      request: req,
      metadata: {
        organizationId,
        reference: opening.reference,
        totalDebit: opening.totalDebit.toFixed(),
        totalCredit: opening.totalCredit.toFixed(),
        currency: opening.currencyCode,
      },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "opening-balances" } });
    return NextResponse.json({ ok: true, opening }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "OPENING_BALANCE_CREATE_FAILED");
  }
}
