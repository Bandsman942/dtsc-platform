import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizePositionCode } from "@/lib/business-roles";
import { createValidatedTransactionInTx, reconcileFinancialState } from "@/lib/hr-cfo-finance";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getApprovedWorkForPayroll } from "@/lib/work-prestations";

export const payrollStatuses = [
  "DRAFT",
  "PENDING_APPROVAL",
  "CHANGES_REQUESTED",
  "VALIDATED",
  "REJECTED",
  "PAID",
  "CANCELLED",
] as const;

export const payrollCoverageStatuses = ["COMPLETE", "PARTIAL", "NONE"] as const;
export type PayrollApproverCode = "CEO" | "COO";

type PayrollActor = NonNullable<Awaited<ReturnType<typeof getPayrollActor>>>;

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const moneySchema = z.coerce.number().finite().min(0).max(10_000_000);
const optionalMoneySchema = z.preprocess((value) => value === "" || value == null ? undefined : value, moneySchema.optional());
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const payrollPrepareSchema = z.object({
  employeeId: z.string().min(5).max(120),
  periodStart: dateKeySchema,
  periodEnd: dateKeySchema,
  budgetId: z.string().min(5).max(120),
  baseAmountOverride: optionalMoneySchema,
  baseAmountOverrideReason: optionalText(1200),
  bonusAmount: moneySchema.default(0),
  bonusReason: optionalText(1200),
  deductionAmount: moneySchema.default(0),
  deductionReason: optionalText(1200),
  workCoverageExceptionReason: optionalText(1800),
  adjustmentEvidenceUrl: optionalText(800),
  notes: optionalText(1800),
}).strict().superRefine(validatePayrollPreparationInput);

export const payrollUpdateSchema = z.object({
  budgetId: z.string().min(5).max(120).optional(),
  baseAmountOverride: optionalMoneySchema,
  baseAmountOverrideReason: optionalText(1200),
  bonusAmount: moneySchema.optional(),
  bonusReason: optionalText(1200),
  deductionAmount: moneySchema.optional(),
  deductionReason: optionalText(1200),
  workCoverageExceptionReason: optionalText(1800),
  adjustmentEvidenceUrl: optionalText(800),
  notes: optionalText(1800),
}).strict();

export const payrollReviewSchema = z.object({
  action: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  comment: optionalText(1800),
}).strict().superRefine((value, ctx) => {
  if ((value.action === "CHANGES_REQUESTED" || value.action === "REJECTED") && !value.comment?.trim()) {
    ctx.addIssue({ code: "custom", path: ["comment"], message: "Un motif est obligatoire." });
  }
});

export const payrollPaymentSchema = z.object({
  paymentReference: optionalText(240),
}).strict();

export const payrollCancelSchema = z.object({
  reason: z.string().trim().min(3).max(1200),
}).strict();

const payrollDetailInclude = {
  employee: { include: { position: true } },
  account: true,
  budget: { include: { account: true } },
  transaction: true,
  preparedBy: { include: { position: true } },
  approver: { include: { position: true } },
  workEvidence: {
    include: { workEntry: true, workSubmission: true },
    orderBy: [{ createdAt: "asc" }],
  },
  reviews: {
    include: { actor: true },
    orderBy: [{ createdAt: "asc" }],
  },
} satisfies Prisma.HrcfoPayrollInclude;

type PayrollDetail = Prisma.HrcfoPayrollGetPayload<{ include: typeof payrollDetailInclude }>;

type WorkEvidenceSnapshot = {
  coverage: (typeof payrollCoverageStatuses)[number];
  approvedMinutes: number;
  entryCount: number;
  submissionCount: number;
  entries: Array<{
    id: string;
    submissionId: string;
    workDate: Date;
    workedMinutes: number;
    approvedMinutes: number;
    summary: string;
    workType: string;
  }>;
};

export class PayrollWorkflowError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export function isPayrollWorkflowError(error: unknown): error is PayrollWorkflowError {
  return error instanceof PayrollWorkflowError;
}

export async function getPayrollActor(userId: string) {
  return prisma.hrcfoEmployee.findFirst({
    where: { userId, status: { not: "EXITED" } },
    include: { position: true, user: true },
  });
}

export function getEmployeePositionCode(employee: { position?: { code: string } | null; positionCode?: string | null; jobTitle?: string | null }) {
  return normalizePositionCode(employee.position?.code || employee.positionCode || employee.jobTitle);
}

export function resolvePayrollApproverCode(employee: { position?: { code: string } | null; positionCode?: string | null; jobTitle?: string | null }): PayrollApproverCode {
  return getEmployeePositionCode(employee) === "CEO" ? "COO" : "CEO";
}

export async function getPayrollWorkspace(actor: PayrollActor) {
  assertOfficialPosition(actor, "HR_CFO", "Seul le HR & CFO peut préparer et administrer le workflow de paie.");
  const [employees, budgets, payrolls] = await Promise.all([
    prisma.hrcfoEmployee.findMany({
      where: { status: { not: "EXITED" } },
      include: { position: true },
      orderBy: { fullName: "asc" },
      take: 300,
    }),
    prisma.hrcfoBudget.findMany({
      where: { status: { in: ["OPEN", "MONITORING"] }, accountId: { not: null } },
      include: { account: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.hrcfoPayroll.findMany({
      include: payrollDetailInclude,
      orderBy: [{ periodStart: "desc" }, { updatedAt: "desc" }],
      take: 250,
    }),
  ]);
  return {
    employees: employees.map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      jobTitle: employee.position?.title || employee.positionTitle || employee.jobTitle,
      positionCode: getEmployeePositionCode(employee),
      department: employee.department,
      status: employee.status,
      monthlyCompensation: employee.monthlyCompensation == null ? null : Number(employee.monthlyCompensation),
    })),
    budgets: budgets.map((budget) => ({
      id: budget.id,
      name: budget.name,
      status: budget.status,
      amount: Number(budget.amount),
      spentAmount: Number(budget.spentAmount),
      accountId: budget.accountId,
      accountName: budget.account?.name || null,
    })),
    payrolls: payrolls.map(serializePayroll),
  };
}

