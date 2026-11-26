import { Prisma } from "@prisma/client";
import { directionalPageTotals, type MonetaryTotal } from "@/lib/enterprise/common/analytics";

const ExactAmount = Prisma.Decimal.clone({ precision: 48 });
const directions = ["INBOUND", "OUTBOUND"];

type SessionMovement = {
  currencyCode: string;
  direction: string;
  _sum: { amount: Prisma.Decimal | null };
};

/** Cash flows belong to the selected sessions, including movements recorded
 * after their opening date. An opening or closing balance is a snapshot. */
export async function cashSessionSummaries(
  tx: Prisma.TransactionClient,
  organizationId: string,
  scope: Prisma.EnterpriseCashSessionWhereInput,
) {
  const varianceByAccount = (range: { lt?: number; gt?: number }) => tx.enterpriseCashSession.groupBy({
    by: ["financialAccountId"],
    where: { AND: [scope, { status: "CLOSED", discrepancyAmount: range }] },
    _sum: { discrepancyAmount: true },
  });
  const [statuses, movements, shortages, surpluses] = await Promise.all([
    tx.enterpriseCashSession.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    tx.enterpriseCashMovement.groupBy({
      by: ["currencyCode", "direction"],
      where: { organizationId, direction: { in: directions }, cashSession: scope },
      _sum: { amount: true },
    }),
    varianceByAccount({ lt: 0 }),
    varianceByAccount({ gt: 0 }),
  ]);
  const accounts = [...new Set([...shortages, ...surpluses].map(row => row.financialAccountId))];
  const currencies = accounts.length ? await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId, id: { in: accounts } },
    select: { id: true, currencyCode: true },
  }) : [];
  const currencyByAccount = new Map(currencies.map(account => [account.id, account.currencyCode]));
  const variances = [
    ...shortages.map(row => ({ currencyCode: currencyByAccount.get(row.financialAccountId), amount: row._sum.discrepancyAmount })),
    ...surpluses.map(row => ({ currencyCode: currencyByAccount.get(row.financialAccountId), amount: row._sum.discrepancyAmount })),
  ];
  return {
    metrics: cashSessionCounts(statuses.map(row => ({ status: row.status, count: row._count._all }))),
    totals: [...cashFlowTotals(movements), ...cashClosingVarianceTotals(variances)],
  };
}

export function cashSessionCounts(rows: { status: string; count: number }[]) {
  return rows.reduce((metrics, row) => {
    metrics.total += row.count;
    if (row.status === "OPEN") metrics.open += row.count;
    if (row.status === "PENDING_VALIDATION") metrics.pending += row.count;
    return metrics;
  }, { total: 0, open: 0, pending: 0 });
}

export function cashFlowTotals(movements: SessionMovement[]) {
  return directionalPageTotals(movements.map(row => ({
    currencyCode: row.currencyCode,
    direction: row.direction,
    status: "",
    amount: row._sum.amount,
  })));
}

export function cashClosingVarianceTotals(rows: { currencyCode: string | undefined; amount: Prisma.Decimal | null }[]): MonetaryTotal[] {
  const totals: MonetaryTotal[] = [];
  const sums = new Map<string, { shortage: Prisma.Decimal | null; surplus: Prisma.Decimal | null }>();
  for (const { currencyCode, amount } of rows) {
    if (!currencyCode || !amount || amount.isZero()) continue;
    const amounts = sums.get(currencyCode) ?? { shortage: null, surplus: null };
    const metric = amount.isNegative() ? "shortage" : "surplus";
    amounts[metric] = new ExactAmount(amounts[metric] ?? 0).plus(amount.abs());
    sums.set(currencyCode, amounts);
  }
  for (const [currencyCode, { shortage, surplus }] of sums) {
    if (shortage) totals.push({ currencyCode, metric: "cashClosingShortage", amount: shortage.toFixed() });
    if (surplus) totals.push({ currencyCode, metric: "cashClosingSurplus", amount: surplus.toFixed() });
  }
  return totals;
}

export function cashSessionBalance(openingAmount: Prisma.Decimal, currencyCode: string, movements: SessionMovement[]) {
  if (movements.some(row => row.currencyCode !== currencyCode || !directions.includes(row.direction))) {
    return { inboundAmount: null, outboundAmount: null, expectedCurrentAmount: null };
  }
  const inboundAmount = movements.find(row => row.direction === "INBOUND")?._sum.amount ?? new ExactAmount(0);
  const outboundAmount = movements.find(row => row.direction === "OUTBOUND")?._sum.amount ?? new ExactAmount(0);
  const expectedCurrentAmount = new ExactAmount(openingAmount).plus(inboundAmount).minus(outboundAmount);
  return { inboundAmount: inboundAmount.toFixed(), outboundAmount: outboundAmount.toFixed(), expectedCurrentAmount: expectedCurrentAmount.toFixed() };
}
