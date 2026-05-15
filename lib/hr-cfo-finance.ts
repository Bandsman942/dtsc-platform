import { InvoiceStatus, PaymentStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type HrcfoTransactionInput = {
  title: string;
  requesterName?: string;
  category: "IN" | "OUT";
  transactionCategory: "IN" | "OUT";
  transactionType?: string;
  amount: number;
  currency?: string;
  transactionDate?: Date;
  accountId?: string;
  departmentId?: string;
  budgetId?: string;
  paymentMethod?: string;
  attachmentUrl?: string;
  status?: string;
  priority?: string;
  notes?: string;
  sourceType?: string;
  sourceId?: string;
  clientUserId?: string;
  createdById?: string;
  skipInvoice?: boolean;
};

type PayrollInput = {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  grossAmount?: number;
  bonusAmount?: number;
  deductionAmount?: number;
  accountId?: string;
  budgetId: string;
  status: string;
  notes?: string;
  createdById?: string;
};

const impactingStatuses = new Set(["VALIDATED", "PAID", "APPROVED"]);
const canceledStatuses = new Set(["CANCELED", "CANCELLED", "REJECTED"]);

export function isFinanciallyImpactingStatus(status?: string | null) {
  return impactingStatuses.has(String(status || "").toUpperCase());
}

export function isCanceledFinancialStatus(status?: string | null) {
  return canceledStatuses.has(String(status || "").toUpperCase());
}

export function isStartingCapitalTitle(title?: string | null) {
  return String(title || "").trim().toLocaleLowerCase("fr-FR") === "capital de départ";
}

function buildOperationalInvoiceNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `DTSC-OP-${date}-${now.getTime().toString().slice(-6)}`;
}

export async function ensureDefaultFinancialAccount() {
  return prisma.financialAccount.upsert({
    where: { name: "Caisse principale" },
    update: {},
    create: {
      id: "acct-caisse-principale",
      name: "Caisse principale",
      accountType: "CASH",
      description: "Compte de caisse principal DTSC.",
      status: "ACTIVE",
    },
  });
}

export async function ensureBankFinancialAccount() {
  return prisma.financialAccount.upsert({
    where: { name: "Banque" },
    update: {},
    create: {
      id: "acct-banque",
      name: "Banque",
      accountType: "BANK",
      description: "Compte bancaire principal DTSC pour les paiements d'abonnement.",
      status: "ACTIVE",
    },
  });
}

export async function createHrcfoBudget(input: {
  name: string;
  departmentId: string;
  accountId: string;
  amount: number;
  periodStart?: Date;
  periodEnd?: Date;
  status?: string;
  riskLevel?: string;
  notes?: string;
  createdById?: string;
}) {
  await reconcileFinancialState();
  const account = await prisma.financialAccount.findUnique({ where: { id: input.accountId } });
  if (!account || account.status !== "ACTIVE") {
    throw new Error("Le compte financier sélectionné est inactif ou introuvable.");
  }

  const availableForBudget = await calculateAccountAvailableForBudget(input.accountId);
  if (availableForBudget < input.amount) {
    throw new Error("Le solde disponible du compte ne permet pas de créer ce budget.");
  }

  const department = await prisma.department.findUnique({ where: { id: input.departmentId } });
  if (!department || department.status !== "ACTIVE") {
    throw new Error("Le département sélectionné est inactif ou introuvable.");
  }

  return prisma.hrcfoBudget.create({
    data: {
      name: input.name,
      ownerDepartment: department.name,
      departmentId: department.id,
      accountId: account.id,
      amount: input.amount,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: input.status || "OPEN",
      riskLevel: input.riskLevel || "LOW",
      notes: input.notes,
      createdById: input.createdById,
    },
  });
}

