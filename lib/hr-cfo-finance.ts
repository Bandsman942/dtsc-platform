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
  accountId: string;
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
  grossAmount: number;
  bonusAmount?: number;
  deductionAmount?: number;
  accountId: string;
  budgetId: string;
  status: string;
  notes?: string;
  createdById?: string;
};

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
  const account = await prisma.financialAccount.findUnique({ where: { id: input.accountId } });
  if (!account || account.status !== "ACTIVE") {
    throw new Error("Le compte financier sélectionné est inactif ou introuvable.");
  }

  const committed = await prisma.hrcfoBudget.aggregate({
    where: { accountId: input.accountId, status: { in: ["OPEN", "MONITORING"] } },
    _sum: { amount: true },
  });
  const availableForBudget = Number(account.currentBalance) - Number(committed._sum.amount || 0);
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
    const account = await tx.financialAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.status !== "ACTIVE") {
      throw new Error("Le compte financier sélectionné est inactif ou introuvable.");
    }

    let budget: { id: string; amount: unknown; spentAmount: unknown; status: string } | null = null;
    if (normalizedCategory === "OUT") {
      if (!input.budgetId) {
        throw new Error("Une transaction de sortie doit être liée à un budget disponible.");
      }
      budget = await tx.hrcfoBudget.findUnique({
        where: { id: input.budgetId },
        select: { id: true, amount: true, spentAmount: true, status: true },
      });
      if (!budget || !["OPEN", "MONITORING"].includes(budget.status)) {
        throw new Error("Le budget sélectionné n'est pas actif.");
      }
      const remainingBudget = Number(budget.amount) - Number(budget.spentAmount);
      if (remainingBudget < input.amount) {
        throw new Error("Le solde disponible du budget est insuffisant.");
      }
      if (Number(account.currentBalance) < input.amount) {
        throw new Error("Le solde disponible du compte est insuffisant.");
      }
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
        accountId: input.accountId,
        departmentId: input.departmentId || null,
        budgetId: input.budgetId || null,
        paymentMethod: input.paymentMethod || null,
        attachmentUrl: input.attachmentUrl || null,
        sourceType: input.sourceType || null,
        sourceId: input.sourceId || null,
        clientUserId: input.clientUserId || null,
        status,
        priority: input.priority || "MEDIUM",
        validatedAt: status === "VALIDATED" ? new Date() : null,
        notes: input.notes || null,
        createdById: input.createdById || null,
      },
    });

    if (status === "VALIDATED") {
      if (normalizedCategory === "IN") {
        await tx.financialAccount.update({
          where: { id: input.accountId },
          data: { currentBalance: { increment: input.amount } },
        });
      } else {
        const budgetId = input.budgetId;
        if (!budgetId) {
          throw new Error("Une transaction de sortie doit être liée à un budget disponible.");
        }
        await tx.financialAccount.update({
          where: { id: input.accountId },
          data: { currentBalance: { decrement: input.amount } },
        });
        await tx.hrcfoBudget.update({
          where: { id: budgetId },
          data: { spentAmount: { increment: input.amount } },
        });
      }

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
  const netAmount = input.grossAmount + (input.bonusAmount || 0) - (input.deductionAmount || 0);
  if (netAmount <= 0) {
    throw new Error("Le montant net de paie doit être positif.");
  }

  const payroll = await prisma.hrcfoPayroll.create({
    data: {
      employeeId: input.employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      grossAmount: input.grossAmount,
      bonusAmount: input.bonusAmount || 0,
      deductionAmount: input.deductionAmount || 0,
      netAmount,
      accountId: input.accountId,
      budgetId: input.budgetId,
      status: input.status,
      notes: input.notes,
      createdById: input.createdById,
    },
    include: { employee: true },
  });

  if (input.status === "VALIDATED" || input.status === "PAID") {
    const transaction = await createValidatedTransaction({
      title: `Paie ${payroll.employee.fullName}`,
      requesterName: payroll.employee.fullName,
      category: "OUT",
      transactionCategory: "OUT",
      transactionType: "PAYROLL",
      amount: netAmount,
      accountId: input.accountId,
      budgetId: input.budgetId,
      departmentId: payroll.employee.departmentId || undefined,
      status: "VALIDATED",
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

export async function createSubscriptionIncomeTransaction(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, subscription: { include: { plan: true } } },
  });
  if (!payment || payment.status !== PaymentStatus.PAID || !payment.subscription) {
    return null;
  }

  const account = await ensureDefaultFinancialAccount();
  return createValidatedTransaction({
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
