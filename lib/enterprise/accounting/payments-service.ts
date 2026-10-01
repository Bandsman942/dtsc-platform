import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, financeReference, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent, postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { reverseJournalEntryTx } from "@/lib/enterprise/accounting/reversal-service";
import type { paymentCreateSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type PaymentInput = z.infer<typeof paymentCreateSchema>;

function paymentPostingEvent(paymentType: string) {
  if (paymentType === "CUSTOMER_PAYMENT") return "CUSTOMER_PAYMENT_CONFIRMED" as const;
  if (paymentType === "SUPPLIER_PAYMENT") return "SUPPLIER_PAYMENT_CONFIRMED" as const;
  if (paymentType === "PAYROLL_PAYMENT") return "PAYROLL_PAYMENT_CONFIRMED" as const;
  return null;
}

async function addPaymentEvent(tx: Prisma.TransactionClient, organizationId: string, paymentId: string, actorUserId: string, eventType: string, summary: string, metadataJson?: Prisma.InputJsonValue) {
  await tx.enterprisePaymentEvent.create({ data: { organizationId, paymentId, actorUserId, eventType, summary, metadataJson } });
}

// Cutover of migration 20260929083000_payment_cash_session_binding.
// Only rows created before this point may use automatic Cash-session recovery/rebinding.
const CASH_SESSION_BINDING_CUTOVER_AT = new Date("2026-09-29T08:30:00.000Z");

type CashSessionPayment = {
  id: string;
  organizationId: string;
  financialAccountId: string | null;
  initiatedByUserId: string;
  cashSessionId: string | null;
  createdAt: Date;
};

function isLegacyCashSessionBinding(payment: CashSessionPayment) {
  return payment.createdAt < CASH_SESSION_BINDING_CUTOVER_AT;
}

async function resolveCashSessionForConfirmation(
  tx: Prisma.TransactionClient,
  payment: CashSessionPayment,
  actorUserId: string,
) {
  if (!payment.financialAccountId) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_REQUIRED", 409);

  const findPreferredOpenReplacement = async () => {
    const historicalCashierSession = await tx.enterpriseCashSession.findFirst({
      where: {
        organizationId: payment.organizationId,
        financialAccountId: payment.financialAccountId!,
        cashierUserId: payment.initiatedByUserId,
        status: "OPEN",
      },
      orderBy: { openedAt: "desc" },
    });
    if (historicalCashierSession) return historicalCashierSession;

    if (actorUserId !== payment.initiatedByUserId) {
      const confirmingCashierSession = await tx.enterpriseCashSession.findFirst({
        where: {
          organizationId: payment.organizationId,
          financialAccountId: payment.financialAccountId!,
          cashierUserId: actorUserId,
          status: "OPEN",
        },
        orderBy: { openedAt: "desc" },
      });
      if (confirmingCashierSession) return confirmingCashierSession;
    }

    const compatibleOpenSessions = await tx.enterpriseCashSession.findMany({
      where: {
        organizationId: payment.organizationId,
        financialAccountId: payment.financialAccountId!,
        status: "OPEN",
      },
      orderBy: { openedAt: "desc" },
      take: 2,
    });
    if (compatibleOpenSessions.length === 1) return compatibleOpenSessions[0];
    if (compatibleOpenSessions.length > 1) throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_AMBIGUOUS", 409);
    return null;
  };

  if (payment.cashSessionId) {
    const linked = await tx.enterpriseCashSession.findFirst({
      where: {
        id: payment.cashSessionId,
        organizationId: payment.organizationId,
        financialAccountId: payment.financialAccountId,
      },
    });
    if (!linked) throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_INVALID", 409);
    if (linked.status === "OPEN") return linked;

    if (!isLegacyCashSessionBinding(payment)) {
      if (linked.status === "PENDING_VALIDATION") throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_PENDING_VALIDATION", 409);
      if (linked.status === "CLOSING") throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_CLOSING", 409);
      throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_CLOSED", 409);
    }

    const replacement = await findPreferredOpenReplacement();
    if (replacement) {
      await tx.enterprisePayment.update({
        where: { id: payment.id },
        data: { cashSessionId: replacement.id, revision: { increment: 1 } },
      });
      await addPaymentEvent(
        tx,
        payment.organizationId,
        payment.id,
        actorUserId,
        "CASH_SESSION_REBOUND",
        "Legacy cash session rebound before confirmation",
        {
          previousCashSessionId: linked.id,
          previousCashierUserId: linked.cashierUserId,
          cashSessionId: replacement.id,
          cashierUserId: replacement.cashierUserId,
          previousStatus: linked.status,
          legacyCutoverAt: CASH_SESSION_BINDING_CUTOVER_AT.toISOString(),
        },
      );
      return replacement;
    }

    if (linked.status === "PENDING_VALIDATION") throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_PENDING_VALIDATION", 409);
    if (linked.status === "CLOSING") throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_CLOSING", 409);
    throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_CLOSED", 409);
  }

  if (!isLegacyCashSessionBinding(payment)) {
    throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_BINDING_REQUIRED", 409);
  }

  const recovered = await findPreferredOpenReplacement();
  if (recovered) {
    await tx.enterprisePayment.update({
      where: { id: payment.id },
      data: { cashSessionId: recovered.id, revision: { increment: 1 } },
    });
    await addPaymentEvent(
      tx,
      payment.organizationId,
      payment.id,
      actorUserId,
      "CASH_SESSION_RECOVERED",
      "Historical cash session binding recovered before confirmation",
      {
        historicalInitiatorUserId: payment.initiatedByUserId,
        cashSessionId: recovered.id,
        cashierUserId: recovered.cashierUserId,
        legacyCutoverAt: CASH_SESSION_BINDING_CUTOVER_AT.toISOString(),
      },
    );
    return recovered;
  }

  const blocking = await tx.enterpriseCashSession.findFirst({
    where: {
      organizationId: payment.organizationId,
      financialAccountId: payment.financialAccountId,
      status: { in: ["PENDING_VALIDATION", "CLOSING"] },
    },
    orderBy: { openedAt: "desc" },
    select: { status: true },
  });
  if (blocking?.status === "PENDING_VALIDATION") throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_PENDING_VALIDATION", 409);
  if (blocking?.status === "CLOSING") throw new EnterpriseAccountingError("PAYMENT_CASH_SESSION_CLOSING", 409);
  throw new EnterpriseAccountingError("OPEN_CASH_SESSION_REQUIRED", 409);
}

export async function createEnterprisePayment(organizationId: string, actorUserId: string, input: PaymentInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.isPositive()) throw new EnterpriseAccountingError("PAYMENT_AMOUNT_INVALID", 400);
    if (["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CARD", "CHEQUE"].includes(input.methodType) && !input.financialAccountId) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_REQUIRED", 409);
    let cashSessionId: string | null = null;
    if (input.financialAccountId) {
      const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: input.financialAccountId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!account || account.currencyCode !== input.currencyCode) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_INVALID", 409);
      const expected = input.methodType === "CASH" ? "CASH" : input.methodType === "MOBILE_MONEY" ? "MOBILE_MONEY" : null;
      if (expected && account.accountType !== expected) throw new EnterpriseAccountingError("PAYMENT_METHOD_ACCOUNT_MISMATCH", 409);
      if (input.methodType === "CASH") {
        const cashSession = await tx.enterpriseCashSession.findFirst({
          where: {
            organizationId,
            financialAccountId: account.id,
            cashierUserId: actorUserId,
            status: "OPEN",
          },
          orderBy: { openedAt: "desc" },
          select: { id: true },
        });
        if (!cashSession) throw new EnterpriseAccountingError("OPEN_CASH_SESSION_REQUIRED", 409);
        cashSessionId = cashSession.id;
      }
    }
    if (input.businessPartyId && input.employeeId) throw new EnterpriseAccountingError("PAYMENT_COUNTERPARTY_AMBIGUOUS", 409);
    if (input.businessPartyId) {
      const party = await tx.enterpriseBusinessParty.findFirst({ where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!party) throw new EnterpriseAccountingError("PAYMENT_PARTY_INVALID", 409);
    }
    if (input.employeeId) {
      const employee = await tx.enterpriseEmployee.findFirst({ where: { id: input.employeeId, organizationId, employmentStatus: "ACTIVE", archivedAt: null }, select: { id: true } });
      if (!employee) throw new EnterpriseAccountingError("PAYMENT_EMPLOYEE_INVALID", 409);
    }

    if (input.paymentType === "PAYROLL_PAYMENT" && !input.payrollRunId) throw new EnterpriseAccountingError("PAYROLL_RUN_REQUIRED", 409);
    if (input.payrollRunId && input.paymentType !== "PAYROLL_PAYMENT") throw new EnterpriseAccountingError("PAYROLL_PAYMENT_TYPE_REQUIRED", 409);
    if (input.payrollRunId) {
      if (input.direction !== "OUTBOUND") throw new EnterpriseAccountingError("PAYROLL_PAYMENT_DIRECTION_INVALID", 409);
      if (input.businessPartyId || input.employeeId) throw new EnterpriseAccountingError("PAYROLL_PAYMENT_COUNTERPARTY_INVALID", 409);
      const payroll = await tx.enterprisePayrollRun.findFirst({ where: { id: input.payrollRunId, organizationId, status: "APPROVED", archivedAt: null }, select: { id: true, netAmount: true, currency: true } });
      if (!payroll) throw new EnterpriseAccountingError("PAYROLL_RUN_NOT_PAYABLE", 409);
      if (payroll.currency !== input.currencyCode) throw new EnterpriseAccountingError("PAYROLL_PAYMENT_CURRENCY_MISMATCH", 409);
      const activePayments = await tx.enterprisePayment.aggregate({
        where: { organizationId, payrollRunId: payroll.id, status: { notIn: ["CANCELLED", "REVERSED"] } },
        _sum: { amount: true },
      });
      const alreadyCommitted = activePayments._sum.amount || new Prisma.Decimal(0);
      if (alreadyCommitted.plus(amount).greaterThan(payroll.netAmount)) throw new EnterpriseAccountingError("PAYROLL_PAYMENT_EXCEEDS_REMAINING", 409);
    }

    const unallocatedAmount = input.paymentType === "PAYROLL_PAYMENT" ? new Prisma.Decimal(0) : amount;
    const payment = await tx.enterprisePayment.create({ data: { organizationId, number: financeReference("PAY"), direction: input.direction, paymentType: input.paymentType, methodType: input.methodType, paymentMethodId: input.paymentMethodId || null, financialAccountId: input.financialAccountId || null, cashSessionId, businessPartyId: input.businessPartyId || null, employeeId: input.employeeId || null, payrollRunId: input.payrollRunId || null, currencyCode: input.currencyCode, amount, unallocatedAmount, paymentDate: input.paymentDate, reference: input.reference || null, maskedExternalReference: input.maskedExternalReference || null, initiatedByUserId: actorUserId, idempotencyKey: input.idempotencyKey || null } });
    await addPaymentEvent(tx, organizationId, payment.id, actorUserId, "CREATED", "Payment created");
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: payment.id, eventType: "PAYMENT_CREATED", summary: `Payment ${payment.number} created`, actorUserId, toStatus: "DRAFT", metadataJson: { amount: amount.toFixed(), currency: payment.currencyCode, direction: payment.direction, payrollRunId: payment.payrollRunId, cashSessionId: payment.cashSessionId } });
    return payment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionEnterprisePayment(
  organizationId: string,
  paymentId: string,
  actorUserId: string,
  input: { action: "SUBMIT" | "APPROVE" | "CONFIRM" | "RECONCILE" | "CANCEL" | "REVERSE"; reason?: string; revision: number },
) {
  if (input.action === "CONFIRM") return confirmEnterprisePayment(organizationId, paymentId, actorUserId, input.revision);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const payment = await tx.enterprisePayment.findFirst({ where: { id: paymentId, organizationId } });
    if (!payment) throw new EnterpriseAccountingError("PAYMENT_NOT_FOUND", 404);
    if (payment.revision !== input.revision) throw new EnterpriseAccountingError("PAYMENT_REVISION_CONFLICT", 409, { currentRevision: payment.revision });
    const action = input.action as Exclude<typeof input.action, "CONFIRM">;
    const transition = {
      SUBMIT: { from: ["DRAFT"], to: "PENDING_APPROVAL" },
      APPROVE: { from: ["PENDING_APPROVAL"], to: "APPROVED" },
      RECONCILE: { from: ["CONFIRMED"], to: "RECONCILED" },
      CANCEL: { from: ["DRAFT", "PENDING_APPROVAL"], to: "CANCELLED" },
      REVERSE: { from: ["CONFIRMED", "RECONCILED"], to: "REVERSED" },
    }[action];
    if (!transition?.from.includes(payment.status)) throw new EnterpriseAccountingError("PAYMENT_TRANSITION_INVALID", 409);
    if (action === "APPROVE") assertIndependentActor({ actorUserId, relatedUserIds: [payment.initiatedByUserId], errorCode: "PAYMENT_SELF_APPROVAL_FORBIDDEN" });
    if (action === "REVERSE") {
      assertIndependentActor({
        actorUserId,
        relatedUserIds: [payment.initiatedByUserId, payment.approvedByUserId, payment.confirmedByUserId],
        errorCode: "PAYMENT_SELF_REVERSAL_FORBIDDEN",
      });
      const allocations = await tx.enterprisePaymentAllocation.count({ where: { organizationId, paymentId, status: "CONFIRMED" } });
      if (allocations > 0) throw new EnterpriseAccountingError("PAYMENT_ALLOCATIONS_MUST_BE_REVERSED_FIRST", 409);
      if (!payment.financialAccountId) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_REQUIRED", 409);
      const account = await tx.enterpriseFinancialAccount.findFirst({
        where: { id: payment.financialAccountId, organizationId },
      });
      if (!account || account.currencyCode !== payment.currencyCode) {
        throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_INVALID", 409);
      }
      const confirmedTreasuryRows = await tx.enterpriseTreasuryTransaction.findMany({
        where: { organizationId, paymentId, status: "CONFIRMED" },
        select: { id: true, financialAccountId: true, currencyCode: true, direction: true, amount: true },
        take: 2,
      });
      if (!confirmedTreasuryRows.length) throw new EnterpriseAccountingError("PAYMENT_TREASURY_TRANSACTION_MISSING", 409);
      const treasuryRow = confirmedTreasuryRows[0];
      if (
        confirmedTreasuryRows.length !== 1
        || treasuryRow.financialAccountId !== payment.financialAccountId
        || treasuryRow.currencyCode !== payment.currencyCode
        || treasuryRow.direction !== payment.direction
        || !treasuryRow.amount.equals(payment.amount)
      ) {
        throw new EnterpriseAccountingError("PAYMENT_TREASURY_TRANSACTION_INCONSISTENT", 409, { count: confirmedTreasuryRows.length });
      }

      const originalSignedAmount = payment.direction === "INBOUND" ? payment.amount : payment.amount.negated();
      await tx.enterpriseTreasuryTransaction.updateMany({
        where: { organizationId, paymentId, status: "CONFIRMED" },
        data: { status: "REVERSED", reversedAt: new Date() },
      });
      await tx.enterpriseFinancialAccount.update({
        where: { id: account.id },
        data: { operationalBalance: { increment: originalSignedAmount.negated() }, revision: { increment: 1 } },
      });

      if (payment.methodType === "CASH") {
        const movements = await tx.enterpriseCashMovement.findMany({
          where: { organizationId, paymentId },
          orderBy: { createdAt: "asc" },
        });
        const reversalAlreadyExists = movements.some((movement) => movement.movementType.endsWith("_REVERSAL"));
        const originalMovements = movements.filter((item) => !item.movementType.endsWith("_REVERSAL"));
        if (!reversalAlreadyExists && originalMovements.length !== 1) {
          throw new EnterpriseAccountingError("PAYMENT_CASH_MOVEMENT_INCONSISTENT", 409, { count: originalMovements.length });
        }
        if (!reversalAlreadyExists) {
          for (const movement of originalMovements) {
            await tx.enterpriseCashMovement.create({
              data: {
                organizationId,
                cashSessionId: movement.cashSessionId,
                paymentId: payment.id,
                movementType: `${movement.movementType}_REVERSAL`,
                direction: movement.direction === "INBOUND" ? "OUTBOUND" : "INBOUND",
                amount: movement.amount,
                currencyCode: movement.currencyCode,
                reference: movement.reference,
                reason: input.reason || "Payment reversal",
                createdByUserId: actorUserId,
              },
            });
          }
        }
      }

      const journals = await tx.enterpriseJournalEntry.findMany({
        where: {
          organizationId,
          sourceEntityType: "EnterprisePayment",
          sourceEntityId: payment.id,
          status: "POSTED",
        },
        select: { id: true },
        take: 2,
      });
      if (journals.length > 1) {
        throw new EnterpriseAccountingError("PAYMENT_JOURNAL_INCONSISTENT", 409, { count: journals.length });
      }
      const journal = journals[0] || null;
      if (journal) {
        await reverseJournalEntryTx(
          tx,
          organizationId,
          journal.id,
          actorUserId,
          { reason: input.reason || "Payment reversal", accountingDate: new Date() },
          { authorization: "DOMAIN_INVERSE" },
        );
      }
    }
    const updated = await tx.enterprisePayment.update({ where: { id: payment.id }, data: { status: transition.to, approvedByUserId: action === "APPROVE" ? actorUserId : payment.approvedByUserId, reconciledAt: action === "RECONCILE" ? new Date() : payment.reconciledAt, reversedAt: action === "REVERSE" ? new Date() : payment.reversedAt, reversalReason: action === "REVERSE" ? input.reason || null : payment.reversalReason, revision: { increment: 1 } } });
    await addPaymentEvent(tx, organizationId, payment.id, actorUserId, action, `Payment ${action}`, input.reason ? { reason: input.reason.slice(0, 500) } : undefined);
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: payment.id, eventType: `PAYMENT_${action}`, summary: `Payment ${payment.number}: ${action}`, actorUserId, fromStatus: payment.status, toStatus: transition.to, metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function confirmEnterprisePayment(organizationId: string, paymentId: string, actorUserId: string, revision: number) {
  const confirmed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const payment = await tx.enterprisePayment.findFirst({ where: { id: paymentId, organizationId } });
    if (!payment) throw new EnterpriseAccountingError("PAYMENT_NOT_FOUND", 404);
    if (["CONFIRMED", "RECONCILED"].includes(payment.status)) return payment;
    if (payment.status !== "APPROVED" || payment.revision !== revision) throw new EnterpriseAccountingError("PAYMENT_NOT_APPROVED", 409);
    assertIndependentActor({ actorUserId, relatedUserIds: [payment.initiatedByUserId, payment.approvedByUserId], errorCode: "PAYMENT_SELF_CONFIRMATION_FORBIDDEN" });
    if (!payment.financialAccountId) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_REQUIRED", 409);
    const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: payment.financialAccountId, organizationId, status: "ACTIVE", archivedAt: null } });
    if (!account || account.currencyCode !== payment.currencyCode) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_INVALID", 409);
    let confirmedCashSessionId: string | null = null;
    if (payment.methodType === "CASH") {
      const cashSession = await resolveCashSessionForConfirmation(tx, payment, actorUserId);
      confirmedCashSessionId = cashSession.id;
      await tx.enterpriseCashMovement.create({ data: { organizationId, cashSessionId: cashSession.id, paymentId: payment.id, movementType: payment.paymentType, direction: payment.direction, amount: payment.amount, currencyCode: payment.currencyCode, reference: payment.reference, createdByUserId: actorUserId } });
    }
    const signed = payment.direction === "INBOUND" ? payment.amount : payment.amount.negated();
    await tx.enterpriseTreasuryTransaction.create({ data: { organizationId, financialAccountId: account.id, paymentId: payment.id, transactionType: payment.paymentType, direction: payment.direction, currencyCode: payment.currencyCode, amount: payment.amount, transactionDate: payment.paymentDate, reference: payment.reference || payment.number, createdByUserId: actorUserId } });
    await tx.enterpriseFinancialAccount.update({ where: { id: account.id }, data: { operationalBalance: { increment: signed }, revision: { increment: 1 } } });
    const updated = await tx.enterprisePayment.update({ where: { id: payment.id }, data: { status: "CONFIRMED", cashSessionId: confirmedCashSessionId || payment.cashSessionId, confirmedByUserId: actorUserId, confirmedAt: new Date(), revision: { increment: 1 } } });
    await addPaymentEvent(tx, organizationId, payment.id, actorUserId, "CONFIRMED", "Payment confirmed");
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: payment.id, eventType: "PAYMENT_CONFIRMED", summary: `Payment ${payment.number} confirmed`, actorUserId, fromStatus: payment.status, toStatus: "CONFIRMED", metadataJson: { financialAccountId: account.id, cashSessionId: confirmedCashSessionId || payment.cashSessionId, amount: payment.amount.toFixed(), currency: payment.currencyCode } });
    const postingEvent = paymentPostingEvent(updated.paymentType);
    if (postingEvent) {
      await postBusinessEventTx(tx, organizationId, actorUserId, {
        postingEvent,
        sourceEntityType: "EnterprisePayment",
        sourceEntityId: updated.id,
      });
    }
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  return confirmed;
}