export async function createValidatedTransaction(input: HrcfoTransactionInput) {
  const normalizedCategory = input.transactionCategory || input.category;
  if (input.category !== normalizedCategory) {
    throw new Error("La catégorie de transaction est incohérente.");
  }

  const existing = input.sourceType && input.sourceId
    ? await prisma.hrcfoExpense.findFirst({ where: { sourceType: input.sourceType, sourceId: input.sourceId } })
    : null;
  if (existing) {
    return existing;
  }

  const status = input.status || "PENDING";
  return prisma.$transaction(async (tx) => {
    let accountId = input.accountId;
    if (normalizedCategory === "OUT") {
      if (!input.budgetId) {
        throw new Error("Une transaction de sortie doit être liée à un budget disponible.");
      }
      const budget = await tx.hrcfoBudget.findUnique({
        where: { id: input.budgetId },
        select: { id: true, accountId: true, amount: true, spentAmount: true, status: true },
      });
      if (!budget || !["OPEN", "MONITORING"].includes(budget.status)) {
        throw new Error("Le budget sélectionné n'est pas actif.");
      }
      if (!budget.accountId) {
        throw new Error("Le budget sélectionné n'est lié à aucun compte financier.");
      }
      accountId = budget.accountId;
      await assertBudgetAndAccountCanSpend(tx, budget.id, accountId, input.amount);
    }

    if (!accountId) {
      throw new Error("Une transaction d'entrée doit être liée à un compte financier.");
    }
    const account = await tx.financialAccount.findUnique({ where: { id: accountId } });
    if (!account || account.status !== "ACTIVE") {
      throw new Error("Le compte financier sélectionné est inactif ou introuvable.");
    }

    const transaction = await tx.hrcfoExpense.create({
      data: {
        title: input.title,
        requesterName: input.requesterName || "DTSC",
        category: normalizedCategory,
        transactionCategory: normalizedCategory,
        transactionType: input.transactionType || "MANUAL",
        amount: input.amount,
        currency: input.currency || "USD",
        transactionDate: input.transactionDate || new Date(),
        accountId,
        departmentId: input.departmentId || null,
        budgetId: input.budgetId || null,
        paymentMethod: input.paymentMethod || null,
        attachmentUrl: input.attachmentUrl || null,
        sourceType: input.sourceType || null,
        sourceId: input.sourceId || null,
        clientUserId: input.clientUserId || null,
        status,
        priority: input.priority || "MEDIUM",
        validatedAt: isFinanciallyImpactingStatus(status) ? new Date() : null,
        paidAt: status === "PAID" ? new Date() : null,
        notes: input.notes || null,
        createdById: input.createdById || null,
      },
    });

    if (isFinanciallyImpactingStatus(status)) {
      await reconcileFinancialState(tx);
      if (!input.skipInvoice) {
        await createOperationalInvoice(tx, transaction.id, {
          userId: input.clientUserId || input.createdById,
          title: input.title,
          amount: input.amount,
          currency: input.currency || "USD",
          paidAt: normalizedCategory === "IN" ? transaction.validatedAt : null,
        });
      }
    }

    return transaction;
  });
}

export async function createPayroll(input: PayrollInput) {
  const employee = await prisma.hrcfoEmployee.findUnique({ where: { id: input.employeeId } });
  if (!employee) {
    throw new Error("Collaborateur introuvable pour la paie.");
  }
  const budget = await prisma.hrcfoBudget.findUnique({ where: { id: input.budgetId } });
  if (!budget || !budget.accountId) {
    throw new Error("Le budget de paie doit être lié à un compte financier.");
  }

  const grossAmount = Number(employee.monthlyCompensation || input.grossAmount || 0);
  const netAmount = grossAmount + (input.bonusAmount || 0) - (input.deductionAmount || 0);
  if (netAmount <= 0) {
    throw new Error("Le montant net de paie doit être positif.");
  }

  const payroll = await prisma.hrcfoPayroll.create({
    data: {
      employeeId: input.employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      grossAmount,
      bonusAmount: input.bonusAmount || 0,
      deductionAmount: input.deductionAmount || 0,
      netAmount,
      accountId: budget.accountId,
      budgetId: input.budgetId,
      status: input.status,
      notes: input.notes,
      createdById: input.createdById,
    },
    include: { employee: true },
  });

  if (isFinanciallyImpactingStatus(input.status)) {
    const transaction = await createValidatedTransaction({
      title: `Paie ${payroll.employee.fullName}`,
      requesterName: payroll.employee.fullName,
      category: "OUT",
      transactionCategory: "OUT",
      transactionType: "PAYROLL",
      amount: netAmount,
      accountId: budget.accountId,
      budgetId: input.budgetId,
      departmentId: payroll.employee.departmentId || undefined,
      status: input.status === "PAID" ? "PAID" : "VALIDATED",
      sourceType: "PAYROLL",
      sourceId: payroll.id,
      createdById: input.createdById,
      notes: input.notes,
    });

    return prisma.hrcfoPayroll.update({
      where: { id: payroll.id },
      data: { transactionId: transaction.id, status: input.status === "PAID" ? "PAID" : "VALIDATED" },
    });
  }

  return payroll;
}