export async function getPayrollForHrCfo(actor: PayrollActor, payrollId: string) {
  assertOfficialPosition(actor, "HR_CFO", "Seul le HR & CFO peut ouvrir ce dossier de paie.");
  const payroll = await findPayrollDetail(payrollId);
  if (!payroll) throw new PayrollWorkflowError("NOT_FOUND", "Paie introuvable.", 404);
  return serializePayroll(payroll);
}

export async function preparePayroll(actor: PayrollActor, input: z.infer<typeof payrollPrepareSchema>) {
  assertOfficialPosition(actor, "HR_CFO", "Seul le HR & CFO peut préparer une paie.");
  const periodStart = dateOnlyToUtc(input.periodStart);
  const periodEnd = dateOnlyToUtc(input.periodEnd);
  assertPeriod(periodStart, periodEnd);

  const employee = await prisma.hrcfoEmployee.findUnique({ where: { id: input.employeeId }, include: { position: true } });
  if (!employee || employee.status === "EXITED") throw new PayrollWorkflowError("EMPLOYEE_NOT_FOUND", "Collaborateur actif introuvable.", 404);
  const budget = await getUsableBudget(input.budgetId);
  const duplicate = await prisma.hrcfoPayroll.findUnique({
    where: { employeeId_periodStart_periodEnd: { employeeId: employee.id, periodStart, periodEnd } },
    select: { id: true, status: true },
  });
  if (duplicate) throw new PayrollWorkflowError("PAYROLL_PERIOD_EXISTS", "Une paie existe déjà pour ce collaborateur et cette période.", 409);

  const evidence = await loadApprovedWorkEvidence(employee.id, periodStart, periodEnd);
  await assertEvidenceAvailable(evidence.entries.map((entry) => entry.id));
  const amount = resolveGrossAmount({
    employeeMonthlyCompensation: employee.monthlyCompensation == null ? null : Number(employee.monthlyCompensation),
    periodStart,
    periodEnd,
    baseAmountOverride: input.baseAmountOverride,
    baseAmountOverrideReason: input.baseAmountOverrideReason,
  });
  const amounts = calculatePayrollAmounts(amount.grossAmount, input.bonusAmount, input.deductionAmount);
  assertAdjustmentReasons(input.bonusAmount, input.bonusReason, input.deductionAmount, input.deductionReason);
  assertOwnedOperationEvidence(input.adjustmentEvidenceUrl, actor.userId);

  const payroll = await prisma.$transaction(async (tx) => {
    const created = await tx.hrcfoPayroll.create({
      data: {
        employeeId: employee.id,
        periodStart,
        periodEnd,
        grossAmount: amounts.grossAmount,
        bonusAmount: amounts.bonusAmount,
        deductionAmount: amounts.deductionAmount,
        netAmount: amounts.netAmount,
        accountId: budget.accountId || undefined,
        budgetId: budget.id,
        status: "DRAFT",
        notes: clean(input.notes),
        createdById: actor.userId || undefined,
        workflowVersion: 1,
        baseAmountSource: amount.source,
        baseAmountOverride: amount.overrideAmount,
        baseAmountOverrideReason: amount.overrideReason,
        bonusReason: clean(input.bonusReason),
        deductionReason: clean(input.deductionReason),
        workCoverage: evidence.coverage,
        workCoverageExceptionReason: clean(input.workCoverageExceptionReason),
        approvedWorkMinutes: evidence.approvedMinutes,
        approvedWorkEntryCount: evidence.entryCount,
        approvedSubmissionCount: evidence.submissionCount,
        workEvidenceCapturedAt: new Date(),
        preparedByEmployeeId: actor.id,
        requiredApproverCode: resolvePayrollApproverCode(employee),
        adjustmentEvidenceUrl: clean(input.adjustmentEvidenceUrl),
      },
    });
    await createEvidenceLinks(tx, created.id, evidence.entries);
    return tx.hrcfoPayroll.findUniqueOrThrow({ where: { id: created.id }, include: payrollDetailInclude });
  });
  return serializePayroll(payroll);
}

