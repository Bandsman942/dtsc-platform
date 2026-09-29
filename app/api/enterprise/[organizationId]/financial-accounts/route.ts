import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { createManagedFinancialAccount } from "@/lib/enterprise/accounting/financial-account-service";
import { financialAccountCreateSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "view");
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseFinancialAccountWhereInput = {
    organizationId,
    archivedAt: null,
    ...(recordId ? { id: recordId } : {}),
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
  const [rawItems, total] = await Promise.all([
    prisma.enterpriseFinancialAccount.findMany({
      where,
      orderBy: [{ accountType: "asc" }, { code: "asc" }],
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
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
  const cashSessions = rawItems.some((item) => item.accountType === "CASH")
    ? await prisma.enterpriseCashSession.findMany({
      where: {
        organizationId,
        cashierUserId: auth.session.userId,
        status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] },
        financialAccountId: { in: rawItems.filter((item) => item.accountType === "CASH").map((item) => item.id) },
      },
      orderBy: { openedAt: "desc" },
      select: { financialAccountId: true, status: true },
    })
    : [];
  const cashSessionStateByAccountId = new Map<string, string>();
  for (const session of cashSessions) {
    if (!cashSessionStateByAccountId.has(session.financialAccountId)) {
      cashSessionStateByAccountId.set(session.financialAccountId, session.status);
    }
  }
  const capabilities = auth.access.capabilities;
  const items = rawItems.map((item) => {
    const cashSessionState = item.accountType === "CASH"
      ? cashSessionStateByAccountId.get(item.id) || "NONE"
      : null;
    return {
    ...item,
    cashSessionStateForCurrentUser: cashSessionState,
    hasOpenCashSessionForCurrentUser: item.accountType === "CASH" ? cashSessionState === "OPEN" : null,
    capabilities: {
      canEdit: Boolean(capabilities.canWrite),
      canArchive: Boolean(capabilities.canManage),
    },
  };
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "financial-accounts", recordId: recordId || null } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "create", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = financialAccountCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "FINANCIAL_ACCOUNT_INPUT_INVALID");
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