export async function updateHrcfoTransaction(id: string, input: Partial<HrcfoTransactionInput>) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.hrcfoExpense.findUnique({ where: { id } });
    if (!existing) {
      throw new Error("Transaction introuvable.");
    }

    const category = String(input.transactionCategory || input.category || existing.transactionCategory || existing.category) as "IN" | "OUT";
    const amount = Number(input.amount ?? existing.amount);
    let accountId = String(input.accountId || existing.accountId || "");
    const budgetId = input.budgetId === "" ? null : (input.budgetId ? String(input.budgetId) : existing.budgetId);

    if (category === "OUT") {
      if (!budgetId) {
        throw new Error("Une sortie doit être liée à un budget.");
      }
      const budget = await tx.hrcfoBudget.findUnique({ where: { id: budgetId }, select: { accountId: true, status: true } });
      if (!budget || !["OPEN", "MONITORING"].includes(budget.status) || !budget.accountId) {
        throw new Error("Le budget sélectionné est inactif ou sans compte financier.");
      }
      accountId = budget.accountId;
      if (isFinanciallyImpactingStatus(String(input.status || existing.status))) {
        await assertBudgetAndAccountCanSpend(tx, budgetId, accountId, amount, id);
      }
    }

    const status = String(input.status || existing.status);
    const updated = await tx.hrcfoExpense.update({
      where: { id },
      data: {
        ...input,
        category,
        transactionCategory: category,
        accountId,
        budgetId,
        amount,
        validatedAt: isFinanciallyImpactingStatus(status) ? (existing.validatedAt || new Date()) : null,
        paidAt: status === "PAID" ? (existing.paidAt || new Date()) : null,
      } as never,
      include: { account: true, department: true, budget: true, invoice: true },
    });

    await reconcileFinancialState(tx);
    return {
      ...updated,
      accountName: updated.account?.name,
      departmentName: updated.department?.name,
      budgetName: updated.budget?.name,
      invoiceId: updated.invoice?.id,
    };
  });
}

