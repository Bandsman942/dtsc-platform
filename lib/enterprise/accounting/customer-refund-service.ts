import { Prisma } from "@prisma/client";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
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
        await reverseJournalEntryTx(
          tx,
          organizationId,
          journal.id,
          actorUserId,
          { reason, accountingDate: new Date() },
          { authorization: "DOMAIN_INVERSE" },
        );
      }
      reversedAmount = money(reversedAmount.plus(allocation.amount));
      paymentIds.push(allocation.paymentId);
      await tx.enterprisePaymentEvent.create({
        data: {
          organizationId,
          paymentId: allocation.paymentId,
          eventType: "ALLOCATION_REVERSED_FOR_REFUND",
          summary: "Payment allocation reversed for customer refund",
          actorUserId,
          metadataJson: {
            allocationId: allocation.id,
            receivableId,
            amount: allocation.amount.toFixed(),
            reason: reason.slice(0, 500),
          },
        },
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
      data: {
        amountPaid: nextPaid,
        outstandingAmount: nextOutstanding,
        status: nextPaid.isZero() ? "ISSUED" : "PARTIALLY_PAID",
        revision: { increment: 1 },
      },
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

export async function reverseCustomerPaymentAllocationsForRefundAmount(
  organizationId: string,
  receivableId: string,
  refundPaymentId: string,
  actorUserId: string,
  reason: string,
  requestedAmount: Prisma.Decimal.Value,
  preferredPaymentId?: string | null,
) {
  const amount = money(requestedAmount);
  if (!amount.isPositive()) throw new EnterpriseAccountingError("REFUND_AMOUNT_INVALID", 400);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${refundPaymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const refundPayment = await tx.enterprisePayment.findFirst({
      where: { id: refundPaymentId, organizationId, paymentType: "REFUND", direction: "OUTBOUND" },
    });
    if (!refundPayment) throw new EnterpriseAccountingError("REFUND_PAYMENT_INVALID", 409);
    if (!refundPayment.amount.equals(amount)) throw new EnterpriseAccountingError("REFUND_PAYMENT_AMOUNT_MISMATCH", 409);

    const alreadyReversed = await tx.enterprisePaymentEvent.findFirst({
      where: { organizationId, paymentId: refundPayment.id, eventType: "REFUND_ALLOCATIONS_REVERSED" },
      select: { id: true },
    });
    if (alreadyReversed) {
      return { reversedAmount: amount, paymentIds: [] as string[], idempotent: true };
    }

    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseReceivable" WHERE id = ${receivableId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const receivable = await tx.enterpriseReceivable.findFirst({
      where: { id: receivableId, organizationId },
      include: { salesInvoice: true },
    });
    if (!receivable) throw new EnterpriseAccountingError("RECEIVABLE_NOT_FOUND", 404);

    const allocations = await tx.enterprisePaymentAllocation.findMany({
      where: { organizationId, receivableId, status: "CONFIRMED" },
      include: { payment: true },
      orderBy: [{ allocatedAt: "asc" }, { id: "asc" }],
    });
    const eligible = allocations.filter((allocation) =>
      allocation.payment.direction === "INBOUND"
      && allocation.payment.paymentType === "CUSTOMER_PAYMENT"
      && ["CONFIRMED", "RECONCILED"].includes(allocation.payment.status)
    );
    eligible.sort((left, right) => {
      if (!preferredPaymentId) return 0;
      if (left.paymentId === preferredPaymentId && right.paymentId !== preferredPaymentId) return -1;
      if (right.paymentId === preferredPaymentId && left.paymentId !== preferredPaymentId) return 1;
      return 0;
    });

    const available = money(eligible.reduce((total, allocation) => total.plus(allocation.amount), new Prisma.Decimal(0)));
    if (amount.greaterThan(available)) {
      throw new EnterpriseAccountingError("REFUND_EXCEEDS_CONFIRMED_ALLOCATIONS", 409, {
        requestedAmount: amount.toFixed(),
        availableAmount: available.toFixed(),
      });
    }

    let remaining = amount;
    const paymentIds: string[] = [];
    for (const allocation of eligible) {
      if (remaining.isZero()) break;
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${allocation.paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const reversalAmount = money(Prisma.Decimal.min(allocation.amount, remaining));
      const nextAllocationAmount = money(allocation.amount.minus(reversalAmount));
      const journal = await tx.enterpriseJournalEntry.findFirst({
        where: {
          organizationId,
          sourceEntityType: "EnterprisePaymentAllocation",
          sourceEntityId: allocation.id,
          status: "POSTED",
        },
        orderBy: { postingVersion: "desc" },
        select: { id: true, postingVersion: true },
      });
      if (journal) {
        await reverseJournalEntryTx(
          tx,
          organizationId,
          journal.id,
          actorUserId,
          { reason, accountingDate: new Date() },
          { authorization: "DOMAIN_INVERSE" },
        );
      }

      if (nextAllocationAmount.isZero()) {
        const changed = await tx.enterprisePaymentAllocation.updateMany({
          where: { id: allocation.id, organizationId, status: "CONFIRMED" },
          data: { status: "REVERSED", reversedAt: new Date() },
        });
        if (changed.count !== 1) throw new EnterpriseAccountingError("PAYMENT_ALLOCATION_REVERSAL_CONFLICT", 409);
        await tx.enterpriseReceivableAllocation.updateMany({
          where: { organizationId, receivableId, sourceType: "PAYMENT", sourceId: allocation.id, status: "CONFIRMED" },
          data: { status: "REVERSED", reversedAt: new Date() },
        });
      } else {
        await tx.enterprisePaymentAllocation.update({
          where: { id: allocation.id },
          data: { amount: nextAllocationAmount },
        });
        await tx.enterpriseReceivableAllocation.updateMany({
          where: { organizationId, receivableId, sourceType: "PAYMENT", sourceId: allocation.id, status: "CONFIRMED" },
          data: { amount: nextAllocationAmount },
        });
        await postBusinessEventTx(tx, organizationId, actorUserId, {
          postingEvent: "PAYMENT_ALLOCATION_CONFIRMED",
          sourceEntityType: "EnterprisePaymentAllocation",
          sourceEntityId: allocation.id,
          postingVersion: (journal?.postingVersion || 0) + 1,
        });
      }

      await tx.enterprisePayment.update({
        where: { id: allocation.paymentId },
        data: { unallocatedAmount: { increment: reversalAmount }, revision: { increment: 1 } },
      });
      await tx.enterprisePaymentEvent.create({
        data: {
          organizationId,
          paymentId: allocation.paymentId,
          eventType: "ALLOCATION_PARTIALLY_REVERSED_FOR_REFUND",
          summary: "Payment allocation reduced for customer refund",
          actorUserId,
          metadataJson: {
            allocationId: allocation.id,
            receivableId,
            amount: reversalAmount.toFixed(),
            remainingAllocationAmount: nextAllocationAmount.toFixed(),
            reason: reason.slice(0, 500),
          },
        },
      });
      if (!paymentIds.includes(allocation.paymentId)) paymentIds.push(allocation.paymentId);
      remaining = money(remaining.minus(reversalAmount));
    }

    if (!remaining.isZero()) throw new EnterpriseAccountingError("REFUND_ALLOCATION_REVERSAL_INCOMPLETE", 409);

    const nextAllocated = money(Prisma.Decimal.max(0, receivable.allocatedAmount.minus(amount)));
    const nextOutstanding = money(receivable.outstandingAmount.plus(amount));
    const nextPaid = money(Prisma.Decimal.max(0, receivable.salesInvoice.amountPaid.minus(amount)));
    await tx.enterpriseReceivable.update({
      where: { id: receivable.id },
      data: { allocatedAmount: nextAllocated, outstandingAmount: nextOutstanding, status: "OPEN" },
    });
    await tx.enterpriseSalesInvoice.update({
      where: { id: receivable.salesInvoiceId },
      data: {
        amountPaid: nextPaid,
        outstandingAmount: nextOutstanding,
        status: nextPaid.isZero() ? "ISSUED" : "PARTIALLY_PAID",
        revision: { increment: 1 },
      },
    });
    await tx.enterprisePaymentEvent.create({
      data: {
        organizationId,
        paymentId: refundPayment.id,
        eventType: "REFUND_ALLOCATIONS_REVERSED",
        summary: "Customer allocations reversed for bounded refund",
        actorUserId,
        metadataJson: { receivableId, amount: amount.toFixed(), paymentIds, reason: reason.slice(0, 500) },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseReceivable",
      entityId: receivable.id,
      eventType: "CUSTOMER_PAYMENT_ALLOCATIONS_REVERSED_FOR_REFUND",
      summary: `Customer payment allocations reduced for ${receivable.salesInvoice.number}`,
      actorUserId,
      metadataJson: { amount: amount.toFixed(), paymentIds, refundPaymentId, reason: reason.slice(0, 500) },
    });
    return { reversedAmount: amount, paymentIds, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function prepareSalesCreditNoteForRefundAmount(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  reason: string,
  requestedAmount: Prisma.Decimal.Value,
) {
  const amount = money(requestedAmount);
  if (!amount.isPositive()) throw new EnterpriseAccountingError("REFUND_AMOUNT_INVALID", 400);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSalesInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { items: true, creditNotes: true },
    });
    if (!invoice || !["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CREDIT_NOTE"].includes(invoice.status)) {
      throw new EnterpriseAccountingError("SALES_INVOICE_NOT_CREDITABLE", 409);
    }
    const existing = invoice.creditNotes.find((credit) => credit.reason === reason);
    if (existing) {
      if (!existing.grandTotal.equals(amount)) throw new EnterpriseAccountingError("REFUND_CREDIT_NOTE_AMOUNT_MISMATCH", 409);
      return existing;
    }

    const committedCredit = money(invoice.creditNotes
      .filter((credit) => !["CANCELLED", "REJECTED"].includes(credit.status))
      .reduce((total, credit) => total.plus(credit.grandTotal), new Prisma.Decimal(0)));
    const creditable = money(Prisma.Decimal.max(0, invoice.grandTotal.minus(committedCredit)));
    if (amount.greaterThan(creditable)) {
      throw new EnterpriseAccountingError("CREDIT_NOTE_EXCEEDS_REFUNDABLE_INVOICE", 409, {
        requestedAmount: amount.toFixed(),
        creditableAmount: creditable.toFixed(),
      });
    }

    const fullExact = amount.equals(invoice.grandTotal) && committedCredit.isZero();
    let subtotal: Prisma.Decimal;
    let taxTotal: Prisma.Decimal;
    let items: Array<{ description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal }>;
    if (fullExact) {
      subtotal = money(invoice.items.reduce((total, item) => total.plus(item.netAmount), new Prisma.Decimal(0)));
      taxTotal = money(invoice.items.reduce((total, item) => total.plus(item.taxAmount), new Prisma.Decimal(0)));
      const exactTotal = money(invoice.items.reduce((total, item) => total.plus(item.totalAmount), new Prisma.Decimal(0)));
      if (!exactTotal.equals(amount)) throw new EnterpriseAccountingError("REFUND_HISTORICAL_TOTAL_MISMATCH", 409);
      items = invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        netAmount: item.netAmount,
        taxAmount: item.taxAmount,
        totalAmount: item.totalAmount,
      }));
    } else {
      const ratio = amount.dividedBy(invoice.grandTotal);
      taxTotal = money(invoice.taxTotal.times(ratio));
      subtotal = money(amount.minus(taxTotal));
      items = [{
        description: `Remboursement partiel — ${invoice.number}`,
        quantity: new Prisma.Decimal(1),
        unitPrice: subtotal,
        netAmount: subtotal,
        taxAmount: taxTotal,
        totalAmount: amount,
      }];
    }

    const credit = await tx.enterpriseSalesCreditNote.create({
      data: {
        organizationId,
        number: financeReference("CN"),
        salesInvoiceId: invoice.id,
        reason,
        creditDate: new Date(),
        currencyCode: invoice.currencyCode,
        subtotal,
        taxTotal,
        grandTotal: amount,
        createdByUserId: actorUserId,
        items: { create: items.map((item) => ({ organizationId, ...item })) },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesCreditNote",
      entityId: credit.id,
      eventType: "SALES_CREDIT_NOTE_CREATED",
      summary: `Credit note ${credit.number} prepared for bounded customer refund`,
      actorUserId,
      toStatus: "DRAFT",
      metadataJson: { invoiceId: invoice.id, amount: amount.toFixed(), currency: invoice.currencyCode, source: "PHARMACY_REFUND" },
    });
    return credit;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function createExactSalesCreditNoteForRefund(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSalesInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { items: true, receivable: true },
    });
    if (!invoice?.receivable) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_CREDITABLE", 409);
    if (!["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"].includes(invoice.status)) {
      throw new EnterpriseAccountingError("SALES_INVOICE_NOT_CREDITABLE", 409);
    }
    const existing = await tx.enterpriseSalesCreditNote.findFirst({
      where: { organizationId, salesInvoiceId: invoice.id, reason },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    const subtotal = money(invoice.items.reduce((total, item) => total.plus(item.netAmount), new Prisma.Decimal(0)));
    const taxTotal = money(invoice.items.reduce((total, item) => total.plus(item.taxAmount), new Prisma.Decimal(0)));
    const grandTotal = money(invoice.items.reduce((total, item) => total.plus(item.totalAmount), new Prisma.Decimal(0)));
    if (!grandTotal.equals(invoice.grandTotal)) {
      throw new EnterpriseAccountingError("REFUND_HISTORICAL_TOTAL_MISMATCH", 409, {
        invoiceTotal: invoice.grandTotal.toFixed(),
        lineTotal: grandTotal.toFixed(),
      });
    }
    if (grandTotal.greaterThan(invoice.receivable.outstandingAmount)) {
      throw new EnterpriseAccountingError("CREDIT_NOTE_EXCEEDS_OPEN_RECEIVABLE", 409);
    }

    const credit = await tx.enterpriseSalesCreditNote.create({
      data: {
        organizationId,
        number: financeReference("CN"),
        salesInvoiceId: invoice.id,
        reason,
        creditDate: new Date(),
        currencyCode: invoice.currencyCode,
        subtotal,
        taxTotal,
        grandTotal,
        createdByUserId: actorUserId,
        items: {
          create: invoice.items.map((item) => ({
            organizationId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            netAmount: item.netAmount,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          })),
        },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesCreditNote",
      entityId: credit.id,
      eventType: "SALES_CREDIT_NOTE_CREATED",
      summary: `Credit note ${credit.number} created from historical invoice amounts`,
      actorUserId,
      toStatus: "DRAFT",
      metadataJson: { invoiceId: invoice.id, total: grandTotal.toFixed(), currency: invoice.currencyCode, source: "GAMING_REFUND" },
    });
    return credit;
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
    if (["CONFIRMED", "RECONCILED"].includes(current.status)) {
      await postBusinessEventTx(tx, organizationId, actorUserId, {
        postingEvent: "CUSTOMER_REFUND_CONFIRMED",
        sourceEntityType: "EnterprisePayment",
        sourceEntityId: current.id,
      });
      return current;
    }
    if (current.status !== "APPROVED" || current.revision !== input.revision) throw new EnterpriseAccountingError("REFUND_PAYMENT_NOT_APPROVED", 409);
    if (current.paymentType !== "REFUND" || current.direction !== "OUTBOUND" || !current.financialAccountId) {
      throw new EnterpriseAccountingError("REFUND_PAYMENT_INVALID", 409);
    }
    assertIndependentActor({
      actorUserId,
      relatedUserIds: [current.initiatedByUserId, current.approvedByUserId],
      errorCode: "REFUND_PAYMENT_SELF_CONFIRMATION_FORBIDDEN",
    });

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
      data: {
        organizationId,
        financialAccountId: account.id,
        paymentId: current.id,
        transactionType: "CUSTOMER_REFUND",
        direction: "OUTBOUND",
        currencyCode: current.currencyCode,
        amount: current.amount,
        transactionDate: current.paymentDate,
        reference: current.reference,
        createdByUserId: actorUserId,
      },
    });
    if (cashSessionId) {
      await tx.enterpriseCashMovement.create({
        data: {
          organizationId,
          cashSessionId,
          paymentId: current.id,
          movementType: "CUSTOMER_REFUND",
          direction: "OUTBOUND",
          amount: current.amount,
          currencyCode: current.currencyCode,
          reference: current.reference,
          reason: input.reason,
          createdByUserId: actorUserId,
        },
      });
    }
    await tx.enterpriseFinancialAccount.update({
      where: { id: account.id },
      data: { operationalBalance: { decrement: current.amount }, revision: { increment: 1 } },
    });
    const confirmed = await tx.enterprisePayment.update({
      where: { id: current.id },
      data: { status: "CONFIRMED", confirmedByUserId: actorUserId, confirmedAt: new Date(), revision: { increment: 1 } },
    });
    await tx.enterprisePaymentEvent.create({
      data: {
        organizationId,
        paymentId: current.id,
        eventType: "CONFIRM_REFUND",
        summary: "Customer refund confirmed",
        actorUserId,
        metadataJson: { reason: input.reason.slice(0, 500), financialAccountId: account.id, cashSessionId },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterprisePayment",
      entityId: current.id,
      eventType: "CUSTOMER_REFUND_CONFIRMED",
      summary: `Customer refund ${current.number} confirmed`,
      actorUserId,
      fromStatus: "APPROVED",
      toStatus: "CONFIRMED",
      metadataJson: { amount: current.amount.toFixed(), currency: current.currencyCode, financialAccountId: account.id },
    });
    await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: "CUSTOMER_REFUND_CONFIRMED",
      sourceEntityType: "EnterprisePayment",
      sourceEntityId: confirmed.id,
    });
    return confirmed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });

  return payment;
}