export async function updatePreparedPayroll(actor: PayrollActor, payrollId: string, input: z.infer<typeof payrollUpdateSchema>) {
  assertOfficialPosition(actor, "HR_CFO", "Seul le HR & CFO peut corriger une préparation de paie.");
  const existing = await prisma.hrcfoPayroll.findUnique({ where: { id: payrollId }, include: { employee: { include: { position: true } }, workEvidence: true } });
  if (!existing) throw new PayrollWorkflowError("NOT_FOUND", "Paie introuvable.", 404);
  assertWorkflowPayroll(existing.workflowVersion);
  if (existing.status !== "DRAFT" && existing.status !== "CHANGES_REQUESTED") {
    throw new PayrollWorkflowError("PAYROLL_LOCKED", "Cette paie n'est plus modifiable dans le workflow normal.", 409);
  }

  const budget = await getUsableBudget(input.budgetId || existing.budgetId || "");
  const amount = resolveGrossAmount({
    employeeMonthlyCompensation: existing.employee.monthlyCompensation == null ? null : Number(existing.employee.monthlyCompensation),
    periodStart: existing.periodStart,
    periodEnd: existing.periodEnd,
    baseAmountOverride: input.baseAmountOverride === undefined ? (existing.baseAmountOverride == null ? undefined : Number(existing.baseAmountOverride)) : input.baseAmountOverride,
    baseAmountOverrideReason: input.baseAmountOverrideReason === undefined ? existing.baseAmountOverrideReason || undefined : input.baseAmountOverrideReason,
  });
  const bonusAmount = input.bonusAmount ?? Number(existing.bonusAmount);
  const deductionAmount = input.deductionAmount ?? Number(existing.deductionAmount);
  const bonusReason = input.bonusReason === undefined ? existing.bonusReason : clean(input.bonusReason);
  const deductionReason = input.deductionReason === undefined ? existing.deductionReason : clean(input.deductionReason);
  assertAdjustmentReasons(bonusAmount, bonusReason, deductionAmount, deductionReason);
  const amounts = calculatePayrollAmounts(amount.grossAmount, bonusAmount, deductionAmount);
  const adjustmentEvidenceUrl = input.adjustmentEvidenceUrl === undefined ? existing.adjustmentEvidenceUrl : clean(input.adjustmentEvidenceUrl);
  if (input.adjustmentEvidenceUrl !== undefined && adjustmentEvidenceUrl !== existing.adjustmentEvidenceUrl) {
    assertOwnedOperationEvidence(adjustmentEvidenceUrl, actor.userId);
  }

  const refreshEvidence = existing.status === "DRAFT";
  const evidence = refreshEvidence ? await loadApprovedWorkEvidence(existing.employeeId, existing.periodStart, existing.periodEnd) : null;
  if (evidence) await assertEvidenceAvailable(evidence.entries.map((entry) => entry.id), existing.id);

  const payroll = await prisma.$transaction(async (tx) => {
    if (evidence) {
      await tx.hrcfoPayrollWorkEntry.updateMany({ where: { payrollId: existing.id, releasedAt: null }, data: { releasedAt: new Date() } });
      await createEvidenceLinks(tx, existing.id, evidence.entries);
    }
    await tx.hrcfoPayroll.update({
      where: { id: existing.id },
      data: {
        grossAmount: amounts.grossAmount,
        bonusAmount: amounts.bonusAmount,
        deductionAmount: amounts.deductionAmount,
        netAmount: amounts.netAmount,
        budgetId: budget.id,
        accountId: budget.accountId || undefined,
        baseAmountSource: amount.source,
        baseAmountOverride: amount.overrideAmount,
        baseAmountOverrideReason: amount.overrideReason,
        bonusReason,
        deductionReason,
        workCoverage: evidence?.coverage || existing.workCoverage,
        workCoverageExceptionReason: input.workCoverageExceptionReason === undefined ? existing.workCoverageExceptionReason : clean(input.workCoverageExceptionReason),
        approvedWorkMinutes: evidence?.approvedMinutes ?? existing.approvedWorkMinutes,
        approvedWorkEntryCount: evidence?.entryCount ?? existing.approvedWorkEntryCount,
        approvedSubmissionCount: evidence?.submissionCount ?? existing.approvedSubmissionCount,
        workEvidenceCapturedAt: evidence ? new Date() : existing.workEvidenceCapturedAt,
        adjustmentEvidenceUrl,
        notes: input.notes === undefined ? existing.notes : clean(input.notes),
        preparedByEmployeeId: actor.id,
      },
    });
    return tx.hrcfoPayroll.findUniqueOrThrow({ where: { id: existing.id }, include: payrollDetailInclude });
  });
  return serializePayroll(payroll);
}

