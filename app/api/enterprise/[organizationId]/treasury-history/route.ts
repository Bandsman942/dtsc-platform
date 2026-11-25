import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeListParams } from "@/lib/enterprise/accounting/http";
import { directionalAmountTotals, directionalPageTotals } from "@/lib/enterprise/common/analytics";
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

  const result = await prisma.$transaction(async (tx) => {
    const aggregateByDirection = (scope: Prisma.EnterpriseTreasuryTransactionWhereInput) => tx.enterpriseTreasuryTransaction.groupBy({
      by: ["currencyCode", "direction", "status"],
      where: scope,
      _sum: { amount: true },
    });
    const general = aggregateByDirection({ organizationId });
    const [rawItems, total, filteredGroups, generalGroups] = await Promise.all([
      tx.enterpriseTreasuryTransaction.findMany({
        where,
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          financialAccount: { select: { id: true, code: true, name: true, accountType: true, currencyCode: true } },
          payment: { select: { id: true, number: true, status: true, paymentType: true } },
          fundingOperation: { select: { id: true, number: true, status: true, fundingType: true } },
        },
      }),
      tx.enterpriseTreasuryTransaction.count({ where }),
      Object.keys(where).length === 1 ? general : aggregateByDirection(where),
      general,
    ]);
    const transferIds = [...new Set(rawItems.map((item) => item.transferId).filter((id): id is string => Boolean(id)))];
    const transfers = transferIds.length ? await tx.enterpriseAccountTransfer.findMany({
      where: { organizationId, id: { in: transferIds } },
      select: { id: true, number: true, status: true, sourceFinancialAccountId: true, targetFinancialAccountId: true, exchangeRate: true },
    }) : [];
    const transferById = new Map(transfers.map((transfer) => [transfer.id, transfer]));
    const items = rawItems.map((item) => ({
      ...item,
      transfer: item.transferId ? transferById.get(item.transferId) || null : null,
    }));
    return {
      items,
      pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
      filteredTotals: directionalAmountTotals(filteredGroups.map((group) => ({ ...group, amount: group._sum.amount }))),
      generalTotals: directionalAmountTotals(generalGroups.map((group) => ({ ...group, amount: group._sum.amount }))),
      pageTotals: directionalPageTotals(rawItems),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "treasury-history" } });
  return NextResponse.json(result);
}