export async function updatePayroll(id: string, input: Partial<PayrollInput>) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.hrcfoPayroll.findUnique({ where: { id }, include: { employee: true, transaction: true } });
    if (!existing) {
      throw new Error("Paie introuvable.");
    }
    const budgetId = input.budgetId || existing.budgetId;
    if (!budgetId) {
      throw new Error("La paie doit être liée à un budget.");
    }
    const budget = await tx.hrcfoBudget.findUnique({ where: { id: budgetId }, select: { accountId: true, status: true } });
    if (!budget || !budget.accountId || !["OPEN", "MONITORING"].includes(budget.status)) {
      throw new Error("Le budget de paie est inactif ou sans compte financier.");
    }
    const grossAmount = Number(existing.employee.monthlyCompensation || existing.grossAmount || 0);
    const bonusAmount = Number(input.bonusAmount ?? existing.bonusAmount);
    const deductionAmount = Number(input.deductionAmount ?? existing.deductionAmount);
    const netAmount = grossAmount + bonusAmount - deductionAmount;
    if (netAmount <= 0) {
      throw new Error("Le montant net de paie doit être positif.");
    }
    const status = String(input.status || existing.status);
    if (isFinanciallyImpactingStatus(status)) {
      await assertBudgetAndAccountCanSpend(tx, budgetId, budget.accountId, netAmount, existing.transactionId || undefined);
    }

    const payroll = await tx.hrcfoPayroll.update({
      where: { id },
      data: {
        periodStart: input.periodStart || existing.periodStart,
        periodEnd: input.periodEnd || existing.periodEnd,
        grossAmount,
        bonusAmount,
        deductionAmount,
        netAmount,
        accountId: budget.accountId,
        budgetId,
        status,
        notes: input.notes ?? existing.notes,
      },
      include: { employee: true, account: true, budget: true },
    });

    if (isFinanciallyImpactingStatus(status)) {
      const transaction = existing.transactionId
        ? await tx.hrcfoExpense.update({
            where: { id: existing.transactionId },
            data: {
              title: `Paie ${payroll.employee.fullName}`,
              requesterName: payroll.employee.fullName,
              category: "OUT",
              transactionCategory: "OUT",
              transactionType: "PAYROLL",
              amount: netAmount,
              accountId: budget.accountId,
              budgetId,
              departmentId: payroll.employee.departmentId,
              status: status === "PAID" ? "PAID" : "VALIDATED",
              validatedAt: existing.transaction?.validatedAt || new Date(),
              paidAt: status === "PAID" ? (existing.transaction?.paidAt || new Date()) : null,
              notes: payroll.notes,
            },
          })
        : await tx.hrcfoExpense.create({
            data: {
              title: `Paie ${payroll.employee.fullName}`,
              requesterName: payroll.employee.fullName,
              category: "OUT",
              transactionCategory: "OUT",
              transactionType: "PAYROLL",
              amount: netAmount,
              accountId: budget.accountId,
              budgetId,
              departmentId: payroll.employee.departmentId,
              status: status === "PAID" ? "PAID" : "VALIDATED",
              validatedAt: new Date(),
              paidAt: status === "PAID" ? new Date() : null,
              sourceType: "PAYROLL",
              sourceId: payroll.id,
              createdById: input.createdById || payroll.createdById,
              notes: payroll.notes,
            },
          });
      await tx.hrcfoPayroll.update({ where: { id }, data: { transactionId: transaction.id } });
    } else if (existing.transactionId && isCanceledFinancialStatus(status)) {
      await tx.hrcfoExpense.update({
        where: { id: existing.transactionId },
        data: { status: "CANCELED", validatedAt: null, paidAt: null },
      });
    }

    await reconcileFinancialState(tx);
    return {
      ...payroll,
      employeeName: payroll.employee.fullName,
      accountName: payroll.account?.name,
      budgetName: payroll.budget?.name,
    };
  });
}

export async function deleteHrcfoTransaction(id: string) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.hrcfoExpense.findUnique({ where: { id } });
    if (!transaction) {
      return null;
    }
    if (isFinanciallyImpactingStatus(transaction.status)) {
      throw new Error("Une transaction impactante doit être annulée avant suppression.");
    }
    const deleted = await tx.hrcfoExpense.delete({ where: { id } });
    await reconcileFinancialState(tx);
    return deleted;
  });
}

export async function createSubscriptionIncomeTransaction(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, subscription: { include: { plan: true } } },
  });
  if (!payment || payment.status !== PaymentStatus.PAID || !payment.subscription) {
    return null;
  }

  const account = await ensureBankFinancialAccount();
  const transaction = await createValidatedTransaction({
    title: `Abonnement ${payment.subscription.plan.name}`,
    requesterName: payment.user.name,
    category: "IN",
    transactionCategory: "IN",
    transactionType: "SUBSCRIPTION",
    amount: Number(payment.amount),
    currency: payment.currency,
    accountId: account.id,
    status: "VALIDATED",
    sourceType: "PAYMENT",
    sourceId: payment.id,
    clientUserId: payment.userId,
    notes: `Référence paiement: ${payment.reference}`,
    skipInvoice: true,
  });
  await prisma.invoice.updateMany({
    where: { paymentId: payment.id, hrcfoTransactionId: null },
    data: { hrcfoTransactionId: transaction.id },
  });
  return transaction;
}

