import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import type { bankStatementImportSchema, cashSessionOpenSchema, reconciliationCreateSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type BankStatementInput = z.infer<typeof bankStatementImportSchema>;
type CashSessionOpenInput = z.infer<typeof cashSessionOpenSchema>;
type ReconciliationInput = z.infer<typeof reconciliationCreateSchema>;

export async function openCashSession(organizationId: string, cashierUserId: string, input: CashSessionOpenInput) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: input.financialAccountId, organizationId, accountType: "CASH", status: "ACTIVE", archivedAt: null } });
    if (!account) throw new EnterpriseAccountingError("CASH_ACCOUNT_INVALID", 409);
    const existing = await tx.enterpriseCashSession.findFirst({ where: { organizationId, financialAccountId: account.id, cashierUserId, status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] } } });
    if (existing) throw new EnterpriseAccountingError("CASH_SESSION_ALREADY_ACTIVE", 409, { sessionId: existing.id });
    const openingAmount = new Prisma.Decimal(input.openingAmount);
    const session = await tx.enterpriseCashSession.create({ data: { organizationId, number: financeReference("CASH"), financialAccountId: account.id, cashierUserId, siteId: input.siteId || account.siteId, openingAmount } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseCashSession", entityId: session.id, eventType: "CASH_SESSION_OPENED", summary: `Cash session ${session.number} opened`, actorUserId: cashierUserId, toStatus: "OPEN", metadataJson: { financialAccountId: account.id, openingAmount: openingAmount.toFixed(), currency: account.currencyCode } });
    return session;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitCashSessionClose(
  organizationId: string,
  sessionId: string,
  cashierUserId: string,
  input: { countedClosingAmount: string; closingReason?: string; counts: Array<{ denomination: string; quantity: number }>; revision: number },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseCashSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const session = await tx.enterpriseCashSession.findFirst({ where: { id: sessionId, organizationId }, include: { movements: true } });
    if (!session) throw new EnterpriseAccountingError("CASH_SESSION_NOT_FOUND", 404);
    if (session.cashierUserId !== cashierUserId) throw new EnterpriseAccountingError("CASH_SESSION_NOT_OWNED", 403);
    if (session.status !== "OPEN" || session.revision !== input.revision) throw new EnterpriseAccountingError("CASH_SESSION_CONFLICT", 409);
    const inflows = sumDecimals(session.movements.filter((movement) => movement.direction === "INBOUND").map((movement) => movement.amount));
    const outflows = sumDecimals(session.movements.filter((movement) => movement.direction === "OUTBOUND").map((movement) => movement.amount));
    const expected = money(session.openingAmount.plus(inflows).minus(outflows));
    const counted = new Prisma.Decimal(input.countedClosingAmount);
    const countTotal = money(sumDecimals(input.counts.map((count) => new Prisma.Decimal(count.denomination).times(count.quantity))));
    if (!countTotal.equals(counted)) throw new EnterpriseAccountingError("CASH_COUNT_TOTAL_MISMATCH", 409, { countTotal: countTotal.toFixed(), counted: counted.toFixed() });
    const discrepancy = money(counted.minus(expected));
    await tx.enterpriseCashCount.deleteMany({ where: { organizationId, cashSessionId: session.id } });
    if (input.counts.length) await tx.enterpriseCashCount.createMany({ data: input.counts.map((count) => ({ organizationId, cashSessionId: session.id, denomination: new Prisma.Decimal(count.denomination), quantity: count.quantity, amount: new Prisma.Decimal(count.denomination).times(count.quantity), countedByUserId: cashierUserId })) });
    if (!discrepancy.isZero()) {
      if (!input.closingReason) throw new EnterpriseAccountingError("CASH_DISCREPANCY_REASON_REQUIRED", 409);
      await tx.enterpriseCashDiscrepancy.create({ data: { organizationId, cashSessionId: session.id, amount: discrepancy, reason: input.closingReason, createdByUserId: cashierUserId } });
    }
    const updated = await tx.enterpriseCashSession.update({ where: { id: session.id }, data: { status: "PENDING_VALIDATION", expectedClosingAmount: expected, countedClosingAmount: counted, discrepancyAmount: discrepancy, closingReason: input.closingReason || null, submittedAt: new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseCashSession", entityId: session.id, eventType: "CASH_SESSION_SUBMITTED", summary: `Cash session ${session.number} submitted`, actorUserId: cashierUserId, fromStatus: session.status, toStatus: "PENDING_VALIDATION", metadataJson: { expected: expected.toFixed(), counted: counted.toFixed(), discrepancy: discrepancy.toFixed() } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function validateCashSession(organizationId: string, sessionId: string, validatorUserId: string, input: { approve: boolean; reason?: string; revision: number }) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseCashSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const session = await tx.enterpriseCashSession.findFirst({ where: { id: sessionId, organizationId }, include: { discrepancies: true } });
    if (!session) throw new EnterpriseAccountingError("CASH_SESSION_NOT_FOUND", 404);
    if (session.status !== "PENDING_VALIDATION" || session.revision !== input.revision) throw new EnterpriseAccountingError("CASH_SESSION_CONFLICT", 409);
    assertIndependentActor({ actorUserId: validatorUserId, relatedUserIds: [session.cashierUserId], errorCode: "CASH_SESSION_SELF_VALIDATION_FORBIDDEN" });
    const status = input.approve ? "CLOSED" : "REJECTED";
    if (!input.approve && !input.reason) throw new EnterpriseAccountingError("CASH_REJECTION_REASON_REQUIRED", 409);
    if (input.approve) {
      await tx.enterpriseCashDiscrepancy.updateMany({ where: { organizationId, cashSessionId: session.id, status: "PENDING" }, data: { status: "APPROVED", approvedByUserId: validatorUserId } });
    }
    const updated = await tx.enterpriseCashSession.update({ where: { id: session.id }, data: { status, validatedByUserId: validatorUserId, validatedAt: input.approve ? new Date() : null, rejectedAt: input.approve ? null : new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseCashSession", entityId: session.id, eventType: input.approve ? "CASH_SESSION_CLOSED" : "CASH_SESSION_REJECTED", summary: `Cash session ${session.number}: ${status}`, actorUserId: validatorUserId, fromStatus: session.status, toStatus: status, metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined });
    return { updated, discrepancies: session.discrepancies };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (input.approve) {
    for (const discrepancy of result.discrepancies.filter((item) => !item.amount.isZero())) {
      await postBusinessEvent(organizationId, validatorUserId, { postingEvent: "CASH_VARIANCE_POSTED", sourceEntityType: "EnterpriseCashDiscrepancy", sourceEntityId: discrepancy.id });
    }
  }
  return result.updated;
}

export async function importBankStatement(organizationId: string, actorUserId: string, input: BankStatementInput) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: input.financialAccountId, organizationId, accountType: { in: ["BANK", "MOBILE_MONEY"] }, status: "ACTIVE" } });
    if (!account || account.currencyCode !== input.currencyCode) throw new EnterpriseAccountingError("BANK_STATEMENT_ACCOUNT_INVALID", 409);
    const statement = await tx.enterpriseBankStatement.create({
      data: {
        organizationId,
        financialAccountId: account.id,
        reference: input.reference,
        statementDate: input.statementDate,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currencyCode: input.currencyCode,
        openingBalance: new Prisma.Decimal(input.openingBalance),
        closingBalance: new Prisma.Decimal(input.closingBalance),
        privateDocumentId: input.privateDocumentId || null,
        importedByUserId: actorUserId,
        lines: { create: input.lines.map((line, index) => ({ organizationId, lineNumber: index + 1, transactionDate: line.transactionDate, valueDate: line.valueDate || null, description: line.description.replace(/^[=+\-@]/, "'"), reference: line.reference || null, counterparty: line.counterparty || null, debit: new Prisma.Decimal(line.debit), credit: new Prisma.Decimal(line.credit), currencyCode: input.currencyCode, runningBalance: line.runningBalance ? new Prisma.Decimal(line.runningBalance) : null })) },
      },
      include: { lines: true },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseBankStatement", entityId: statement.id, eventType: "BANK_STATEMENT_IMPORTED", summary: `Bank statement ${statement.reference} imported`, actorUserId, toStatus: "IMPORTED", metadataJson: { lineCount: statement.lines.length, currency: statement.currencyCode } });
    return statement;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function createReconciliationSession(organizationId: string, actorUserId: string, input: ReconciliationInput) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: input.financialAccountId, organizationId, status: "ACTIVE" } });
    if (!account) throw new EnterpriseAccountingError("RECONCILIATION_ACCOUNT_INVALID", 409);
    const statement = input.bankStatementId ? await tx.enterpriseBankStatement.findFirst({ where: { id: input.bankStatementId, organizationId, financialAccountId: account.id } }) : null;
    if (input.bankStatementId && !statement) throw new EnterpriseAccountingError("RECONCILIATION_STATEMENT_INVALID", 409);
    const session = await tx.enterpriseReconciliationSession.create({ data: { organizationId, number: financeReference("REC"), financialAccountId: account.id, bankStatementId: statement?.id || null, periodStart: input.periodStart, periodEnd: input.periodEnd, bookBalance: account.operationalBalance, statementBalance: statement?.closingBalance || account.reconciledBalance, reconciledDifference: (statement?.closingBalance || account.reconciledBalance).minus(account.operationalBalance), preparedByUserId: actorUserId } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseReconciliationSession", entityId: session.id, eventType: "RECONCILIATION_SESSION_CREATED", summary: `Reconciliation ${session.number} created`, actorUserId, toStatus: "DRAFT" });
    return session;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function confirmReconciliationMatch(organizationId: string, sessionId: string, actorUserId: string, input: { bankStatementLineId?: string; paymentId?: string; treasuryTransactionId?: string; journalEntryId?: string; matchedAmount: string }) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.enterpriseReconciliationSession.findFirst({ where: { id: sessionId, organizationId, status: { in: ["DRAFT", "IN_PROGRESS"] } } });
    if (!session) throw new EnterpriseAccountingError("RECONCILIATION_SESSION_NOT_OPEN", 409);
    const matchedAmount = new Prisma.Decimal(input.matchedAmount);
    if (!matchedAmount.isPositive()) throw new EnterpriseAccountingError("RECONCILIATION_AMOUNT_INVALID", 400);
    const line = input.bankStatementLineId ? await tx.enterpriseBankStatementLine.findFirst({ where: { id: input.bankStatementLineId, organizationId, bankStatement: { financialAccountId: session.financialAccountId } } }) : null;
    const transaction = input.treasuryTransactionId ? await tx.enterpriseTreasuryTransaction.findFirst({ where: { id: input.treasuryTransactionId, organizationId, financialAccountId: session.financialAccountId, reconciliationStatus: "UNRECONCILED" } }) : null;
    const payment = input.paymentId ? await tx.enterprisePayment.findFirst({ where: { id: input.paymentId, organizationId, financialAccountId: session.financialAccountId, status: "CONFIRMED" } }) : null;
    if (!line && !transaction && !payment && !input.journalEntryId) throw new EnterpriseAccountingError("RECONCILIATION_MATCH_TARGET_REQUIRED", 409);
    const match = await tx.enterpriseReconciliationMatch.create({ data: { organizationId, reconciliationSessionId: session.id, bankStatementLineId: line?.id || null, paymentId: payment?.id || null, treasuryTransactionId: transaction?.id || null, journalEntryId: input.journalEntryId || null, matchedAmount, status: "CONFIRMED", matchedByUserId: actorUserId, confirmedAt: new Date() } });
    if (line) await tx.enterpriseBankStatementLine.update({ where: { id: line.id }, data: { reconciliationStatus: "MATCHED" } });
    if (transaction) await tx.enterpriseTreasuryTransaction.update({ where: { id: transaction.id }, data: { reconciliationStatus: "RECONCILED" } });
    if (payment) await tx.enterprisePayment.update({ where: { id: payment.id }, data: { status: "RECONCILED", reconciledAt: new Date(), revision: { increment: 1 } } });
    await tx.enterpriseReconciliationSession.update({ where: { id: session.id }, data: { status: "IN_PROGRESS", revision: { increment: 1 } } });
    return match;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function completeReconciliationSession(organizationId: string, sessionId: string, actorUserId: string, revision: number) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseReconciliationSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const session = await tx.enterpriseReconciliationSession.findFirst({ where: { id: sessionId, organizationId }, include: { matches: true, financialAccount: true } });
    if (!session) throw new EnterpriseAccountingError("RECONCILIATION_SESSION_NOT_FOUND", 404);
    if (!(["DRAFT", "IN_PROGRESS"].includes(session.status)) || session.revision !== revision) throw new EnterpriseAccountingError("RECONCILIATION_SESSION_CONFLICT", 409);
    assertIndependentActor({ actorUserId, relatedUserIds: [session.preparedByUserId], errorCode: "RECONCILIATION_SELF_APPROVAL_FORBIDDEN" });
    const matchedTotal = money(sumDecimals(session.matches.filter((match) => match.status === "CONFIRMED").map((match) => match.matchedAmount)));
    const difference = money(session.statementBalance.minus(session.bookBalance));
    const tolerance = (await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } }))?.reconciliationTolerance || new Prisma.Decimal("0.01");
    if (difference.abs().greaterThan(tolerance)) throw new EnterpriseAccountingError("RECONCILIATION_DIFFERENCE_UNRESOLVED", 409, { difference: difference.toFixed(), matchedTotal: matchedTotal.toFixed() });
    const updated = await tx.enterpriseReconciliationSession.update({ where: { id: session.id }, data: { status: "COMPLETED", approvedByUserId: actorUserId, completedAt: new Date(), reconciledDifference: difference, revision: { increment: 1 } } });
    await tx.enterpriseFinancialAccount.update({ where: { id: session.financialAccountId }, data: { reconciledBalance: session.statementBalance, revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseReconciliationSession", entityId: session.id, eventType: "RECONCILIATION_COMPLETED", summary: `Reconciliation ${session.number} completed`, actorUserId, fromStatus: session.status, toStatus: "COMPLETED", metadataJson: { matchedTotal: matchedTotal.toFixed(), difference: difference.toFixed() } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}