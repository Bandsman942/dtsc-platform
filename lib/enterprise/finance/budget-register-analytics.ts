import { Prisma } from "@prisma/client";
import type { MonetaryTotal } from "@/lib/enterprise/common/analytics";
import { getBudgetRegisterPositions } from "@/lib/enterprise/finance/commitments";

const ExactAmount = Prisma.Decimal.clone({ precision: 48 });
const fields = [
  ["planned", "budgetPlanned"],
  ["committedRemaining", "budgetCommitted"],
  ["actual", "budgetActual"],
  ["available", "budgetAvailable"],
] as const;
type Position = Record<(typeof fields)[number][0], Prisma.Decimal>;
type BudgetRecord = {
  id: string;
  currency: string;
  status: string;
  scenarioCode: string;
  versionNumber: number;
  forecastAmount: Prisma.Decimal | null;
};
type BudgetGroup = Position & {
  currencyCode: string;
  status: string;
  budgetScenario: string;
  budgetVersion: number;
  forecast: Prisma.Decimal | null;
};

function addBudgetRows(groups: Map<string, BudgetGroup>, budgets: BudgetRecord[], positions: Map<string, Position>) {
  for (const { id, currency: currencyCode, status, scenarioCode: budgetScenario, versionNumber: budgetVersion, forecastAmount } of budgets) {
    const key = JSON.stringify([currencyCode, status, budgetScenario, budgetVersion]);
    const group = groups.get(key) ?? {
      currencyCode, status, budgetScenario, budgetVersion,
      planned: new ExactAmount(0), committedRemaining: new ExactAmount(0),
      actual: new ExactAmount(0), available: new ExactAmount(0), forecast: new ExactAmount(0),
    };
    const position = positions.get(id)!;
    for (const [field] of fields) group[field] = group[field].plus(position[field]);
    group.forecast = group.forecast === null || forecastAmount === null ? null : group.forecast.plus(forecastAmount);
    groups.set(key, group);
  }
}

function exportAmounts(groups: Map<string, BudgetGroup>): MonetaryTotal[] {
  return [...groups.values()].flatMap(group => {
    const { currencyCode, status, budgetScenario, budgetVersion, forecast } = group;
    const dimensions = { currencyCode, status, budgetScenario, budgetVersion };
    return [
      ...fields.map(([field, metric]) => ({ ...dimensions, metric, amount: group[field].toFixed() })),
      ...(forecast === null ? [] : [{ ...dimensions, metric: "budgetForecast" as const, amount: forecast.toFixed() }]),
    ];
  });
}

export function budgetRegisterPageTotals(budgets: BudgetRecord[], positions: Map<string, Position>) {
  const groups = new Map<string, BudgetGroup>();
  addBudgetRows(groups, budgets, positions);
  return exportAmounts(groups);
}

/** Keep the same where clause as the visible register, before its pagination. */
export async function budgetRegisterTotals(
  tx: Prisma.TransactionClient,
  organizationId: string,
  where: Prisma.EnterpriseBudgetWhereInput,
) {
  const groups = new Map<string, BudgetGroup>();
  const batchSize = 50;
  let after: string | undefined;
  while (true) {
    const budgets: BudgetRecord[] = await tx.enterpriseBudget.findMany({
      where: { organizationId, AND: [where, ...(after ? [{ id: { gt: after } }] : [])] },
      select: { id: true, status: true, currency: true, scenarioCode: true, versionNumber: true, forecastAmount: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });
    if (!budgets.length) break;
    const positions = await getBudgetRegisterPositions(tx, organizationId, budgets.map(budget => budget.id));
    addBudgetRows(groups, budgets, positions);
    if (budgets.length < batchSize) break;
    after = budgets[budgets.length - 1].id;
  }
  return exportAmounts(groups);
}