export async function allocateEnterprisePayment(
  organizationId: string,
  paymentId: string,
  actorUserId: string,
  input: { receivableId?: string; payableId?: string; amount: string },
) {
  const allocation = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const payment = await tx.enterprisePayment.findFirst({ where: { id: paymentId, organizationId } });
    if (!payment || !["CONFIRMED", "RECONCILED"].includes(payment.status)) throw new EnterpriseAccountingError("PAYMENT_NOT_ALLOCATABLE", 409);
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.isPositive() || amount.greaterThan(payment.unallocatedAmount)) throw new EnterpriseAccountingError("PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED", 409);
    let receivable: Awaited<ReturnType<typeof tx.enterpriseReceivable.findFirst>> = null;
    let payable: Awaited<ReturnType<typeof tx.enterprisePayable.findFirst>> = null;
    if (input.receivableId) {
      receivable = await tx.enterpriseReceivable.findFirst({ where: { id: input.receivableId, organizationId, status: "OPEN" } });
      if (!receivable || payment.direction !== "INBOUND" || payment.paymentType !== "CUSTOMER_PAYMENT") throw new EnterpriseAccountingError("RECEIVABLE_ALLOCATION_INVALID", 409);
      if (payment.businessPartyId !== receivable.businessPartyId || payment.currencyCode !== receivable.currencyCode || amount.greaterThan(receivable.outstandingAmount)) throw new EnterpriseAccountingError("RECEIVABLE_ALLOCATION_SCOPE_OR_AMOUNT_INVALID", 409);
    } else if (input.payableId) {
      payable = await tx.enterprisePayable.findFirst({ where: { id: input.payableId, organizationId, status: "OPEN" } });
      if (!payable || payment.direction !== "OUTBOUND" || payment.paymentType !== "SUPPLIER_PAYMENT") throw new EnterpriseAccountingError("PAYABLE_ALLOCATION_INVALID", 409);
      if ((payment.businessPartyId && payment.businessPartyId !== payable.businessPartyId) || payment.currencyCode !== payable.currencyCode || amount.greaterThan(payable.outstandingAmount)) throw new EnterpriseAccountingError("PAYABLE_ALLOCATION_SCOPE_OR_AMOUNT_INVALID", 409);
    } else {
      throw new EnterpriseAccountingError("PAYMENT_ALLOCATION_TARGET_REQUIRED", 400);
    }
    const created = await tx.enterprisePaymentAllocation.create({ data: { organizationId, paymentId: payment.id, receivableId: receivable?.id || null, payableId: payable?.id || null, amount, allocatedByUserId: actorUserId } });
    await tx.enterprisePayment.update({ where: { id: payment.id }, data: { unallocatedAmount: money(payment.unallocatedAmount.minus(amount)), revision: { increment: 1 } } });
    if (receivable) {
      const outstanding = money(receivable.outstandingAmount.minus(amount));
      await tx.enterpriseReceivable.update({ where: { id: receivable.id }, data: { allocatedAmount: { increment: amount }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CLOSED" : "OPEN" } });
      await tx.enterpriseSalesInvoice.update({ where: { id: receivable.salesInvoiceId }, data: { amountPaid: { increment: amount }, outstandingAmount: outstanding, status: outstanding.isZero() ? "PAID" : "PARTIALLY_PAID", revision: { increment: 1 } } });
      await tx.enterpriseReceivableAllocation.create({ data: { organizationId, receivableId: receivable.id, sourceType: "PAYMENT", sourceId: created.id, amount, allocationDate: new Date(), createdByUserId: actorUserId } });
    }
    if (payable) {
      const outstanding = money(payable.outstandingAmount.minus(amount));
      await tx.enterprisePayable.update({ where: { id: payable.id }, data: { allocatedAmount: { increment: amount }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CLOSED" : "OPEN" } });
      await tx.enterpriseSupplierInvoice.update({ where: { id: payable.supplierInvoiceId }, data: { amountPaid: { increment: amount }, outstandingAmount: outstanding, status: outstanding.isZero() ? "PAID" : "PARTIALLY_PAID", revision: { increment: 1 } } });
      await tx.enterprisePayableAllocation.create({ data: { organizationId, payableId: payable.id, sourceType: "PAYMENT", sourceId: created.id, amount, allocationDate: new Date(), createdByUserId: actorUserId } });
    }
    await addPaymentEvent(tx, organizationId, payment.id, actorUserId, "ALLOCATED", "Payment allocation confirmed", { allocationId: created.id, amount: amount.toFixed(), receivableId: receivable?.id || null, payableId: payable?.id || null });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: payment.id, eventType: "PAYMENT_ALLOCATED", summary: `Payment ${payment.number} allocated`, actorUserId, metadataJson: { allocationId: created.id, amount: amount.toFixed(), receivableId: receivable?.id || null, payableId: payable?.id || null } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await postBusinessEvent(organizationId, actorUserId, { postingEvent: "PAYMENT_ALLOCATION_CONFIRMED", sourceEntityType: "EnterprisePaymentAllocation", sourceEntityId: allocation.id });
  return allocation;
}

export async function listPayments(organizationId: string, input: { page: number; pageSize: number; search?: string; status?: string }) {
  const where: Prisma.EnterprisePaymentWhereInput = { organizationId, ...(input.status ? { status: input.status } : {}), ...(input.search ? { OR: [{ number: { contains: input.search, mode: "insensitive" } }, { reference: { contains: input.search, mode: "insensitive" } }] } : {}) };
  const [items, total, inbound, outbound, unallocated] = await Promise.all([
    prisma.enterprisePayment.findMany({ where, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize, include: { _count: { select: { allocations: true, events: true } } } }),
    prisma.enterprisePayment.count({ where }),
    prisma.enterprisePayment.aggregate({ where: { organizationId, status: { in: ["CONFIRMED", "RECONCILED"] }, direction: "INBOUND" }, _sum: { amount: true } }),
    prisma.enterprisePayment.aggregate({ where: { organizationId, status: { in: ["CONFIRMED", "RECONCILED"] }, direction: "OUTBOUND" }, _sum: { amount: true } }),
    prisma.enterprisePayment.aggregate({ where: { organizationId, status: { in: ["CONFIRMED", "RECONCILED"] } }, _sum: { unallocatedAmount: true } }),
  ]);
  return { items, pagination: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) }, metrics: { inbound: inbound._sum.amount || new Prisma.Decimal(0), outbound: outbound._sum.amount || new Prisma.Decimal(0), unallocated: unallocated._sum.unallocatedAmount || new Prisma.Decimal(0) } };
}
