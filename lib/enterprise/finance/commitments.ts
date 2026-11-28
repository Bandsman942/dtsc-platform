import { Prisma } from "@prisma/client";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { addEnterpriseOperationalEvent, type ProcurementTransaction } from "@/lib/enterprise/procurement/shared";
import { assertSameCurrency, enterpriseMoney, enterpriseMoneyMin, enterpriseMoneyZero } from "@/lib/enterprise/finance/money";

export type FinanceTransaction = ProcurementTransaction;

function nonNegative(value: Prisma.Decimal) {
  return value.isNegative() ? enterpriseMoneyZero() : enterpriseMoney(value);
}

const ExactBudgetAmount = Prisma.Decimal.clone({ precision: 48 });

type BudgetCommitmentAmounts = {
  committedAmount: Prisma.Decimal | null;
  realizedAmount: Prisma.Decimal | null;
  releasedAmount: Prisma.Decimal | null;
};

function calculateBudgetLinePosition(
  plannedAmount: Prisma.Decimal,
  commitments?: BudgetCommitmentAmounts,
  approvedExpenseAmount?: Prisma.Decimal | null,
) {
  const committed = enterpriseMoney(commitments?.committedAmount ?? 0);
  const realizedFromCommitments = enterpriseMoney(commitments?.realizedAmount ?? 0);
  const released = enterpriseMoney(commitments?.releasedAmount ?? 0);
  const remainingCommitment = nonNegative(new ExactBudgetAmount(committed).sub(realizedFromCommitments).sub(released));
  const actualAmount = enterpriseMoney(approvedExpenseAmount ?? 0);
  const planned = new ExactBudgetAmount(enterpriseMoney(plannedAmount));
  const available = enterpriseMoney(planned.sub(remainingCommitment).sub(actualAmount));
  return { planned, committed, realizedFromCommitments, released, remainingCommitment, actual: actualAmount, available };
}

export async function getBudgetLinePosition(tx: FinanceTransaction, organizationId: string, budgetLineId: string) {
  const line = await tx.enterpriseBudgetLine.findFirst({
    where: { id: budgetLineId, organizationId },
    include: { budget: true },
  });
  if (!line || line.budget.archivedAt) throw new EnterpriseCoreV2Error("La ligne budgétaire n’appartient pas à cette entreprise.", 400, "INVALID_BUDGET_LINE");

  const [commitments, actual] = await Promise.all([
    tx.enterpriseBudgetCommitment.aggregate({
      where: { organizationId, budgetLineId },
      _sum: { committedAmount: true, realizedAmount: true, releasedAmount: true },
    }),
    tx.enterpriseExpense.aggregate({
      where: { organizationId, budgetLineId, status: "APPROVED", archivedAt: null },
      _sum: { amount: true },
    }),
  ]);

  return { line, ...calculateBudgetLinePosition(line.plannedAmount, commitments._sum, actual._sum.amount) };
}

export async function getBudgetPosition(tx: FinanceTransaction, organizationId: string, budgetId: string) {
  const budget = await tx.enterpriseBudget.findFirst({ where: { id: budgetId, organizationId, archivedAt: null }, include: { lines: true } });
  if (!budget) throw new EnterpriseCoreV2Error("Budget introuvable.", 404, "BUDGET_NOT_FOUND");
  const positions = await Promise.all(budget.lines.map((line) => getBudgetLinePosition(tx, organizationId, line.id)));
  return {
    budget,
    lines: positions,
    planned: positions.reduce((sum, item) => sum.add(item.planned), new ExactBudgetAmount(0)).toDecimalPlaces(2),
    committedRemaining: positions.reduce((sum, item) => sum.add(item.remainingCommitment), new ExactBudgetAmount(0)).toDecimalPlaces(2),
    actual: positions.reduce((sum, item) => sum.add(item.actual), new ExactBudgetAmount(0)).toDecimalPlaces(2),
    available: positions.reduce((sum, item) => sum.add(item.available), new ExactBudgetAmount(0)).toDecimalPlaces(2),
  };
}

/**
 * Read positions for the authorized page in groups. Clamp the remaining
 * commitment of each budget line separately, as on the budget detail.
 */