export async function submitPayrollForApproval(actor: PayrollActor, payrollId: string) {
  assertOfficialPosition(actor, "HR_CFO", "Seul le HR & CFO peut soumettre une paie.");
  const existing = await findPayrollDetail(payrollId);
  if (!existing) throw new PayrollWorkflowError("NOT_FOUND", "Paie introuvable.", 404);
  assertWorkflowPayroll(existing.workflowVersion);
  if (existing.status !== "DRAFT" && existing.status !== "CHANGES_REQUESTED") {
    throw new PayrollWorkflowError("INVALID_TRANSITION", "Cette paie ne peut pas être soumise dans son état actuel.", 409);
  }

  const expectedApprover = resolvePayrollApproverCode(existing.employee);
  const approvers = await resolveEligibleApprovers(expectedApprover, existing.employeeId);
  if (!approvers.length) {
    throw new PayrollWorkflowError("NO_APPROVER", "Aucun approbateur financier opérationnel n'est actuellement configuré.", 409);
  }
  assertPayrollReadyForSubmission(existing);
  await getUsableBudget(existing.budgetId || "");
  await assertEvidenceSnapshot(existing);

  const previousStatus = existing.status;
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.hrcfoPayroll.updateMany({
      where: { id: existing.id, status: previousStatus, workflowVersion: 1 },
      data: {
        status: "PENDING_APPROVAL",
        submittedAt: new Date(),
        requiredApproverCode: expectedApprover,
        approverEmployeeId: null,
        approvedAt: null,
        rejectedAt: null,
        reviewComment: null,
        revision: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new PayrollWorkflowError("CONCURRENT_CHANGE", "La paie a déjà changé d'état. Rechargez la page.", 409);
    await tx.hrcfoPayrollReview.create({
      data: {
        payrollId: existing.id,
        actorEmployeeId: actor.id,
        action: previousStatus === "CHANGES_REQUESTED" ? "RESUBMITTED" : "SUBMITTED",
        comment: null,
      },
    });
    return tx.hrcfoPayroll.findUniqueOrThrow({ where: { id: existing.id }, include: payrollDetailInclude });
  });

  await notifyUsers({
    userIds: approvers.map((item) => item.userId).filter((value): value is string => Boolean(value)),
    title: "Paie DTSC à approuver",
    body: `Une préparation de paie pour la période ${dateKey(existing.periodStart)} au ${dateKey(existing.periodEnd)} attend votre approbation.`,
    type: "PAYROLL",
    targetUrl: expectedApprover === "CEO" ? "/admin?section=ceo" : "/admin?section=coo",
    organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
  });
  return serializePayroll(updated);
}

export async function getPayrollApprovalQueue(actor: PayrollActor, expectedApproverCode: PayrollApproverCode) {
  assertOfficialPosition(actor, expectedApproverCode, "Votre poste actuel ne permet pas cette approbation financière.");
  const payrolls = await prisma.hrcfoPayroll.findMany({
    where: { workflowVersion: 1, requiredApproverCode: expectedApproverCode },
    include: payrollDetailInclude,
    orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
    take: 250,
  });
  return payrolls.filter((payroll) => payroll.employeeId !== actor.id).map(serializePayroll);
}

export async function getPayrollApprovalDetail(actor: PayrollActor, payrollId: string, expectedApproverCode: PayrollApproverCode) {
  assertOfficialPosition(actor, expectedApproverCode, "Votre poste actuel ne permet pas cette approbation financière.");
  const payroll = await findPayrollDetail(payrollId);
  if (!payroll) throw new PayrollWorkflowError("NOT_FOUND", "Paie introuvable.", 404);
  assertWorkflowPayroll(payroll.workflowVersion);
  assertPayrollReviewer(actor, payroll, expectedApproverCode);
  return serializePayroll(payroll);
}

export async function reviewPayroll({
  actor,
  payrollId,
  expectedApproverCode,
  action,
  comment,
}: {
  actor: PayrollActor;
  payrollId: string;
  expectedApproverCode: PayrollApproverCode;
  action: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  comment?: string;
}) {
  assertOfficialPosition(actor, expectedApproverCode, "Votre poste actuel ne permet pas cette approbation financière.");
  if ((action === "CHANGES_REQUESTED" || action === "REJECTED") && !comment?.trim()) {
    throw new PayrollWorkflowError("COMMENT_REQUIRED", "Un motif est obligatoire.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await lockPayroll(tx, payrollId);
    const payroll = await tx.hrcfoPayroll.findUnique({ where: { id: payrollId }, include: payrollDetailInclude });
    if (!payroll) throw new PayrollWorkflowError("NOT_FOUND", "Paie introuvable.", 404);
    assertWorkflowPayroll(payroll.workflowVersion);
    assertPayrollReviewer(actor, payroll, expectedApproverCode);
    if (payroll.status !== "PENDING_APPROVAL") {
      throw new PayrollWorkflowError("INVALID_TRANSITION", "Seule une paie en attente d'approbation peut être examinée.", 409);
    }
    assertPayrollReadyForSubmission(payroll);
    await assertEvidenceSnapshot(payroll, tx);
    const budget = await getUsableBudget(payroll.budgetId || "", tx);

    let transactionId: string | null = payroll.transactionId;
    if (action === "APPROVED") {
      if (Number(payroll.netAmount) <= 0) throw new PayrollWorkflowError("INVALID_NET", "Le montant net doit être positif avant approbation.", 409);
      const existingTransaction = await tx.hrcfoExpense.findFirst({ where: { sourceType: "PAYROLL_WORKFLOW", sourceId: payroll.id } });
      if (existingTransaction && (
        Number(existingTransaction.amount) !== Number(payroll.netAmount) ||
        existingTransaction.budgetId !== budget.id ||
        existingTransaction.accountId !== budget.accountId ||
        existingTransaction.transactionType !== "PAYROLL" ||
        existingTransaction.transactionCategory !== "OUT"
      )) {
        throw new PayrollWorkflowError("TRANSACTION_IDEMPOTENCY_MISMATCH", "Une transaction PAYROLL_WORKFLOW incohérente existe déjà pour cette paie.", 409);
      }
      const transaction = await createValidatedTransactionInTx(tx, {
        title: `Paie ${payroll.employee.fullName}`,
        requesterName: payroll.employee.fullName,
        category: "OUT",
        transactionCategory: "OUT",
        transactionType: "PAYROLL",
        amount: Number(payroll.netAmount),
        accountId: budget.accountId || undefined,
        budgetId: budget.id,
        departmentId: payroll.employee.departmentId || undefined,
        status: "VALIDATED",
        sourceType: "PAYROLL_WORKFLOW",
        sourceId: payroll.id,
        createdById: actor.userId || undefined,
        notes: payroll.notes || undefined,
        skipInvoice: true,
      });
      transactionId = transaction.id;
    }

    const nextStatus = action === "APPROVED" ? "VALIDATED" : action;
    await tx.hrcfoPayroll.update({
      where: { id: payroll.id },
      data: {
        status: nextStatus,
        transactionId,
        approverEmployeeId: actor.id,
        approvedAt: action === "APPROVED" ? new Date() : null,
        rejectedAt: action === "REJECTED" ? new Date() : null,
        reviewComment: comment?.trim() || null,
      },
    });
    await tx.hrcfoPayrollReview.create({
      data: { payrollId: payroll.id, actorEmployeeId: actor.id, action, comment: comment?.trim() || null },
    });
    if (action === "REJECTED") {
      await tx.hrcfoPayrollWorkEntry.updateMany({ where: { payrollId: payroll.id, releasedAt: null }, data: { releasedAt: new Date() } });
    }
    return tx.hrcfoPayroll.findUniqueOrThrow({ where: { id: payroll.id }, include: payrollDetailInclude });
  });

  const hrUsers = await resolveUsersForPosition("HR_CFO");
  const employeeUserId = updated.employee.userId;
  if (action === "APPROVED") {
    await notifyUsers({
      userIds: [...new Set([...hrUsers, ...(employeeUserId ? [employeeUserId] : [])])],
      title: "Paie DTSC validée",
      body: `La paie pour la période ${dateKey(updated.periodStart)} au ${dateKey(updated.periodEnd)} a été validée.`,
      type: "PAYROLL",
      targetUrl: "/activities",
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
    });
  } else {
    await notifyUsers({
      userIds: hrUsers,
      title: action === "CHANGES_REQUESTED" ? "Correction de paie demandée" : "Paie DTSC refusée",
      body: action === "CHANGES_REQUESTED"
        ? `Une correction est demandée sur une préparation de paie pour la période ${dateKey(updated.periodStart)} au ${dateKey(updated.periodEnd)}.`
        : `Une préparation de paie pour la période ${dateKey(updated.periodStart)} au ${dateKey(updated.periodEnd)} a été refusée.`,
      type: "PAYROLL",
      targetUrl: "/admin?section=hrCfo",
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
    });
  }
  return serializePayroll(updated);
}

export async function markPayrollPaid(actor: PayrollActor, payrollId: string, paymentReference?: string) {
  assertOfficialPosition(actor, "HR_CFO", "Seul le HR & CFO peut confirmer le paiement d'une paie validée.");
  const updated = await prisma.$transaction(async (tx) => {
    await lockPayroll(tx, payrollId);
    const payroll = await tx.hrcfoPayroll.findUnique({ where: { id: payrollId }, include: payrollDetailInclude });
    if (!payroll) throw new PayrollWorkflowError("NOT_FOUND", "Paie introuvable.", 404);
    assertWorkflowPayroll(payroll.workflowVersion);
    if (payroll.status === "PAID") return payroll;
    if (payroll.status !== "VALIDATED") throw new PayrollWorkflowError("INVALID_TRANSITION", "Seule une paie validée peut être marquée payée.", 409);
    if (!payroll.transactionId) throw new PayrollWorkflowError("TRANSACTION_MISSING", "La transaction financière validée est introuvable.", 409);

    const transaction = await tx.hrcfoExpense.findUnique({ where: { id: payroll.transactionId } });
    if (!transaction || transaction.sourceType !== "PAYROLL_WORKFLOW" || transaction.sourceId !== payroll.id) {
      throw new PayrollWorkflowError("TRANSACTION_MISMATCH", "La transaction associée à cette paie est incohérente.", 409);
    }
    if (transaction.status !== "VALIDATED" && transaction.status !== "PAID") {
      throw new PayrollWorkflowError("TRANSACTION_NOT_VALIDATED", "La transaction de paie n'est pas validée.", 409);
    }
    const paidAt = transaction.paidAt || new Date();
    if (transaction.status !== "PAID") {
      await tx.hrcfoExpense.update({ where: { id: transaction.id }, data: { status: "PAID", paidAt } });
    }
    await tx.hrcfoPayroll.update({
      where: { id: payroll.id },
      data: { status: "PAID", paidAt, paymentReference: clean(paymentReference) },
    });
    await tx.hrcfoPayrollReview.create({
      data: { payrollId: payroll.id, actorEmployeeId: actor.id, action: "PAID", comment: clean(paymentReference) },
    });
    await reconcileFinancialState(tx);
    return tx.hrcfoPayroll.findUniqueOrThrow({ where: { id: payroll.id }, include: payrollDetailInclude });
  });

  if (updated.employee.userId) {
    await notifyUser({
      userId: updated.employee.userId,
      title: "Paiement de paie DTSC",
      body: `Votre paiement de paie pour la période ${dateKey(updated.periodStart)} au ${dateKey(updated.periodEnd)} a été enregistré.`,
      type: "PAYROLL",
      targetUrl: "/activities",
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
    });
  }
  return serializePayroll(updated);
}

export async function cancelPayroll(actor: PayrollActor, payrollId: string, reason: string) {
  assertOfficialPosition(actor, "HR_CFO", "Seul le HR & CFO peut annuler un brouillon de paie.");
  const updated = await prisma.$transaction(async (tx) => {
    await lockPayroll(tx, payrollId);
    const payroll = await tx.hrcfoPayroll.findUnique({ where: { id: payrollId }, include: payrollDetailInclude });
    if (!payroll) throw new PayrollWorkflowError("NOT_FOUND", "Paie introuvable.", 404);
    assertWorkflowPayroll(payroll.workflowVersion);
    if (payroll.status !== "DRAFT") throw new PayrollWorkflowError("INVALID_TRANSITION", "Seul un brouillon peut être annulé.", 409);
    if (payroll.transactionId) throw new PayrollWorkflowError("FINANCIAL_IMPACT_EXISTS", "Ce brouillon possède déjà un impact financier inattendu.", 409);
    await tx.hrcfoPayroll.update({ where: { id: payroll.id }, data: { status: "CANCELLED", reviewComment: reason.trim() } });
    await tx.hrcfoPayrollWorkEntry.updateMany({ where: { payrollId: payroll.id, releasedAt: null }, data: { releasedAt: new Date() } });
    await tx.hrcfoPayrollReview.create({ data: { payrollId: payroll.id, actorEmployeeId: actor.id, action: "CANCELLED", comment: reason.trim() } });
    return tx.hrcfoPayroll.findUniqueOrThrow({ where: { id: payroll.id }, include: payrollDetailInclude });
  });
  return serializePayroll(updated);
}

export function serializePayroll(payroll: PayrollDetail) {
  const activeEvidence = payroll.workEvidence.filter((item) => !item.releasedAt);
  return {
    id: payroll.id,
    employeeId: payroll.employeeId,
    periodStart: dateKey(payroll.periodStart),
    periodEnd: dateKey(payroll.periodEnd),
    status: payroll.status,
    isLegacy: payroll.workflowVersion !== 1,
    workflowVersion: payroll.workflowVersion,
    grossAmount: Number(payroll.grossAmount),
    bonusAmount: Number(payroll.bonusAmount),
    deductionAmount: Number(payroll.deductionAmount),
    netAmount: Number(payroll.netAmount),
    bonusReason: payroll.bonusReason,
    deductionReason: payroll.deductionReason,
    baseAmountSource: payroll.baseAmountSource,
    baseAmountOverride: payroll.baseAmountOverride == null ? null : Number(payroll.baseAmountOverride),
    baseAmountOverrideReason: payroll.baseAmountOverrideReason,
    workCoverage: payroll.workCoverage,
    workCoverageExceptionReason: payroll.workCoverageExceptionReason,
    approvedWorkMinutes: payroll.approvedWorkMinutes,
    approvedWorkEntryCount: payroll.approvedWorkEntryCount,
    approvedSubmissionCount: payroll.approvedSubmissionCount,
    workEvidenceCapturedAt: payroll.workEvidenceCapturedAt?.toISOString() || null,
    requiredApproverCode: payroll.requiredApproverCode,
    submittedAt: payroll.submittedAt?.toISOString() || null,
    approvedAt: payroll.approvedAt?.toISOString() || null,
    rejectedAt: payroll.rejectedAt?.toISOString() || null,
    paidAt: payroll.paidAt?.toISOString() || null,
    reviewComment: payroll.reviewComment,
    adjustmentEvidenceUrl: payroll.adjustmentEvidenceUrl,
    paymentReference: payroll.paymentReference,
    revision: payroll.revision,
    notes: payroll.notes,
    transactionId: payroll.transactionId,
    createdAt: payroll.createdAt.toISOString(),
    updatedAt: payroll.updatedAt.toISOString(),
    employee: {
      id: payroll.employee.id,
      fullName: payroll.employee.fullName,
      jobTitle: payroll.employee.position?.title || payroll.employee.positionTitle || payroll.employee.jobTitle,
      positionCode: getEmployeePositionCode(payroll.employee),
      department: payroll.employee.department,
      status: payroll.employee.status,
      monthlyCompensation: payroll.employee.monthlyCompensation == null ? null : Number(payroll.employee.monthlyCompensation),
    },
    budget: payroll.budget ? { id: payroll.budget.id, name: payroll.budget.name, status: payroll.budget.status, accountId: payroll.budget.accountId, accountName: payroll.budget.account?.name || null } : null,
    account: payroll.account ? { id: payroll.account.id, name: payroll.account.name, status: payroll.account.status } : null,
    preparedBy: payroll.preparedBy ? { id: payroll.preparedBy.id, fullName: payroll.preparedBy.fullName, positionCode: getEmployeePositionCode(payroll.preparedBy) } : null,
    approver: payroll.approver ? { id: payroll.approver.id, fullName: payroll.approver.fullName, positionCode: getEmployeePositionCode(payroll.approver) } : null,
    workEntries: activeEvidence.map((link) => ({
      id: link.workEntry.id,
      workDate: dateKey(link.workEntry.workDate),
      approvedMinutes: link.approvedMinutes,
      summary: link.workEntry.summary,
      workType: link.workEntry.workType,
      submissionId: link.workSubmissionId,
    })),
    reviewHistory: payroll.reviews.map((review) => ({
      id: review.id,
      action: review.action,
      comment: review.comment,
      actorEmployeeId: review.actorEmployeeId,
      actorName: review.actor.fullName,
      createdAt: review.createdAt.toISOString(),
    })),
  };
}

async function findPayrollDetail(payrollId: string) {
  return prisma.hrcfoPayroll.findUnique({ where: { id: payrollId }, include: payrollDetailInclude });
}

async function loadApprovedWorkEvidence(employeeId: string, periodStart: Date, periodEnd: Date): Promise<WorkEvidenceSnapshot> {
  const expandedStart = mondayOnOrBefore(periodStart);
  const expandedEnd = sundayOnOrAfter(periodEnd);
  const submissions = await getApprovedWorkForPayroll({ employeeId, periodStart: expandedStart, periodEnd: expandedEnd });
  const entries = submissions.flatMap((submission) => submission.entries
    .filter((entry) => entry.workDate >= periodStart && entry.workDate <= periodEnd)
    .map((entry) => ({
      id: entry.id,
      submissionId: submission.id,
      workDate: entry.workDate,
      workedMinutes: entry.workedMinutes,
      summary: entry.summary,
      workType: entry.workType,
    })));
  const usedSubmissionIds = new Set(entries.map((entry) => entry.submissionId));
  const expectedWeeks = enumerateWeekStarts(periodStart, periodEnd);
  const coveredWeekStarts = new Set(submissions
    .filter((submission) => usedSubmissionIds.has(submission.id))
    .map((submission) => dateKey(submission.periodStart)));
  const coverage = entries.length === 0
    ? "NONE"
    : expectedWeeks.every((week) => coveredWeekStarts.has(dateKey(week))) ? "COMPLETE" : "PARTIAL";
  return {
    coverage,
    approvedMinutes: entries.reduce((sum, entry) => sum + entry.workedMinutes, 0),
    entryCount: entries.length,
    submissionCount: usedSubmissionIds.size,
    entries: entries.map((entry) => ({ ...entry, approvedMinutes: entry.workedMinutes })),
  };
}

async function assertEvidenceAvailable(workEntryIds: string[], currentPayrollId?: string) {
  if (!workEntryIds.length) return;
  const existing = await prisma.hrcfoPayrollWorkEntry.findFirst({
    where: { workEntryId: { in: workEntryIds }, releasedAt: null, ...(currentPayrollId ? { payrollId: { not: currentPayrollId } } : {}) },
    include: { payroll: true },
  });
  if (existing) throw new PayrollWorkflowError("WORK_ALREADY_CONSUMED", "Une prestation approuvée est déjà rattachée à une autre paie active.", 409);
}

async function createEvidenceLinks(tx: Prisma.TransactionClient, payrollId: string, entries: WorkEvidenceSnapshot["entries"]) {
  for (const entry of entries) {
    await tx.hrcfoPayrollWorkEntry.create({
      data: {
        payrollId,
        workEntryId: entry.id,
        workSubmissionId: entry.submissionId,
        approvedMinutes: entry.approvedMinutes,
      },
    });
  }
}

async function assertEvidenceSnapshot(payroll: PayrollDetail, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const activeLinks = payroll.workEvidence.filter((link) => !link.releasedAt);
  const expectedCount = payroll.approvedWorkEntryCount || 0;
  const expectedMinutes = payroll.approvedWorkMinutes || 0;
  if (activeLinks.length !== expectedCount || activeLinks.reduce((sum, link) => sum + link.approvedMinutes, 0) !== expectedMinutes) {
    throw new PayrollWorkflowError("WORK_EVIDENCE_MISMATCH", "Le snapshot des prestations approuvées est incohérent.", 409);
  }
  if (!activeLinks.length) return;
  const ids = activeLinks.map((link) => link.workEntryId);
  const verified = await tx.dtscWorkEntry.findMany({
    where: {
      id: { in: ids },
      employeeId: payroll.employeeId,
      deletedAt: null,
      workDate: { gte: payroll.periodStart, lte: payroll.periodEnd },
      submission: { status: "APPROVED" },
    },
    select: { id: true, workedMinutes: true },
  });
  const byId = new Map(verified.map((entry) => [entry.id, entry.workedMinutes]));
  if (verified.length !== activeLinks.length || activeLinks.some((link) => byId.get(link.workEntryId) !== link.approvedMinutes)) {
    throw new PayrollWorkflowError("WORK_EVIDENCE_NOT_APPROVED", "Les preuves de travail liées ne correspondent plus à des prestations approuvées.", 409);
  }
}

function resolveGrossAmount({
  employeeMonthlyCompensation,
  periodStart,
  periodEnd,
  baseAmountOverride,
  baseAmountOverrideReason,
}: {
  employeeMonthlyCompensation: number | null;
  periodStart: Date;
  periodEnd: Date;
  baseAmountOverride?: number;
  baseAmountOverrideReason?: string | null;
}) {
  const fullMonth = isFullCalendarMonth(periodStart, periodEnd);
  if (fullMonth && employeeMonthlyCompensation != null) {
    return { grossAmount: roundMoney(employeeMonthlyCompensation), source: "MONTHLY_COMPENSATION", overrideAmount: null, overrideReason: null };
  }
  if (baseAmountOverride == null || !baseAmountOverrideReason?.trim()) {
    throw new PayrollWorkflowError(
      "BASE_OVERRIDE_REQUIRED",
      fullMonth
        ? "Le dossier RH ne contient pas de rémunération mensuelle. Un montant de base explicite et son motif sont obligatoires."
        : "Une période partielle ne peut pas être proratisée automatiquement. Un montant de base explicite et son motif sont obligatoires.",
      400,
    );
  }
  return { grossAmount: roundMoney(baseAmountOverride), source: "EXPLICIT_OVERRIDE", overrideAmount: roundMoney(baseAmountOverride), overrideReason: baseAmountOverrideReason.trim() };
}

function calculatePayrollAmounts(grossAmount: number, bonusAmount = 0, deductionAmount = 0) {
  const gross = roundMoney(grossAmount);
  const bonus = roundMoney(bonusAmount);
  const deduction = roundMoney(deductionAmount);
  if (gross < 0 || bonus < 0 || deduction < 0) throw new PayrollWorkflowError("INVALID_AMOUNT", "Les montants de paie ne peuvent pas être négatifs.");
  const net = roundMoney(gross + bonus - deduction);
  if (net < 0) throw new PayrollWorkflowError("INVALID_NET", "Le montant net de paie ne peut pas être négatif.");
  return { grossAmount: gross, bonusAmount: bonus, deductionAmount: deduction, netAmount: net };
}

function assertBaseAmountSource(payroll: PayrollDetail) {
  const grossAmount = roundMoney(Number(payroll.grossAmount));
  if (payroll.baseAmountSource === "MONTHLY_COMPENSATION") {
    const monthly = payroll.employee.monthlyCompensation == null ? null : roundMoney(Number(payroll.employee.monthlyCompensation));
    if (!isFullCalendarMonth(payroll.periodStart, payroll.periodEnd) || monthly == null || grossAmount !== monthly) {
      throw new PayrollWorkflowError("BASE_AMOUNT_STALE", "La rémunération de base ne correspond plus au dossier RH. HR & CFO doit corriger le brouillon avant approbation.", 409);
    }
    return;
  }
  if (payroll.baseAmountSource === "EXPLICIT_OVERRIDE") {
    const override = payroll.baseAmountOverride == null ? null : roundMoney(Number(payroll.baseAmountOverride));
    if (override == null || !payroll.baseAmountOverrideReason?.trim() || grossAmount !== override) {
      throw new PayrollWorkflowError("BASE_OVERRIDE_INVALID", "Le montant de base explicite et son motif sont incohérents.", 409);
    }
    return;
  }
  throw new PayrollWorkflowError("BASE_AMOUNT_SOURCE_INVALID", "La source de rémunération de base est absente ou invalide.", 409);
}

function assertOwnedOperationEvidence(value: string | null | undefined, userId: string | null) {
  const url = clean(value);
  if (!url) return;
  if (!userId) throw new PayrollWorkflowError("EVIDENCE_FORBIDDEN", "Le justificatif privé ne peut pas être rattaché à ce compte.", 403);
  const expectedPrefix = `/api/admin/operation-files/operations/${encodeURIComponent(userId)}/`;
  if (!url.startsWith(expectedPrefix)) {
    throw new PayrollWorkflowError("EVIDENCE_FORBIDDEN", "Le justificatif doit provenir de l'upload privé contrôlé DTSC de l'utilisateur courant.", 403);
  }
}

function assertAdjustmentReasons(bonusAmount: number, bonusReason?: string | null, deductionAmount = 0, deductionReason?: string | null) {
  if (bonusAmount > 0 && !bonusReason?.trim()) throw new PayrollWorkflowError("BONUS_REASON_REQUIRED", "Un motif est obligatoire pour toute prime.");
  if (deductionAmount > 0 && !deductionReason?.trim()) throw new PayrollWorkflowError("DEDUCTION_REASON_REQUIRED", "Un motif est obligatoire pour toute retenue.");
}

function assertPayrollReadyForSubmission(payroll: PayrollDetail) {
  assertBaseAmountSource(payroll);
  assertAdjustmentReasons(Number(payroll.bonusAmount), payroll.bonusReason, Number(payroll.deductionAmount), payroll.deductionReason);
  const recomputed = calculatePayrollAmounts(Number(payroll.grossAmount), Number(payroll.bonusAmount), Number(payroll.deductionAmount));
  if (recomputed.netAmount !== Number(payroll.netAmount)) throw new PayrollWorkflowError("NET_MISMATCH", "Le montant net doit être recalculé avant soumission.", 409);
  if (payroll.workCoverage !== "COMPLETE" && !payroll.workCoverageExceptionReason?.trim()) {
    throw new PayrollWorkflowError("COVERAGE_REASON_REQUIRED", "Une justification est obligatoire pour une période avec prestations partielles ou absentes.", 400);
  }
  if (!payroll.budgetId || !payroll.accountId) throw new PayrollWorkflowError("BUDGET_REQUIRED", "La paie doit être liée à un budget et à son compte financier.", 409);
}

async function getUsableBudget(budgetId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  if (!budgetId) throw new PayrollWorkflowError("BUDGET_REQUIRED", "Un budget de paie est obligatoire.");
  const budget = await tx.hrcfoBudget.findUnique({ where: { id: budgetId }, include: { account: true } });
  if (!budget || !["OPEN", "MONITORING"].includes(budget.status) || !budget.accountId || !budget.account || budget.account.status !== "ACTIVE") {
    throw new PayrollWorkflowError("BUDGET_UNAVAILABLE", "Le budget de paie est inactif ou son compte financier est indisponible.", 409);
  }
  return budget;
}

async function resolveEligibleApprovers(code: PayrollApproverCode, employeeId: string) {
  const candidates = await prisma.hrcfoEmployee.findMany({
    where: { status: { not: "EXITED" }, userId: { not: null }, id: { not: employeeId } },
    include: { position: true },
    take: 100,
  });
  return candidates.filter((candidate) => getEmployeePositionCode(candidate) === code);
}

async function resolveUsersForPosition(code: "HR_CFO" | PayrollApproverCode) {
  const employees = await prisma.hrcfoEmployee.findMany({
    where: { status: { not: "EXITED" }, userId: { not: null } },
    include: { position: true },
    take: 100,
  });
  return employees.filter((employee) => getEmployeePositionCode(employee) === code).map((employee) => employee.userId).filter((value): value is string => Boolean(value));
}

function assertPayrollReviewer(actor: PayrollActor, payroll: PayrollDetail, expectedApproverCode: PayrollApproverCode) {
  if (payroll.employeeId === actor.id) throw new PayrollWorkflowError("SELF_APPROVAL_FORBIDDEN", "Aucun collaborateur ne peut approuver sa propre paie.", 403);
  if (payroll.requiredApproverCode !== expectedApproverCode || resolvePayrollApproverCode(payroll.employee) !== expectedApproverCode) {
    throw new PayrollWorkflowError("WRONG_APPROVER", "Cette paie doit être traitée par un autre niveau d'approbation.", 403);
  }
}

function assertOfficialPosition(actor: PayrollActor, expected: string, message: string) {
  if (getEmployeePositionCode(actor) !== expected) throw new PayrollWorkflowError("FORBIDDEN", message, 403);
}

function assertWorkflowPayroll(workflowVersion: number | null) {
  if (workflowVersion !== 1) throw new PayrollWorkflowError("LEGACY_PAYROLL", "Cette ancienne paie reste consultable mais ne peut pas être pilotée par le workflow Sprint 5.", 409);
}

async function lockPayroll(tx: Prisma.TransactionClient, payrollId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll:${payrollId}`}))`;
}

function validatePayrollPreparationInput(value: { periodStart: string; periodEnd: string; bonusAmount: number; bonusReason?: string; deductionAmount: number; deductionReason?: string }, ctx: z.RefinementCtx) {
  if (value.periodStart > value.periodEnd) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "La fin de période doit être postérieure au début." });
  if (value.bonusAmount > 0 && !value.bonusReason?.trim()) ctx.addIssue({ code: "custom", path: ["bonusReason"], message: "Un motif de prime est obligatoire." });
  if (value.deductionAmount > 0 && !value.deductionReason?.trim()) ctx.addIssue({ code: "custom", path: ["deductionReason"], message: "Un motif de retenue est obligatoire." });
}

