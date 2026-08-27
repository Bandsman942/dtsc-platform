import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createManagedFinancialAccount } from "@/lib/enterprise/accounting/financial-account-service";
import { financialAccountCreateSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "view");
  if (!auth.ok) return auth.response;
  const { page, pageSize, search, status } = financeListParams(req);
  const where: Prisma.EnterpriseFinancialAccountWhereInput = {
    organizationId,
    archivedAt: null,
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { currencyCode: { contains: search, mode: "insensitive" } },
        { maskedReference: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseFinancialAccount.findMany({
      where,
      orderBy: [{ accountType: "asc" }, { code: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        name: true,
        accountType: true,
        currencyCode: true,
        maskedReference: true,
        openingBalance: true,
        operationalBalance: true,
        reconciledBalance: true,
        availableBalance: true,
        ledgerAccountId: true,
        responsibleUserId: true,
        siteId: true,
        status: true,
        revision: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.enterpriseFinancialAccount.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "financial-accounts" } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "create", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = financialAccountCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const account = await createManagedFinancialAccount(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_FINANCIAL_ACCOUNT_CREATED",
      entity: "EnterpriseFinancialAccount",
      entityId: account.id,
      request: req,
      metadata: { organizationId, accountType: account.accountType, currency: account.currencyCode, code: account.code, maskedReference: account.maskedReference },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "financial-accounts" } });
    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "FINANCIAL_ACCOUNT_CREATE_FAILED");
  }
}
