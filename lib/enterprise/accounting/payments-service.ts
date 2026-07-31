import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, financeReference, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import type { paymentCreateSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type PaymentInput = z.infer<typeof paymentCreateSchema>;

function postingEventForPayment(paymentType: string) {
  if (paymentType === "CUSTOMER_PAYMENT") return "CUSTOMER_PAYMENT_CONFIRMED" as const;
  if (paymentType === "SUPPLIER_PAYMENT") return "SUPPLIER_PAYMENT_CONFIRMED" as const;
  if (paymentType === "PAYROLL_PAYMENT") return "PAYROLL_PAYMENT_CONFIRMED" as const;
  return null;
}

export async function createEnterprisePayment(organizationId: string, actorUserId: string, input: PaymentInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.isPositive()) throw new EnterpriseAccountingError("PAYMENT_AMOUNT_INVALID", 400);
    if (["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CARD", "CHEQUE"].includes(input.methodType) && !input.financialAccountId) {
      throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_REQUIRED", 409);
    }
    if (input.financialAccountId) {
      const financialAccount = await tx.enterpriseFinancialAccount.findFirst({ where: { id: input.financialAccountId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!financialAccount || financialAccount.currencyCode !== input.currencyCode) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_INVALID", 409);
      const expectedType = input.methodType === "CASH" ? "CASH" : input.methodType === "MOBILE_MONEY" ? "MOBILE_MONEY" : null;
      if (expectedType && financialAccount.accountType !== expectedType) throw new EnterpriseAccountingError("PAYMENT_METHOD_ACCOUNT_MISMATCH", 409);
    }
    if (input.businessPartyId) {
      const party = await tx.enterpriseBusinessParty.findFirst({ where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!party) throw new EnterpriseAccountingError("PAYMENT_PARTY_INVALID", 409);
    }
    if (input.payrollRunId) {
      const run = await tx.enterprisePayrollRun.findFirst({ where: { id: input.payrollRunId, organizationId, status: "APPROVED" } });
      if (!run) throw new EnterpriseAccountingError("PAYROLL_RUN_NOT_PAYABLE", 409);
    }
    const payment = await tx.enterprisePayment.create({
      data: {
        organizationId,
        number: financeReference("PAY"),
        direction: input.direction,
        paymentType: input.paymentType,
        methodType: input.methodType,
        paymentMethodId: input.paymentMethodId || null,
        financialAccountId: input.financialAccountId || null,
        businessPartyId: input.businessPartyId || null,
        employeeId: input.employeeId || null,
        payrollRunId: input.payrollRunId || null,
        currencyCode: input.currencyCode,
        amount,
        unallocatedAmount: amount,
        paymentDate: input.paymentDate,
        reference: input.reference || null,
        maskedExternalReference: input.maskedExternalReference || null,
        status: "DRAFT",
        initiatedByUserId: actorUserId,
        idempotencyKey: input.idempotencyKey || null,
        events: { create: { organizationId, eventType: "CREATED", summary: "Payment created", actorUserId } },
      },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: payment.id, eventType: "PAYMENT_CREATED", summary: `Payment ${payment.number} created`, actorUserId, toStatus: "DRAFT", metadataJson: { amount: amount.toFixed(), currency: input.currencyCode, direction: input.direction } });
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
    const transition = {
      SUBMIT: { from: ["DRAFT"], to: "PENDING_APPROVAL" },
      APPROVE: { from: ["PENDING_APPROVAL"], to: "APPROVED" },
      RECONCILE: { from: ["CONFIRMED"], to: "RECONCILED" },
      CANCEL: { from: ["DRAFT", "PENDING_APPROVAL"], to: "CANCELLED" },
      REVERSE: { from: ["CONFIRMED", "RECONCILED"], to: "REVERSED" },
      CONFIRM: { from: [], to: "CONFIRMED" },
    }[input.action];
    if (!transition.from.includes(payment.status)) throw new EnterpriseAccountingError("PAYMENT_TRANSITION_INVALID", 409);
    if (input.action === "APPROVE") assertIndependentActor({ actorUserId, relatedUserIds: [payment.initiatedByUserId], errorCode: "PAYMENT_SELF_APPROVAL_FORBIDDEN" });
    if (input.action === "REVERSE") {
      assertIndependentActor({ actorUserId, relatedUserIds: [payment.initiatedByUserId, payment.confirmedByUserId], errorCode: "PAYMENT_SELF_REVERSAL_FORBIDDEN" });
      const activeAllocations = await tx.enterprisePaymentAllocation.count({ where: { organizationId, paymentId, status: "CONFIRMED" } });
      if (activeAllocations > 0) throw new EnterpriseAccountingError("PAYMENT_ALLOCATIONS_MUST_BE_REVERSED_FIRST", 409);
      await tx.enterpriseTreasuryTransaction.updateMany({ where: { organizationId, paymentId, status: "CONFIRMED" }, data: { status: "REVERSED", reversedAt: new Date() } });
    }
    const updated = await tx.enterprisePayment.update({
      where: { id: payment.id },
      data: {
        status: transition.to,
        approvedByUserId: input.action === "APPROVE" ? actorUserId : payment.approvedByUserId,
        reconciledAt: input.action === "RECONCILE" ? new Date() : payment.reconciledAt,
        reversedAt: input.action === "REVERSE" ? new Date() : payment.reversedAt,
        reversalReason: input.action === "REVERSE" ? input.reason || null : payment.reversalReason,
        revision: { increment: 1 },
        events: { create: { organizationId, eventType: input.action, summary: `Payment ${input.action}`, actorUserId, metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined } },
      },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: payment.id, eventType: `PAYMENT_${input.action}`, summary: `Payment ${payment.number}: ${input.action}`, actorUserId, fromStatus: payment.status, toStatus: transition.to, metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined });
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
    assertIndependentActor({ actorUserId, relatedUserIds: [payment.initiatedByUserId], errorCode: "PAYMENT_SELF_CONFIRMATION_FORBIDDEN" });
    if (!payment.financialAccountId) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_REQUIRED", 409);
    const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: payment.financialAccountId, organizationId, status: "ACTIVE" } });
    if (!account) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_INVALID", 409);
    if (payment.methodType === "CASH") {
      const session = await tx.enterpriseCashSession.findFirst({ where: { organizationId, financialAccountId: account.id, cashierUserId: payment.initiatedByUserId, status: "OPEN" } });
      if (!session) throw new EnterpriseAccountingError("OPEN_CASH_SESSION_REQUIRED", 409);
      await tx.enterpriseCashMovement.create({
        data: { organizationId, cashSessionId: session.id, paymentId: payment.id, movementType: payment.paymentType, direction: payment.direction, amount: payment.amount, currencyCode: payment.currencyCode, reference: payment.reference, createdByUserId: actorUserId },
      });
    }
    const signedAmount = payment.direction === "INBOUND" ? payment.amount : payment.amount.negated();
    await tx.enterpriseTreasuryTransaction.create({
      data: {
        organizationId,
        financialAccountId: account.id,
        paymentId: payment.id,
        transactionType: payment.paymentType,
        direction: payment.direction,
        currencyCode: payment.currencyCode,
        amount: payment.amount,
        transactionDate: payment.paymentDate,
        reference: payment.reference || payment.number,
        createdByUserId: actorUserId,
      },
    });
    await tx.enterpriseFinancialAccount.update({ where: { id: account.id }, data: { operationalBalance: { increment: signedAmount }, revision: { increment: 1 } } });
    const updated = await tx.enterprisePayment.update({
      where: { id: payment.id },
      data: { status: "CONFIRMED", confirmedByUserId: actorUserId, confirmedAt: new Date(), revision: { increment: 1 }, events: { create: { organizationId, eventType: "CONFIRMED", summary: "Payment confirmed", actorUserId } } },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: payment.id, eventType: "PAYMENT_CONFIRMED", summary: `Payment ${payment.number} confirmed`, actorUserId, fromStatus: payment.status, toStatus: "CONFIRMED", metadataJson: { financialAccountId: account.id, amount: payment.amount.toFixed(), currency: payment.currencyCode } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const event = postingEventForPayment(confirmed.paymentType);
  if (event) await postBusinessEvent(organizationId, actorUserId, { postingEvent: event, sourceEntityType: "EnterprisePayment", sourceEntityId: confirmed.id });
  return confirmed;
}

export async function allocateEnterprisePayment(
  organizationId: string,
  paymentId: string,
  actorUserId: string,
  input: { receivableId?: string; payableId?: string; amount: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const payment = await tx.enterprisePayment.findFirst({ where: { id: paymentId, organizationId } });
    if (!payment || !["CONFIRMED", "RECONCILED"].includes(payment.status)) throw new EnterpriseAccountingError("PAYMENT_NOT_ALLOCATABLE", 409);
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.isPositive() || amount.greaterThan(payment.unallocatedAmount)) throw new EnterpriseAccountingError("PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED", 409);
    let receivable = null;
    let payable = null;
    if (input.receivableId) {
      receivable = await tx.enterpriseReceivable.findFirst({ where: { id: input.receivableId, organizationId, status: "OPEN" }, include: { salesInvoice: true } });
      if (!receivable || payment.direction !== "INBOUND" || payment.paymentType !== "CUSTOMER_PAYMENT") throw new EnterpriseAccountingError("RECEIVABLE_ALLOCATION_INVALID", 409);
      if (payment.businessPartyId !== receivable.businessPartyId || payment.currencyCode !== receivable.currencyCode || amount.greaterThan(receivable.outstandingAmount)) throw new EnterpriseAccountingError("RECEIVABLE_ALLOCATION_SCOPE_OR_AMOUNT_INVALID", 409);
    } else if (input.payableId) {
      payable = await tx.enterprisePayable.findFirst({ where: { id: input.payableId, organizationId, status: "OPEN" }, include: { supplierInvoice: true } });
      if (!payable || payment.direction !== "OUTBOUND" || payment.paymentType !== "SUPPLIER_PAYMENT") throw new EnterpriseAccountingError("PAYABLE_ALLOCATION_INVALID", 409);
      if ((payment.businessPartyId && payment.businessPartyId !== payable.businessPartyId) || payment.currencyCode !== payable.currencyCode || amount.greaterThan(payable.outstandingAmount)) throw new EnterpriseAccountingError("PAYABLE_ALLOCATION_SCOPE_OR_AMOUNT_INVALID", 409);
    } else {
      throw new EnterpriseAccountingError("PAYMENT_ALLOCATION_TARGET_REQUIRED", 400);
    }
    const allocation = await tx.enterprisePaymentAllocation.create({
      data: { organizationId, paymentId: payment.id, receivableId: receivable?.id || null, payableId: payable?.id || null, amount, allocatedByUserId: actorUserId },
    });
    const remainingPayment = money(payment.unallocatedAmount.minus(amount));
    await tx.enterprisePayment.update({ where: { id: payment.id }, data: { unallocatedAmount: remainingPayment, revision: { increment: 1 } } });
    if (receivable) {
      const outstanding = money(receivable.outstandingAmount.minus(amount));
      await tx.enterpriseReceivable.update({ where: { id: receivable.id }, data: { allocatedAmount: { increment: amount }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CLOSED" : "OPEN" } });
      await tx.enterpriseSalesInvoice.update({ where: { id: receivable.salesInvoiceId }, data: { amountPaid: { increment: amount }, outstandingAmount: outstanding, status: outstanding.isZero() ? "PAID" : "PARTIALLY_PAID", revision: { increment: 1 } } });
      await tx.enterpriseReceivableAllocation.create({ data: { organizationId, receivableId: receivable.id, sourceType: "PAYMENT", sourceId: allocation.id, amount, allocationDate: new Date(), createdByUserId: actorUserId } });
    }
    if (payable) {
      const outstanding = money(payable.outstandingAmount.minus(amount));
      await tx.enterprisePayable.update({ where: { id: payable.id }, data: { allocatedAmount: { increment: amount }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CLOSED" : "OPEN" } });
      await tx.enterpriseSupplierInvoice.update({ where: { id: payable.supplierInvoiceId }, data: { amountPaid: { increment: amount }, outstandingAmount: outstanding, status: outstanding.isZero() ? "PAID" : "PARTIALLY_PAID", revision: { increment: 1 } } });
      await tx.enterprisePayableAllocation.create({ data: { organizationId, payableId: payable.id, sourceType: "PAYMENT", sourceId: allocation.id, amount, allocationDate: new Date(), createdByUserId: actorUserId } });
    }
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: payment.id, eventType: "PAYMENT_ALLOCATED", summary: `Payment ${payment.number} allocated`, actorUserId, metadataJson: { allocationId: allocation.id, amount: amount.toFixed(), receivableId: receivable?.id || null, payableId: payable?.id || null } });
    return allocation;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