function assertPeriod(start: Date, end: Date) {
  if (start > end) throw new PayrollWorkflowError("INVALID_PERIOD", "La période de paie est invalide.");
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > 62) throw new PayrollWorkflowError("PERIOD_TOO_LONG", "Une période de paie ne peut pas dépasser 62 jours.");
}

function enumerateWeekStarts(periodStart: Date, periodEnd: Date) {
  const first = mondayOnOrBefore(periodStart);
  const last = mondayOnOrBefore(periodEnd);
  const result: Date[] = [];
  for (let cursor = new Date(first); cursor <= last; cursor = addUtcDays(cursor, 7)) result.push(new Date(cursor));
  return result;
}

function mondayOnOrBefore(date: Date) {
  const day = date.getUTCDay();
  return addUtcDays(dateOnlyToUtc(dateKey(date)), -(day === 0 ? 6 : day - 1));
}

function sundayOnOrAfter(date: Date) {
  return addUtcDays(mondayOnOrBefore(date), 6);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isFullCalendarMonth(start: Date, end: Date) {
  if (start.getUTCDate() !== 1 || start.getUTCFullYear() !== end.getUTCFullYear() || start.getUTCMonth() !== end.getUTCMonth()) return false;
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  return end.getUTCDate() === lastDay;
}

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clean(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}
