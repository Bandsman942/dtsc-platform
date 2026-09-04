import { prisma } from "@/lib/prisma";
import { enterpriseBudgetVisibilityWhere, enterpriseExpenseVisibilityWhere } from "@/lib/enterprise/finance/access";
import { enterpriseMoney, enterpriseMoneyZero } from "@/lib/enterprise/finance/money";

export async function getEnterpriseFinanceSummary(organizationId: string, userId: string, canSeeAll: boolean) {
  const budgetVisibility = enterpriseBudgetVisibilityWhere({ organizationId, userId, canSeeAll });
  const expenseVisibility = enterpriseExpenseVisibilityWhere({ organizationId, userId, canSeeAll });
  const currencyRows = await prisma.enterpriseBudget.findMany({ where: budgetVisibility, distinct: ["currency"], select: { currency: true }, orderBy: { currency: "asc" }, take: 50 });
  const expenseCurrencyRows = await prisma.enterpriseExpense.findMany({ where: { ...expenseVisibility, budgetLineId: null }, distinct: ["currency"], select: { currency: true }, orderBy: { currency: "asc" }, take: 50 });
  const currencies = [...new Set([...currencyRows, ...expenseCurrencyRows].map((item) => item.currency))].sort();
  const buckets = await Promise.all(currencies.map(async (currency) => {
    const budgetScope = { ...budgetVisibility, currency, status: "ACTIVE" };
    const [activeBudgets, planned, commitments, actual, unbudgeted] = await Promise.all([
      prisma.enterpriseBudget.count({ where: budgetScope }),
      prisma.enterpriseBudgetLine.aggregate({ where: { organizationId, budget: budgetScope }, _sum: { plannedAmount: true } }),
      prisma.enterpriseBudgetCommitment.aggregate({ where: { organizationId, budgetLine: { budget: budgetScope } }, _sum: { committedAmount: true, realizedAmount: true, releasedAmount: true } }),
      prisma.enterpriseExpense.aggregate({ where: { organizationId, currency, status: "APPROVED", archivedAt: null, budgetLine: { budget: budgetScope } }, _sum: { amount: true } }),
      prisma.enterpriseExpense.aggregate({ where: { ...expenseVisibility, currency, status: "APPROVED", budgetLineId: null }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const plannedAmount = enterpriseMoney(planned._sum.plannedAmount || 0);
    const committed = enterpriseMoney(commitments._sum.committedAmount || 0);
    const realized = enterpriseMoney(commitments._sum.realizedAmount || 0);
    const released = enterpriseMoney(commitments._sum.releasedAmount || 0);
    const committedRemaining = enterpriseMoney(PrismaDecimalMaxZero(committed.sub(realized).sub(released)));
    const actualAmount = enterpriseMoney(actual._sum.amount || 0);
    const availableAmount = plannedAmount.sub(committedRemaining).sub(actualAmount).toDecimalPlaces(2);
    return { currency, activeBudgets, plannedAmount: plannedAmount.toFixed(2), committedAmount: committedRemaining.toFixed(2), actualAmount: actualAmount.toFixed(2), availableAmount: availableAmount.toFixed(2), unbudgetedExpenseAmount: enterpriseMoney(unbudgeted._sum.amount || 0).toFixed(2), unbudgetedExpenseCount: unbudgeted._count._all };
  }));
  return { currencies: buckets };
}

function PrismaDecimalMaxZero(value: ReturnType<typeof enterpriseMoneyZero>) {
  return value.isNegative() ? enterpriseMoneyZero() : value;
}
