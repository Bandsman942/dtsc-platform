import { prisma } from "@/lib/prisma";
import { enterpriseBudgetVisibilityWhere, enterpriseExpenseVisibilityWhere } from "@/lib/enterprise/finance/access";
import { enterpriseMoney, enterpriseMoneyZero } from "@/lib/enterprise/finance/money";
import {
  invalidateTenantReadCache,
  withTenantReadCache,
  type TenantReadCacheSource,
} from "@/lib/scalability/tenant-read-cache";

const FINANCE_SUMMARY_CACHE = {
  projection: "finance-budget-summary",
  schemaVersion: "v1",
  ttlSeconds: 30,
} as const;

const FINANCE_SUMMARY_INVALIDATION_ENTITY_TYPES = new Set<string>([
  "EnterpriseBudget",
  "EnterpriseBudgetLine",
  "EnterpriseBudgetCommitment",
  "EnterpriseExpense",
  "EnterprisePurchase",
  "EnterpriseApproval",
]);

type FinanceSummary = Awaited<ReturnType<typeof loadEnterpriseFinanceSummaryForVisibility>>;
export type FinanceSummaryReadSource = TenantReadCacheSource | "BYPASS";

function isFinanceSummary(value: unknown): value is FinanceSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const currencies = (value as Record<string, unknown>).currencies;
  if (!Array.isArray(currencies)) return false;
  return currencies.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const row = entry as Record<string, unknown>;
    return typeof row.currency === "string"
      && Number.isInteger(row.activeBudgets)
      && typeof row.plannedAmount === "string"
      && typeof row.committedAmount === "string"
      && typeof row.actualAmount === "string"
      && typeof row.availableAmount === "string"
      && typeof row.unbudgetedExpenseAmount === "string"
      && Number.isInteger(row.unbudgetedExpenseCount);
  });
}

async function loadEnterpriseFinanceSummaryForVisibility(
  organizationId: string,
  budgetVisibility: ReturnType<typeof enterpriseBudgetVisibilityWhere>,
  expenseVisibility: ReturnType<typeof enterpriseExpenseVisibilityWhere>,
) {
  const currencyRows = await prisma.enterpriseBudget.findMany({ where: budgetVisibility, distinct: ["currency"], select: { currency: true }, orderBy: { currency: "asc" }, take: 50 });
  const expenseCurrencyRows = await prisma.enterpriseExpense.findMany({ where: { ...expenseVisibility, budgetLineId: null }, distinct: ["currency"], select: { currency: true }, orderBy: { currency: "asc" }, take: 50 });
  const currencies = [...new Set([...currencyRows, ...expenseCurrencyRows].map((item) => item.currency))].sort();
  const buckets = await Promise.all(currencies.map(async (currency) => {
    const budgetScope = { ...budgetVisibility, currency, status: "ACTIVE" as const };
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

async function loadEnterpriseFinanceSummaryForOrganization(organizationId: string) {
  return loadEnterpriseFinanceSummaryForVisibility(
    organizationId,
    { organizationId, archivedAt: null },
    { organizationId, archivedAt: null },
  );
}

export async function getEnterpriseFinanceSummaryRead(organizationId: string, userId: string, canSeeAll: boolean): Promise<{ summary: FinanceSummary; source: FinanceSummaryReadSource }> {
  if (!canSeeAll) {
    const budgetVisibility = enterpriseBudgetVisibilityWhere({ organizationId, userId, canSeeAll: false });
    const expenseVisibility = enterpriseExpenseVisibilityWhere({ organizationId, userId, canSeeAll: false });
    return {
      summary: await loadEnterpriseFinanceSummaryForVisibility(organizationId, budgetVisibility, expenseVisibility),
      source: "BYPASS",
    };
  }

  const cached = await withTenantReadCache<FinanceSummary>({
    ...FINANCE_SUMMARY_CACHE,
    organizationId,
    validate: isFinanceSummary,
    load: () => loadEnterpriseFinanceSummaryForOrganization(organizationId),
  });
  return { summary: cached.value, source: cached.source };
}

export async function getEnterpriseFinanceSummary(organizationId: string, userId: string, canSeeAll: boolean) {
  return (await getEnterpriseFinanceSummaryRead(organizationId, userId, canSeeAll)).summary;
}

export async function invalidateEnterpriseFinanceSummaryCacheForDomainEvent(input: {
  organizationId: string;
  entityType: string;
}) {
  if (!FINANCE_SUMMARY_INVALIDATION_ENTITY_TYPES.has(input.entityType)) return false;
  return invalidateTenantReadCache({
    projection: FINANCE_SUMMARY_CACHE.projection,
    schemaVersion: FINANCE_SUMMARY_CACHE.schemaVersion,
    organizationId: input.organizationId,
  });
}

function PrismaDecimalMaxZero(value: ReturnType<typeof enterpriseMoneyZero>) {
  return value.isNegative() ? enterpriseMoneyZero() : value;
}
