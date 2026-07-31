import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { createJournalEntryDraft, postJournalEntry } from "@/lib/enterprise/accounting/journal-service";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import type { accountTransferCreateSchema, bankStatementImportSchema, cashSessionOpenSchema, reconciliationCreateSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type TransferInput = z.infer<typeof accountTransferCreateSchema>;
type BankStatementInput = z.infer<typeof bankStatementImportSchema>;
type CashSessionOpenInput = z.infer<typeof cashSessionOpenSchema>;
type ReconciliationInput = z.infer<typeof reconciliationCreateSchema>;

export async function createFinancialAccount(
  organizationId: string,
  actorUserId: string,
  input: {
    code: string;
    name: string;
    accountType: "CASH" | "BANK" | "MOBILE_MONEY" | "CLEARING";
    currencyCode: string;
    maskedReference?: string;
    openingBalance: string;
    ledgerAccountId: string;
    responsibleUserId?: string;
    siteId?: string;
    settingsJson?: Record<string, unknown>;
  },
) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const ledger = await tx.enterpriseLedgerAccount.findFirst({ where: { id: input.ledgerAccountId, organizationId, isActive: true, archivedAt: null } });
    if (!ledger) throw new EnterpriseAccountingError("TREASURY_LEDGER_ACCOUNT_INVALID", 409);
    const expectedSubtype = input.accountType === "CASH" ? "CASH" : input.accountType === "BANK" ? "BANK" : input.accountType === "MOBILE_MONEY" ? "MOBILE_MONEY" : "CLEARING";
    if (ledger.accountSubtype !== expectedSubtype) throw new EnterpriseAccountingError("TREASURY_LEDGER_SUBTYPE_MISMATCH", 409);
    if (ledger.currencyCode && ledger.currencyCode !== input.currencyCode) throw new EnterpriseAccountingError("TREASURY_LEDGER_CURRENCY_MISMATCH", 409);
    if (input.siteId) {
      const site = await tx.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!site) throw new EnterpriseAccountingError("TREASURY_SITE_INVALID", 409);
    }
    const openingBalance = new Prisma.Decimal(input.openingBalance);
    const account = await tx.enterpriseFinancialAccount.create({
      data: {
        organizationId,
        code: input.code,
        name: input.name,
        accountType: input.accountType,
        currencyCode: input.currencyCode,
        maskedReference: input.maskedReference || null,
        openingBalance,
        operationalBalance: openingBalance,
        reconciledBalance: openingBalance,
        ledgerAccountId: input.ledgerAccountId,
        responsibleUserId: input.responsibleUserId || null,
        siteId: input.siteId || null,
        settingsJson: input.settingsJson as Prisma.InputJsonValue | undefined,
      },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseFinancialAccount", entityId: account.id, eventType: "FINANCIAL_ACCOUNT_CREATED", summary: `Financial account ${account.code} created`, actorUserId, toStatus: "ACTIVE", metadataJson: { accountType: account.accountType, currency: account.currencyCode, maskedReference: account.maskedReference } });
    return account;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createAccountTransfer(organizationId: string, actorUserId: string, input: TransferInput) {
  return prisma.$transaction(async (tx) => {
    const accounts = await tx.enterpriseFinancialAccount.findMany({ where: { organizationId, id: { in: [input.sourceFinancialAccountId, input.targetFinancialAccountId] }, status: "ACTIVE", archivedAt: null } });
    if (accounts.length !== 2) throw new EnterpriseAccountingError("TRANSFER_ACCOUNTS_INVALID", 409);
    const source = accounts.find((account) => account.id === input.sourceFinancialAccountId)!;
    const target = accounts.find((account) => account.id === input.targetFinancialAccountId)!;
    if (source.currencyCode !== target.currencyCode && !input.exchangeRate) throw new EnterpriseAccountingError("TRANSFER_EXCHANGE_RATE_REQUIRED", 409);
    const transfer = await tx.enterpriseAccountTransfer.create({
      data: {
        organizationId,
        number: financeReference("TRF"),
        sourceFinancialAccountId: source.id,
        targetFinancialAccountId: target.id,
        sourceCurrencyCode: source.currencyCode,
        targetCurrencyCode: target.currencyCode,
        sourceAmount: new Prisma.Decimal(input.sourceAmount),
        targetAmount: new Prisma.Decimal(input.targetAmount),
        exchangeRate: input.exchangeRate ? new Prisma.Decimal(input.exchangeRate) : null,
        transferDate: input.transferDate,
        initiatedByUserId: actorUserId,
      },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseAccountTransfer", entityId: transfer.id, eventType: "ACCOUNT_TRANSFER_CREATED", summary: `Transfer ${transfer.number} created`, actorUserId, toStatus: "DRAFT" });
    return transfer;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveAccountTransfer(organizationId: string, transferId: string, actorUserId: string, revision: number) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAccountTransfer" WHERE id = ${transferId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const transfer = await tx.enterpriseAccountTransfer.findFirst({ where: { id: transferId, organizationId } });
    if (!transfer) throw new EnterpriseAccountingError("TRANSFER_NOT_FOUND", 404);
    if (transfer.status !== "DRAFT" || transfer.revision !== revision) throw new EnterpriseAccountingError("TRANSFER_CONFLICT", 409);
    assertIndependentActor({ actorUserId, relatedUserIds: [transfer.initiatedByUserId], errorCode: "TRANSFER_SELF_APPROVAL_FORBIDDEN" });
    return tx.enterpriseAccountTransfer.update({ where: { id: transfer.id }, data: { status: "APPROVED", approvedByUserId: actorUserId, revision: { increment: 1 } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function confirmAccountTransfer(organizationId: string, transferId: string, actorUserId: string, revision: number) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAccountTransfer" WHERE id = ${transferId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const transfer = await tx.enterpriseAccountTransfer.findFirst({ where: { id: transferId, organizationId } });
    if (!transfer) throw new EnterpriseAccountingError("TRANSFER_NOT_FOUND", 404);
    if (transfer.status === "CONFIRMED") {
      const accounts = await tx.enterpriseFinancialAccount.findMany({ where: { organizationId, id: { in: [transfer.sourceFinancialAccountId, transfer.targetFinancialAccountId] } } });
      return { transfer, source: accounts.find((account) => account.id === transfer.sourceFinancialAccountId)!, target: accounts.find((account) => account.id === transfer.targetFinancialAccountId)! };
    }
    if (transfer.status !== "APPROVED" || transfer.revision !== revision) throw new EnterpriseAccountingError("TRANSFER_NOT_APPROVED", 409);
    const [source, target] = await Promise.all([
      tx.enterpriseFinancialAccount.findFirst({ where: { id: transfer.sourceFinancialAccountId, organizationId, status: "ACTIVE" } }),
      tx.enterpriseFinancialAccount.findFirst({ where: { id: transfer.targetFinancialAccountId, organizationId, status: "ACTIVE" } }),
    ]);
    if (!source || !target) throw new EnterpriseAccountingError("TRANSFER_ACCOUNTS_INVALID", 409);
    if (source.operationalBalance.lessThan(transfer.sourceAmount)) throw new EnterpriseAccountingError("TRANSFER_INSUFFICIENT_OPERATIONAL_BALANCE", 409);
    await tx.enterpriseFinancialAccount.update({ where: { id: source.id }, data: { operationalBalance: { decrement: transfer.sourceAmount }, revision: { increment: 1 } } });
    await tx.enterpriseFinancialAccount.update({ where: { id: target.id }, data: { operationalBalance: { increment: transfer.targetAmount }, revision: { increment: 1 } } });
    await tx.enterpriseTreasuryTransaction.createMany({ data: [
      { organizationId, financialAccountId: source.id, transferId: transfer.id, transactionType: "TRANSFER", direction: "OUTBOUND", currencyCode: source.currencyCode, amount: transfer.sourceAmount, transactionDate: transfer.transferDate, reference: transfer.number, createdByUserId: actorUserId },
      { organizationId, financialAccountId: target.id, transferId: transfer.id, transactionType: "TRANSFER", direction: "INBOUND", currencyCode: target.currencyCode, amount: transfer.targetAmount, transactionDate: transfer.transferDate, reference: transfer.number, createdByUserId: actorUserId },
    ] });
    const confirmed = await tx.enterpriseAccountTransfer.update({ where: { id: transfer.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseAccountTransfer", entityId: transfer.id, eventType: "ACCOUNT_TRANSFER_CONFIRMED", summary: `Transfer ${transfer.number} confirmed`, actorUserId, fromStatus: transfer.status, toStatus: "CONFIRMED", metadataJson: { sourceAccountId: source.id, targetAccountId: target.id } });
    return { transfer: confirmed, source, target };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const idempotency = `${organizationId}:ACCOUNT_TRANSFER:${result.transfer.id}:1`;
  let entry = await prisma.enterpriseJournalEntry.findFirst({ where: { organizationId, idempotencyKey: idempotency } });
  if (!entry) {
    const journal = await prisma.enterpriseJournal.findFirst({ where: { organizationId, journalType: result.source.accountType === "CASH" ? "CASH" : result.source.accountType === "MOBILE_MONEY" ? "MOBILE_MONEY" : "BANK", isActive: true } });
    if (!journal) throw new EnterpriseAccountingError("TRANSFER_JOURNAL_REQUIRED", 409);
    const period = await prisma.$transaction((tx) => getPostingPeriod(tx, organizationId, result.transfer.transferDate, { allowSoftClosed: true }));
    entry = await createJournalEntryDraft(organizationId, actorUserId, {
      journalId: journal.id,
      fiscalPeriodId: period.id,
      accountingDate: result.transfer.transferDate,
      documentDate: result.transfer.transferDate,
      reference: result.transfer.number,
      description: `Internal transfer ${result.transfer.number}`,
      sourceModule: "FINANCE_TREASURY",
      sourceEntityType: "EnterpriseAccountTransfer",
      sourceEntityId: result.transfer.id,
      postingVersion: 1,
      idempotencyKey: idempotency,
      lines: [
        { ledgerAccountId: result.target.ledgerAccountId, description: `Transfer in ${result.transfer.number}`, debit: result.transfer.targetAmount.toFixed(), credit: "0", transactionCurrencyCode: result.target.currencyCode, transactionAmount: result.transfer.targetAmount.toFixed() },
        { ledgerAccountId: result.source.ledgerAccountId, description: `Transfer out ${result.transfer.number}`, debit: "0", credit: result.transfer.sourceAmount.toFixed(), transactionCurrencyCode: result.source.currencyCode, transactionAmount: result.transfer.sourceAmount.toFixed() },
      ],
    });
  }
  if (entry.status === "APPROVED") await postJournalEntry(organizationId, entry.id, actorUserId, entry.revision);
  return result.transfer;
}

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
