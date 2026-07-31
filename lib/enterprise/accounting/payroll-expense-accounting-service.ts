import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";

export async function classifyAndPostExpense(
  organizationId: string,
  expenseId: string,
  actorUserId: string,
  input: { accountingTreatment: "DIRECT_EXPENSE" | "EMPLOYEE_REIMBURSEMENT" | "PETTY_CASH"; revision: number },
) {
  const classified = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseExpense" WHERE id = ${expenseId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const expense = await tx.enterpriseExpense.findFirst({ where: { id: expenseId, organizationId } });
    if (!expense) throw new EnterpriseAccountingError("EXPENSE_NOT_FOUND", 404);
    if (expense.status !== "APPROVED" || expense.accountedAt || expense.supplierInvoiceId || expense.revision !== input.revision) throw new EnterpriseAccountingError("EXPENSE_NOT_POSTABLE", 409);
    const updated = await tx.enterpriseExpense.update({ where: { id: expense.id }, data: { accountingTreatment: input.accountingTreatment, updatedByUserId: actorUserId, revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseExpense", entityId: expense.id, eventType: "EXPENSE_ACCOUNTING_CLASSIFIED", summary: `Expense ${expense.reference} classified`, actorUserId, metadataJson: { accountingTreatment: input.accountingTreatment } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const posting = await postBusinessEvent(organizationId, actorUserId, { postingEvent: "EXPENSE_APPROVED", sourceEntityType: "EnterpriseExpense", sourceEntityId: classified.id });
  const updated = await prisma.enterpriseExpense.update({ where: { id: classified.id }, data: { accountedAt: new Date(), journalEntryId: posting.entry.id, updatedByUserId: actorUserId, revision: { increment: 1 } } });
  return { expense: updated, posting };
}

export async function postApprovedClientPayroll(organizationId: string, payrollRunId: string, actorUserId: string) {
  const run = await prisma.enterprisePayrollRun.findFirst({ where: { id: payrollRunId, organizationId, status: "APPROVED" } });
  if (!run) throw new EnterpriseAccountingError("CLIENT_PAYROLL_RUN_NOT_POSTABLE", 409);
  const existing = await prisma.enterpriseJournalEntry.findFirst({ where: { organizationId, sourceEntityType: "EnterprisePayrollRun", sourceEntityId: run.id, postingEvent: "PAYROLL_APPROVED", status: "POSTED" } });
  if (existing) return { run, entry: existing, idempotent: true };
  const posting = await postBusinessEvent(organizationId, actorUserId, { postingEvent: "PAYROLL_APPROVED", sourceEntityType: "EnterprisePayrollRun", sourceEntityId: run.id });
  await prisma.$transaction(async (tx) => {
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayrollRun", entityId: run.id, eventType: "PAYROLL_LIABILITY_POSTED", summary: `Payroll ${run.reference} liability posted`, actorUserId, metadataJson: { journalEntryId: posting.entry.id, grossAmount: run.grossAmount.toFixed(), netAmount: run.netAmount.toFixed(), currency: run.currency } });
  });
  return { run, entry: posting.entry, idempotent: posting.idempotent };
}
