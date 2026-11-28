import { Prisma } from "@prisma/client";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";

const Exact = Prisma.Decimal.clone({ precision: 48 });

/** Shared cash-side authority: a deposit/withdrawal belongs to its till,
 * never to the possibly shared operator float account. Historical accounts
 * are retained, regardless of their current active/archived state. */
export async function mobileMoneyOperationReadScope(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  const visibleSites = await retailFinanceReadSiteScope(organizationId, userId, "VIEW_SALES", tx);
  const permittedCashAccountIds = visibleSites === null ? null : (await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId, siteId: { in: visibleSites }, accountType: "CASH" },
    select: { id: true },
  })).map(account => account.id);
  const where: Prisma.EnterpriseMobileMoneyTransactionWhereInput = {
    organizationId,
    ...(permittedCashAccountIds !== null ? { cashAccountId: { in: permittedCashAccountIds } } : {}),
  };
  return { visibleSites, where };
}

export function maskMobileMoneyHistoryPhone(phone: string) {
  return phone.length > 7 ? phone.slice(0, 4) + "••••" + phone.slice(-3) : "••••";
}

/** Only authorized data goes into the returned projection, never an
 * organization-wide cached aggregate filtered after pagination. */
export async function readMobileMoneyDashboardOperations(tx: Prisma.TransactionClient, input: {
  organizationId: string; userId: string; from: Date; to: Date;
}) {
  const { organizationId, userId, from, to } = input;
  const { visibleSites, where: scope } = await mobileMoneyOperationReadScope(tx, organizationId, userId);
  const where: Prisma.EnterpriseMobileMoneyTransactionWhereInput = { ...scope, occurredAt: { gte: from, lte: to } };
  const [rows, groups] = await Promise.all([
    tx.enterpriseMobileMoneyTransaction.findMany({
      where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 100,
      select: { id: true, number: true, providerCode: true, transactionType: true, customerPhone: true, currencyCode: true,
        principalAmount: true, customerFeeAmount: true, providerCommissionAmount: true, externalReference: true, status: true, occurredAt: true, revision: true },
    }),
    tx.enterpriseMobileMoneyTransaction.groupBy({
      by: ["currencyCode", "transactionType"],
      where: { ...where, status: "CONFIRMED" },
      _sum: { principalAmount: true, providerCommissionAmount: true }, _count: { _all: true },
      orderBy: [{ currencyCode: "asc" }, { transactionType: "asc" }],
    }),
  ]);
  const metrics = new Map<string, { currencyCode: string; count: number; deposits: string; withdrawals: string; commission: string }>();
  for (const group of groups) {
    const current = metrics.get(group.currencyCode) ?? { currencyCode: group.currencyCode, count: 0, deposits: "0", withdrawals: "0", commission: "0" };
    if (group.transactionType === "DEPOSIT") current.deposits = group._sum.principalAmount?.toFixed() ?? "0";
    if (group.transactionType === "WITHDRAWAL") current.withdrawals = group._sum.principalAmount?.toFixed() ?? "0";
    current.commission = new Exact(current.commission).plus(group._sum.providerCommissionAmount ?? 0).toFixed();
    current.count += group._count._all;
    metrics.set(group.currencyCode, current);
  }
  return {
    visibleSites,
    items: rows.map(({ customerPhone, ...row }) => ({ ...row, customerPhoneMasked: maskMobileMoneyHistoryPhone(customerPhone),
      principalAmount: row.principalAmount.toFixed(), customerFeeAmount: row.customerFeeAmount.toFixed(),
      providerCommissionAmount: row.providerCommissionAmount.toFixed() })),
    metrics: [...metrics.values()],
  };
}