export async function getBudgetRegisterPositions(tx: FinanceTransaction, organizationId: string, budgetIds: string[]) {
  const positions = new Map(budgetIds.map(id => [id, {
    planned: new ExactBudgetAmount(0),
    committedRemaining: new ExactBudgetAmount(0),
    actual: new ExactBudgetAmount(0),
    available: new ExactBudgetAmount(0),
    lineCount: 0,
  }]));
  if (!positions.size) return positions;

  const lineScope: Prisma.EnterpriseBudgetLineWhereInput = {
    organizationId, budgetId: { in: budgetIds }, budget: { archivedAt: null },
  };
  const [lines, commitments, expenses] = await Promise.all([
    tx.enterpriseBudgetLine.findMany({ where: lineScope, select: { id: true, budgetId: true, plannedAmount: true } }),
    tx.enterpriseBudgetCommitment.groupBy({
      by: ["budgetLineId"],
      where: { organizationId, budgetLine: lineScope },
      _sum: { committedAmount: true, realizedAmount: true, releasedAmount: true },
    }),
    tx.enterpriseExpense.groupBy({
      by: ["budgetLineId"],
      where: { organizationId, budgetLine: lineScope, status: "APPROVED", archivedAt: null },
      _sum: { amount: true },
    }),
  ]);
  const commitsByLine = new Map(commitments.map(item => [item.budgetLineId, item._sum]));
  const expensesByLine = new Map(expenses.map(item => [item.budgetLineId, item._sum.amount]));
  for (const line of lines) {
    const amounts = calculateBudgetLinePosition(line.plannedAmount, commitsByLine.get(line.id), expensesByLine.get(line.id));
    const budget = positions.get(line.budgetId)!;
    budget.planned = budget.planned.plus(amounts.planned);
    budget.committedRemaining = budget.committedRemaining.plus(amounts.remainingCommitment);
    budget.actual = budget.actual.plus(amounts.actual);
    budget.available = budget.available.plus(amounts.available);
    budget.lineCount++;
  }
  return positions;
}

export async function createPurchaseBudgetCommitment(
  tx: FinanceTransaction,
  { organizationId, purchaseId, actorUserId }: { organizationId: string; purchaseId: string; actorUserId: string },
) {
  const purchase = await tx.enterprisePurchase.findFirst({ where: { id: purchaseId, organizationId, archivedAt: null } });
  if (!purchase) throw new EnterpriseCoreV2Error("Achat introuvable.", 404, "PURCHASE_NOT_FOUND");
  if (!purchase.budgetLineId) return null;

  const existing = await tx.enterpriseBudgetCommitment.findFirst({
    where: { organizationId, sourceEntityType: "EnterprisePurchase", sourceEntityId: purchaseId },
  });
  if (existing) return existing;

  const position = await getBudgetLinePosition(tx, organizationId, purchase.budgetLineId);
  if (position.line.budget.status !== "ACTIVE") throw new EnterpriseCoreV2Error("La ligne doit appartenir à un budget actif avant engagement.", 409, "BUDGET_NOT_ACTIVE");
  if (!assertSameCurrency(position.line.budget.currency, purchase.currency)) throw new EnterpriseCoreV2Error("La devise de l’achat doit correspondre à celle du budget.", 409, "BUDGET_CURRENCY_MISMATCH");
  const amount = enterpriseMoney(purchase.totalAmount);
  if (amount.gt(position.available)) throw new EnterpriseCoreV2Error("Le budget disponible est insuffisant pour engager cet achat.", 409, "INSUFFICIENT_BUDGET");

  const commitment = await tx.enterpriseBudgetCommitment.create({
    data: {
      organizationId,
      budgetLineId: purchase.budgetLineId,
      sourceEntityType: "EnterprisePurchase",
      sourceEntityId: purchase.id,
      committedAmount: amount,
      realizedAmount: enterpriseMoneyZero(),
      releasedAmount: enterpriseMoneyZero(),
      status: "ACTIVE",
    },
  });
  await addEnterpriseOperationalEvent(tx, {
    organizationId,
    entityType: "EnterpriseBudget",
    entityId: position.line.budgetId,
    eventType: "ENTERPRISE_BUDGET_COMMITMENT_CREATED",
    summary: "Engagement budgétaire créé depuis un achat approuvé.",
    actorUserId,
    metadata: { commitmentId: commitment.id, purchaseId, budgetLineId: purchase.budgetLineId, amount: amount.toFixed(2), currency: purchase.currency },
  });
  return commitment;
}

export async function releasePurchaseBudgetCommitment(
  tx: FinanceTransaction,
  { organizationId, purchaseId, actorUserId }: { organizationId: string; purchaseId: string; actorUserId: string },
) {
  const commitment = await tx.enterpriseBudgetCommitment.findFirst({
    where: { organizationId, sourceEntityType: "EnterprisePurchase", sourceEntityId: purchaseId },
  });
  if (!commitment || commitment.status !== "ACTIVE") return commitment;
  const remaining = nonNegative(enterpriseMoney(commitment.committedAmount).sub(commitment.realizedAmount).sub(commitment.releasedAmount));
  if (remaining.lte(0)) {
    await tx.enterpriseBudgetCommitment.updateMany({ where: { id: commitment.id, organizationId, status: "ACTIVE" }, data: { status: "REALIZED" } });
    return commitment;
  }
  const updated = await tx.enterpriseBudgetCommitment.updateMany({
    where: { id: commitment.id, organizationId, status: "ACTIVE" },
    data: { releasedAmount: enterpriseMoney(commitment.releasedAmount).add(remaining), status: "RELEASED" },
  });
  if (updated.count !== 1) throw new EnterpriseCoreV2Error("L’engagement a changé pendant son annulation.", 409, "COMMITMENT_RELEASE_CONFLICT");
  const line = await tx.enterpriseBudgetLine.findFirst({ where: { id: commitment.budgetLineId, organizationId }, select: { budgetId: true } });
  if (line) await addEnterpriseOperationalEvent(tx, {
    organizationId,
    entityType: "EnterpriseBudget",
    entityId: line.budgetId,
    eventType: "ENTERPRISE_BUDGET_COMMITMENT_RELEASED",
    summary: "Engagement budgétaire libéré après annulation de l’achat.",
    actorUserId,
    metadata: { commitmentId: commitment.id, purchaseId, amount: remaining.toFixed(2) },
  });
  return commitment;
}