export async function syncPaidSubscriptionIncomeTransactions() {
  const paidPayments = await prisma.payment.findMany({
    where: { status: PaymentStatus.PAID, subscriptionId: { not: null } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  for (const payment of paidPayments) {
    await createSubscriptionIncomeTransaction(payment.id);
  }
}

async function createOperationalInvoice(
  tx: Prisma.TransactionClient,
  transactionId: string,
  input: { userId?: string | null; title: string; amount: number; currency: string; paidAt?: Date | null }
) {
  if (!input.userId) {
    return null;
  }

  const existing = await tx.invoice.findUnique({ where: { hrcfoTransactionId: transactionId } });
  if (existing) {
    return existing;
  }

  return tx.invoice.create({
    data: {
      number: buildOperationalInvoiceNumber(),
      userId: input.userId,
      planName: input.title,
      amount: input.amount,
      currency: input.currency,
      status: input.paidAt ? InvoiceStatus.PAID : InvoiceStatus.ISSUED,
      paidAt: input.paidAt || null,
      hrcfoTransactionId: transactionId,
    },
  });
}

export async function calculateAccountBalance(accountId: string) {
  const account = await prisma.financialAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    return 0;
  }
  const movements = await prisma.hrcfoExpense.findMany({
    where: { accountId, status: { in: Array.from(impactingStatuses) } },
    select: { transactionCategory: true, category: true, amount: true },
  });
  return movements.reduce((balance, movement) => {
    const amount = Number(movement.amount);
    const category = movement.transactionCategory || movement.category;
    return category === "IN" ? balance + amount : balance - amount;
  }, Number(account.openingBalance));
}

export async function calculateAccountAvailableForBudget(accountId: string) {
  const balance = await calculateAccountBalance(accountId);
  const budgets = await prisma.hrcfoBudget.findMany({
    where: { accountId, status: { in: ["OPEN", "MONITORING"] } },
    select: { amount: true, spentAmount: true },
  });
  const reserved = budgets.reduce((sum, budget) => sum + Math.max(0, Number(budget.amount) - Number(budget.spentAmount)), 0);
  return balance - reserved;
}

export async function reconcileFinancialState(tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const accounts = await tx.financialAccount.findMany({ select: { id: true, openingBalance: true } });
  for (const account of accounts) {
    const movements = await tx.hrcfoExpense.findMany({
      where: { accountId: account.id, status: { in: Array.from(impactingStatuses) } },
      select: { transactionCategory: true, category: true, amount: true },
    });
    const currentBalance = movements.reduce((balance, movement) => {
      const amount = Number(movement.amount);
      const category = movement.transactionCategory || movement.category;
      return category === "IN" ? balance + amount : balance - amount;
    }, Number(account.openingBalance));
    await tx.financialAccount.update({ where: { id: account.id }, data: { currentBalance } });
  }

  const budgets = await tx.hrcfoBudget.findMany({ select: { id: true } });
  for (const budget of budgets) {
    const spent = await tx.hrcfoExpense.aggregate({
      where: { budgetId: budget.id, transactionCategory: "OUT", status: { in: Array.from(impactingStatuses) } },
      _sum: { amount: true },
    });
    await tx.hrcfoBudget.update({ where: { id: budget.id }, data: { spentAmount: Number(spent._sum.amount || 0) } });
  }
}

async function assertBudgetAndAccountCanSpend(
  tx: Prisma.TransactionClient,
  budgetId: string,
  accountId: string,
  amount: number,
  excludingTransactionId?: string
) {
  const budget = await tx.hrcfoBudget.findUnique({ where: { id: budgetId }, select: { amount: true } });
  const account = await tx.financialAccount.findUnique({ where: { id: accountId }, select: { openingBalance: true } });
  if (!budget || !account) {
    throw new Error("Budget ou compte financier introuvable.");
  }
  const budgetSpent = await tx.hrcfoExpense.aggregate({
    where: {
      budgetId,
      transactionCategory: "OUT",
      status: { in: Array.from(impactingStatuses) },
      ...(excludingTransactionId ? { id: { not: excludingTransactionId } } : {}),
    },
    _sum: { amount: true },
  });
  const remainingBudget = Number(budget.amount) - Number(budgetSpent._sum.amount || 0);
  if (remainingBudget < amount) {
    throw new Error("Le solde disponible du budget est insuffisant.");
  }
  const movements = await tx.hrcfoExpense.findMany({
    where: {
      accountId,
      status: { in: Array.from(impactingStatuses) },
      ...(excludingTransactionId ? { id: { not: excludingTransactionId } } : {}),
    },
    select: { transactionCategory: true, category: true, amount: true },
  });
  const accountBalance = movements.reduce((balance, movement) => {
    const movementAmount = Number(movement.amount);
    const category = movement.transactionCategory || movement.category;
    return category === "IN" ? balance + movementAmount : balance - movementAmount;
  }, Number(account.openingBalance));
  if (accountBalance < amount) {
    throw new Error("Le solde disponible du compte lié au budget est insuffisant.");
  }
}
