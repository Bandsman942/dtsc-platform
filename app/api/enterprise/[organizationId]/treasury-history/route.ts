import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeListParams } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const accountId = url.searchParams.get("accountId")?.trim() || undefined;
  const transactionType = url.searchParams.get("transactionType")?.trim() || undefined;
  const direction = url.searchParams.get("direction")?.trim() || undefined;
  const currencyCode = url.searchParams.get("currencyCode")?.trim().toUpperCase() || undefined;
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  if (to) to.setHours(23, 59, 59, 999);

  const where: Prisma.EnterpriseTreasuryTransactionWhereInput = {
    organizationId,
    ...(status ? { status } : {}),
    ...(accountId ? { financialAccountId: accountId } : {}),
    ...(transactionType ? { transactionType } : {}),
    ...(direction ? { direction } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...((from || to) ? { transactionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search ? { reference: { contains: search, mode: "insensitive" } } : {}),
  };

  const [rawItems, total] = await Promise.all([
    prisma.enterpriseTreasuryTransaction.findMany({
      where,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        financialAccount: { select: { id: true, code: true, name: true, accountType: true, currencyCode: true } },
        payment: { select: { id: true, number: true, status: true, paymentType: true } },
      },
    }),
    prisma.enterpriseTreasuryTransaction.count({ where }),
  ]);

  const transferIds = [...new Set(rawItems.map((item) => item.transferId).filter((id): id is string => Boolean(id)))];
  const transfers = transferIds.length
    ? await prisma.enterpriseAccountTransfer.findMany({
        where: { organizationId, id: { in: transferIds } },
        select: { id: true, number: true, status: true, sourceFinancialAccountId: true, targetFinancialAccountId: true, exchangeRate: true },
      })
    : [];
  const transferById = new Map(transfers.map((transfer) => [transfer.id, transfer]));
  const items = rawItems.map((item) => ({
    ...item,
    transfer: item.transferId ? transferById.get(item.transferId) || null : null,
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "treasury-history" } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}
