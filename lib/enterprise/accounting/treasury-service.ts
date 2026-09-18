import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
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
    const session = await tx.enterpriseReconciliationSession.findFirst({
      where: { id: sessionId, organizationId, status: { in: ["DRAFT", "IN_PROGRESS"] } },
      include: { financialAccount: { select: { ledgerAccountId: true } } },
    });
    if (!session) throw new EnterpriseAccountingError("RECONCILIATION_SESSION_NOT_OPEN", 409);
    const matchedAmount = new Prisma.Decimal(input.matchedAmount);
    if (!matchedAmount.isPositive()) throw new EnterpriseAccountingError("RECONCILIATION_AMOUNT_INVALID", 400);

    if (input.bankStatementLineId) {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseBankStatementLine" WHERE id = ${input.bankStatementLineId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    }
    const line = input.bankStatementLineId ? await tx.enterpriseBankStatementLine.findFirst({
      where: { id: input.bankStatementLineId, organizationId, bankStatement: { financialAccountId: session.financialAccountId }, reconciliationStatus: "UNMATCHED" },
    }) : null;
    const transaction = input.treasuryTransactionId ? await tx.enterpriseTreasuryTransaction.findFirst({
      where: { id: input.treasuryTransactionId, organizationId, financialAccountId: session.financialAccountId, status: "CONFIRMED", reconciliationStatus: "UNRECONCILED" },
    }) : null;
    if (input.treasuryTransactionId && !transaction) throw new EnterpriseAccountingError("RECONCILIATION_TRANSACTION_INVALID", 409);
    if (input.paymentId && transaction && transaction.paymentId !== input.paymentId) {
      throw new EnterpriseAccountingError("RECONCILIATION_MATCH_TARGET_CONFLICT", 409);
    }
    const resolvedPaymentId = input.paymentId || transaction?.paymentId || null;
    const payment = resolvedPaymentId ? await tx.enterprisePayment.findFirst({
      where: { id: resolvedPaymentId, organizationId, financialAccountId: session.financialAccountId, status: "CONFIRMED" },
    }) : null;
    const journalEntry = input.journalEntryId ? await tx.enterpriseJournalEntry.findFirst({
      where: { id: input.journalEntryId, organizationId, status: "POSTED", lines: { some: { ledgerAccountId: session.financialAccount.ledgerAccountId } } },
      select: { id: true },
    }) : null;

    if (input.bankStatementLineId && !line) throw new EnterpriseAccountingError("RECONCILIATION_BANK_LINE_INVALID", 409);
    if (input.paymentId && !payment) throw new EnterpriseAccountingError("RECONCILIATION_PAYMENT_INVALID", 409);
    if (transaction?.paymentId && !payment) throw new EnterpriseAccountingError("RECONCILIATION_LINKED_PAYMENT_INVALID", 409);
    if (input.journalEntryId && !journalEntry) throw new EnterpriseAccountingError("RECONCILIATION_JOURNAL_ENTRY_INVALID", 409);
    if (!line && !transaction && !payment && !journalEntry) throw new EnterpriseAccountingError("RECONCILIATION_MATCH_TARGET_REQUIRED", 409);
    if (line) {
      const lineAmount = Prisma.Decimal.max(line.debit.abs(), line.credit.abs());
      if (matchedAmount.greaterThan(lineAmount)) throw new EnterpriseAccountingError("RECONCILIATION_AMOUNT_EXCEEDS_BANK_LINE", 409, { matchedAmount: matchedAmount.toFixed(), lineAmount: lineAmount.toFixed() });
    }

    const match = await tx.enterpriseReconciliationMatch.create({
      data: {
        organizationId,
        reconciliationSessionId: session.id,
        bankStatementLineId: line?.id || null,
        paymentId: payment?.id || null,
        treasuryTransactionId: transaction?.id || null,
        journalEntryId: journalEntry?.id || null,
        matchedAmount,
        status: "CONFIRMED",
        matchedByUserId: actorUserId,
        confirmedAt: new Date(),
      },
    });
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
    if (session.bankStatementId) await tx.enterpriseBankStatement.update({ where: { id: session.bankStatementId }, data: { status: "RECONCILED" } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseReconciliationSession", entityId: session.id, eventType: "RECONCILIATION_COMPLETED", summary: `Reconciliation ${session.number} completed`, actorUserId, fromStatus: session.status, toStatus: "COMPLETED", metadataJson: { matchedTotal: matchedTotal.toFixed(), difference: difference.toFixed() } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