export async function prepareExpenseBudgetImpact(
  tx: FinanceTransaction,
  { organizationId, expenseId }: { organizationId: string; expenseId: string },
) {
  const expense = await tx.enterpriseExpense.findFirst({ where: { id: expenseId, organizationId, archivedAt: null } });
  if (!expense) throw new EnterpriseCoreV2Error("Dépense introuvable.", 404, "EXPENSE_NOT_FOUND");
  if (!expense.budgetLineId) return { expense, commitment: null, realizable: enterpriseMoneyZero(), position: null };
  if (expense.budgetImpactAppliedAt) throw new EnterpriseCoreV2Error("L’impact budgétaire de cette dépense a déjà été appliqué.", 409, "EXPENSE_BUDGET_ALREADY_APPLIED");

  const position = await getBudgetLinePosition(tx, organizationId, expense.budgetLineId);
  if (position.line.budget.status !== "ACTIVE") throw new EnterpriseCoreV2Error("La dépense doit viser un budget actif.", 409, "BUDGET_NOT_ACTIVE");
  if (!assertSameCurrency(position.line.budget.currency, expense.currency)) throw new EnterpriseCoreV2Error("La devise de la dépense doit correspondre à celle du budget.", 409, "BUDGET_CURRENCY_MISMATCH");

  let commitment = null as Awaited<ReturnType<typeof tx.enterpriseBudgetCommitment.findFirst>>;
  let realizable = enterpriseMoneyZero();
  if (expense.purchaseId) {
    commitment = await tx.enterpriseBudgetCommitment.findFirst({
      where: { organizationId, sourceEntityType: "EnterprisePurchase", sourceEntityId: expense.purchaseId, budgetLineId: expense.budgetLineId },
    });
    if (commitment && commitment.status === "ACTIVE") {
      const remaining = nonNegative(enterpriseMoney(commitment.committedAmount).sub(commitment.realizedAmount).sub(commitment.releasedAmount));
      realizable = enterpriseMoneyMin(expense.amount, remaining);
    }
  }

  const capacity = enterpriseMoney(position.available.add(realizable));
  if (enterpriseMoney(expense.amount).gt(capacity)) throw new EnterpriseCoreV2Error("Le budget disponible est insuffisant pour approuver cette dépense.", 409, "INSUFFICIENT_BUDGET");
  return { expense, commitment, realizable, position };
}

export async function applyExpenseCommitmentRealization(
  tx: FinanceTransaction,
  { organizationId, expenseId, actorUserId }: { organizationId: string; expenseId: string; actorUserId: string },
) {
  const prepared = await prepareExpenseBudgetImpact(tx, { organizationId, expenseId });
  if (!prepared.commitment || prepared.realizable.lte(0)) return { ...prepared, realizedAmount: enterpriseMoneyZero() };

  const commitment = prepared.commitment;
  const nextRealized = enterpriseMoney(commitment.realizedAmount).add(prepared.realizable);
  const remainingAfter = nonNegative(enterpriseMoney(commitment.committedAmount).sub(nextRealized).sub(commitment.releasedAmount));
  const updated = await tx.enterpriseBudgetCommitment.updateMany({
    where: { id: commitment.id, organizationId, status: "ACTIVE", realizedAmount: commitment.realizedAmount, releasedAmount: commitment.releasedAmount },
    data: { realizedAmount: nextRealized, status: remainingAfter.lte(0) ? "REALIZED" : "ACTIVE" },
  });
  if (updated.count !== 1) throw new EnterpriseCoreV2Error("L’engagement a été réalisé simultanément.", 409, "COMMITMENT_REALIZATION_CONFLICT");
  if (prepared.position) await addEnterpriseOperationalEvent(tx, {
    organizationId,
    entityType: "EnterpriseBudget",
    entityId: prepared.position.line.budgetId,
    eventType: "ENTERPRISE_BUDGET_COMMITMENT_REALIZED",
    summary: "Une dépense approuvée a réalisé une partie de l’engagement d’achat.",
    actorUserId,
    metadata: { commitmentId: commitment.id, expenseId, amount: prepared.realizable.toFixed(2) },
  });
  return { ...prepared, realizedAmount: prepared.realizable };
}
