import { Prisma } from "@prisma/client";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import { reverseJournalEntryTx } from "@/lib/enterprise/accounting/reversal-service";
import { prisma } from "@/lib/prisma";

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

export async function reverseCustomerPaymentAllocationsForRefund(
  organizationId: string,
  receivableId: string,
  actorUserId: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseReceivable" WHERE id = ${receivableId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const receivable = await tx.enterpriseReceivable.findFirst({
      where: { id: receivableId, organizationId },
      include: { salesInvoice: true, paymentAllocations: { where: { status: "CONFIRMED" }, include: { payment: true } } },
    });
    if (!receivable) throw new EnterpriseAccountingError("RECEIVABLE_NOT_FOUND", 404);
    if (!receivable.paymentAllocations.length) return { reversedAmount: money(0), paymentIds: [] as string[], idempotent: true };

    let reversedAmount = money(0);
    const paymentIds: string[] = [];
    for (const allocation of receivable.paymentAllocations) {
      if (allocation.payment.direction !== "INBOUND" || allocation.payment.paymentType !== "CUSTOMER_PAYMENT") {
        throw new EnterpriseAccountingError("REFUND_ALLOCATION_NOT_CUSTOMER_PAYMENT", 409);
      }
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${allocation.paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const changed = await tx.enterprisePaymentAllocation.updateMany({
        where: { id: allocation.id, organizationId, status: "CONFIRMED" },
        data: { status: "REVERSED", reversedAt: new Date() },
      });
      if (changed.count !== 1) throw new EnterpriseAccountingError("PAYMENT_ALLOCATION_REVERSAL_CONFLICT", 409);
      await tx.enterpriseReceivableAllocation.updateMany({
        where: { organizationId, receivableId, sourceType: "PAYMENT", sourceId: allocation.id, status: "CONFIRMED" },
        data: { status: "REVERSED", reversedAt: new Date() },
      });
      await tx.enterprisePayment.update({
        where: { id: allocation.paymentId },
        data: { unallocatedAmount: { increment: allocation.amount }, revision: { increment: 1 } },
      });
      const journal = await tx.enterpriseJournalEntry.findFirst({
        where: { organizationId, sourceEntityType: "EnterprisePaymentAllocation", sourceEntityId: allocation.id, status: "POSTED" },
        select: { id: true },
      });
      if (journal) {
        await reverseJournalEntryTx(tx, organizationId, journal.id, actorUserId, { reason, accountingDate: new Date() }, { authorization: "DOMAIN_INVERSE" });
      }
      reversedAmount = money(reversedAmount.plus(allocation.amount));
      paymentIds.push(allocation.paymentId);
      await tx.enterprisePaymentEvent.create({
        data: { organizationId, paymentId: allocation.paymentId, eventType: "ALLOCATION_REVERSED_FOR_REFUND", summary: "Payment allocation reversed for customer refund", actorUserId, metadataJson: { allocationId: allocation.id, receivableId, amount: allocation.amount.toFixed(), reason: reason.slice(0, 500) } },
      });
    }

    const nextAllocated = money(Prisma.Decimal.max(0, receivable.allocatedAmount.minus(reversedAmount)));
    const nextOutstanding = money(receivable.outstandingAmount.plus(reversedAmount));
    const nextPaid = money(Prisma.Decimal.max(0, receivable.salesInvoice.amountPaid.minus(reversedAmount)));
    await tx.enterpriseReceivable.update({
      where: { id: receivable.id },
      data: { allocatedAmount: nextAllocated, outstandingAmount: nextOutstanding, status: "OPEN" },
    });
    await tx.enterpriseSalesInvoice.update({
      where: { id: receivable.salesInvoiceId },
      data: { amountPaid: nextPaid, outstandingAmount: nextOutstanding, status: nextPaid.isZero() ? "ISSUED" : "PARTIALLY_PAID", revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseReceivable",
      entityId: receivable.id,
      eventType: "CUSTOMER_PAYMENT_ALLOCATIONS_REVERSED_FOR_REFUND",
      summary: `Customer payment allocations reversed for ${receivable.salesInvoice.number}`,
      actorUserId,
      metadataJson: { amount: reversedAmount.toFixed(), paymentIds, reason: reason.slice(0, 500) },
    });
    return { reversedAmount, paymentIds, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function confirmCustomerRefundPayment(
  organizationId: string,
  paymentId: string,
  actorUserId: string,
  input: { revision: number; reason: string },
) {
  const payment = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterprisePayment.findFirst({ where: { id: paymentId, organizationId } });
    if (!current) throw new EnterpriseAccountingError("PAYMENT_NOT_FOUND", 404);
    if (["CONFIRMED", "RECONCILED"].includes(current.status)) return current;
    if (current.status !== "APPROVED" || current.revision !== input.revision) throw new EnterpriseAccountingError("REFUND_PAYMENT_NOT_APPROVED", 409);
    if (current.paymentType !== "REFUND" || current.direction !== "OUTBOUND" || !current.financialAccountId) throw new EnterpriseAccountingError("REFUND_PAYMENT_INVALID", 409);
    assertIndependentActor({ actorUserId, relatedUserIds: [current.initiatedByUserId], errorCode: "REFUND_PAYMENT_SELF_CONFIRMATION_FORBIDDEN" });

    const account = await tx.enterpriseFinancialAccount.findFirst({
      where: { id: current.financialAccountId, organizationId, status: "ACTIVE", archivedAt: null },
    });
    if (!account || account.currencyCode !== current.currencyCode) throw new EnterpriseAccountingError("REFUND_FINANCIAL_ACCOUNT_INVALID", 409);
    if (current.methodType === "CASH" && account.accountType !== "CASH") throw new EnterpriseAccountingError("PAYMENT_CASH_ACCOUNT_REQUIRED", 409);
    if (current.methodType === "MOBILE_MONEY" && account.accountType !== "MOBILE_MONEY") throw new EnterpriseAccountingError("PAYMENT_MOBILE_MONEY_ACCOUNT_REQUIRED", 409);

    let cashSessionId: string | null = null;
    if (current.methodType === "CASH") {
      const cashSession = await tx.enterpriseCashSession.findFirst({
        where: { organizationId, financialAccountId: account.id, cashierUserId: current.initiatedByUserId, status: "OPEN" },
        select: { id: true },
      });
      if (!cashSession) throw new EnterpriseAccountingError("OPEN_CASH_SESSION_REQUIRED", 409);
      cashSessionId = cashSession.id;
    }

    await tx.enterpriseTreasuryTransaction.create({
      data: { organizationId, financialAccountId: account.id, paymentId: current.id, transactionType: "CUSTOMER_REFUND", direction: "OUTBOUND", currencyCode: current.currencyCode, amount: current.amount, transactionDate: current.paymentDate, reference: current.reference, createdByUserId: actorUserId },
    });
    if (cashSessionId) {
      await tx.enterpriseCashMovement.create({
        data: { organizationId, cashSessionId, paymentId: current.id, movementType: "CUSTOMER_REFUND", direction: "OUTBOUND", amount: current.amount, currencyCode: current.currencyCode, reference: current.reference, reason: input.reason, createdByUserId: actorUserId },
      });
    }
    await tx.enterpriseFinancialAccount.update({ where: { id: account.id }, data: { operationalBalance: { decrement: current.amount }, revision: { increment: 1 } } });
    const confirmed = await tx.enterprisePayment.update({ where: { id: current.id }, data: { status: "CONFIRMED", confirmedByUserId: actorUserId, confirmedAt: new Date(), revision: { increment: 1 } } });
    await tx.enterprisePaymentEvent.create({ data: { organizationId, paymentId: current.id, eventType: "CONFIRM_REFUND", summary: "Customer refund confirmed", actorUserId, metadataJson: { reason: input.reason.slice(0, 500), financialAccountId: account.id, cashSessionId } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: current.id, eventType: "CUSTOMER_REFUND_CONFIRMED", summary: `Customer refund ${current.number} confirmed`, actorUserId, fromStatus: "APPROVED", toStatus: "CONFIRMED", metadataJson: { amount: current.amount.toFixed(), currency: current.currencyCode, financialAccountId: account.id } });
    return confirmed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });

  await postBusinessEvent(organizationId, actorUserId, { postingEvent: "CUSTOMER_REFUND_CONFIRMED", sourceEntityType: "EnterprisePayment", sourceEntityId: payment.id });
  return payment;
}
