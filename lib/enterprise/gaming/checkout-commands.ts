import { Prisma } from "@prisma/client";
import {
  assertAccountingApprovalCandidate,
  cancelPendingAccountingApprovals,
} from "@/lib/enterprise/accounting/accounting-approval-service";
import { approveSalesInvoiceAssignedApproval } from "@/lib/enterprise/accounting/accounting-invoice-approval-orchestration";
import {
  approvePaymentAssignedApproval,
  submitPaymentForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-human-approval-orchestration";
import {
  confirmCustomerRefundPayment,
  createExactSalesCreditNoteForRefund,
  reverseCustomerPaymentAllocationsForRefund,
} from "@/lib/enterprise/accounting/customer-refund-service";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import {
  allocateEnterprisePayment,
  createEnterprisePayment,
  transitionEnterprisePayment,
} from "@/lib/enterprise/accounting/payments-service";
import {
  approveAndPostSalesCreditNote,
  transitionSalesInvoice,
} from "@/lib/enterprise/accounting/receivables-service";
import {
  EnterpriseGamingCheckoutError,
  gamingMoney,
  loadGamingCheckoutDetail,
  requireGamingCheckoutInvoiceTx,
  restockGamingCheckoutTx,
  syncGamingCheckoutPaidState,
} from "@/lib/enterprise/gaming/checkout-common";
import type { gamingCheckoutCommandSchema } from "@/lib/enterprise/gaming/checkout-schemas";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type CommandInput = z.infer<typeof gamingCheckoutCommandSchema>;

function requireCheckoutRevision(currentRevision: number, requestedRevision: number) {
  if (currentRevision !== requestedRevision) {
    throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REVISION_CONFLICT", 409, { currentRevision });
  }
}

export async function commandGamingCheckout(
  organizationId: string,
  checkoutId: string,
  actorUserId: string,
  input: CommandInput,
) {
  let snapshot = await loadGamingCheckoutDetail(organizationId, checkoutId);

  if (input.action === "APPROVE_INVOICE") {
    if (["ISSUED", "PARTIALLY_PAID", "PAID", "CREDIT_NOTE"].includes(snapshot.invoice.status)) {
      return { ...snapshot, idempotent: true };
    }
    requireCheckoutRevision(snapshot.checkout.revision, input.revision);
    let invoice = { id: snapshot.invoice.id, status: snapshot.invoice.status, revision: snapshot.invoice.revision };
    if (invoice.status === "PENDING_APPROVAL") {
      invoice = await approveSalesInvoiceAssignedApproval(
        organizationId,
        invoice.id,
        actorUserId,
        { revision: invoice.revision, reason: input.reason },
      );
    }
    if (invoice.status === "APPROVED") {
      invoice = await transitionSalesInvoice(
        organizationId,
        invoice.id,
        actorUserId,
        { action: "ISSUE", revision: invoice.revision, reason: input.reason },
      );
    }
    if (!["ISSUED", "PARTIALLY_PAID", "PAID"].includes(invoice.status)) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_INVOICE_NOT_ISSUED", 409);
    }
    await prisma.enterpriseGamingCheckout.update({
      where: { id: checkoutId },
      data: {
        status: invoice.status === "PAID" ? "PAID" : invoice.status === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "AWAITING_PAYMENT",
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    await syncGamingCheckoutPaidState(organizationId, checkoutId, actorUserId);
    return { ...(await loadGamingCheckoutDetail(organizationId, checkoutId)), idempotent: false };
  }

  if (input.action === "ADD_PAYMENT") {
    const stableKey = `gaming-checkout:${checkoutId}:payment:${input.idempotencyKey}`;
    let payment = await prisma.enterprisePayment.findFirst({ where: { organizationId, idempotencyKey: stableKey } });
    if (payment) {
      if (
        payment.reference !== snapshot.checkout.reference
        || payment.paymentType !== "CUSTOMER_PAYMENT"
        || payment.direction !== "INBOUND"
        || payment.currencyCode !== snapshot.invoice.currencyCode
        || payment.methodType !== input.methodType
        || payment.financialAccountId !== input.financialAccountId
        || !payment.amount.equals(gamingMoney(input.amount))
      ) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_PAYMENT_IDEMPOTENCY_CONFLICT", 409);
      }
      if (payment.status === "DRAFT") {
        payment = await submitPaymentForAssignedApproval(
          organizationId,
          payment.id,
          actorUserId,
          {
            revision: payment.revision,
            approverUserId: input.paymentApproverUserId,
            reason: `Gaming checkout ${snapshot.checkout.reference}`,
          },
        );
      }
      return { ...(await loadGamingCheckoutDetail(organizationId, checkoutId)), payment, idempotent: true };
    }

    requireCheckoutRevision(snapshot.checkout.revision, input.revision);
    if (!["AWAITING_PAYMENT", "PARTIALLY_PAID"].includes(snapshot.checkout.status)) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_PAYABLE", 409);
    }
    const receivable = snapshot.invoice.receivable;
    if (!receivable || !receivable.outstandingAmount.isPositive()) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_RECEIVABLE_NOT_OPEN", 409);
    }
    await assertAccountingApprovalCandidate({
      organizationId,
      targetEntityType: "EnterprisePayment",
      requesterUserId: actorUserId,
      approverUserId: input.paymentApproverUserId,
    });
    const pending = await prisma.enterprisePayment.findMany({
      where: {
        organizationId,
        reference: snapshot.checkout.reference,
        paymentType: "CUSTOMER_PAYMENT",
        status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "CONFIRMED", "RECONCILED"] },
      },
    });
    const reserved = pending.reduce(
      (total, candidate) => total.plus(["CONFIRMED", "RECONCILED"].includes(candidate.status) ? candidate.unallocatedAmount : candidate.amount),
      gamingMoney(0),
    );
    const available = gamingMoney(Prisma.Decimal.max(0, receivable.outstandingAmount.minus(reserved)));
    const requestedAmount = gamingMoney(input.amount);
    if (requestedAmount.greaterThan(available)) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_PAYMENT_EXCEEDS_OUTSTANDING", 409, {
        available: available.toFixed(),
        requested: requestedAmount.toFixed(),
      });
    }

    payment = await createEnterprisePayment(organizationId, actorUserId, {
      direction: "INBOUND",
      paymentType: "CUSTOMER_PAYMENT",
      methodType: input.methodType,
      financialAccountId: input.financialAccountId,
      businessPartyId: snapshot.invoice.businessPartyId,
      currencyCode: snapshot.invoice.currencyCode,
      amount: requestedAmount.toFixed(),
      paymentDate: new Date(),
      reference: snapshot.checkout.reference,
      maskedExternalReference: input.maskedExternalReference || input.reference || undefined,
      idempotencyKey: stableKey,
    });
    payment = await submitPaymentForAssignedApproval(
      organizationId,
      payment.id,
      actorUserId,
      {
        revision: payment.revision,
        approverUserId: input.paymentApproverUserId,
        reason: `Gaming checkout ${snapshot.checkout.reference}`,
      },
    );
    return { ...(await loadGamingCheckoutDetail(organizationId, checkoutId)), payment, idempotent: false };
  }

  if (input.action === "APPROVE_PAYMENT") {
    let payment = await prisma.enterprisePayment.findFirst({
      where: {
        id: input.paymentId,
        organizationId,
        reference: snapshot.checkout.reference,
        paymentType: "CUSTOMER_PAYMENT",
        direction: "INBOUND",
      },
    });
    if (!payment || payment.currencyCode !== snapshot.invoice.currencyCode || payment.businessPartyId !== snapshot.invoice.businessPartyId) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_PAYMENT_INVALID", 409);
    }
    const receivable = snapshot.invoice.receivable;
    if (!receivable) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_RECEIVABLE_NOT_OPEN", 409);
    const existingAllocation = await prisma.enterprisePaymentAllocation.findFirst({
      where: { organizationId, paymentId: payment.id, receivableId: receivable.id, status: "CONFIRMED" },
    });
    if (existingAllocation && ["CONFIRMED", "RECONCILED"].includes(payment.status)) {
      await syncGamingCheckoutPaidState(organizationId, checkoutId, actorUserId);
      return { ...(await loadGamingCheckoutDetail(organizationId, checkoutId)), idempotent: true };
    }

    requireCheckoutRevision(snapshot.checkout.revision, input.revision);
    if (payment.status === "PENDING_APPROVAL") {
      payment = await approvePaymentAssignedApproval(
        organizationId,
        payment.id,
        actorUserId,
        { revision: payment.revision, reason: input.reason },
      );
    }
    if (payment.status === "APPROVED") {
      payment = await transitionEnterprisePayment(
        organizationId,
        payment.id,
        actorUserId,
        { action: "CONFIRM", revision: payment.revision, reason: input.reason },
      );
    }
    if (!["CONFIRMED", "RECONCILED"].includes(payment.status)) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_PAYMENT_NOT_CONFIRMED", 409);
    }
    const refreshedAllocation = await prisma.enterprisePaymentAllocation.findFirst({
      where: { organizationId, paymentId: payment.id, receivableId: receivable.id, status: "CONFIRMED" },
    });
    if (!refreshedAllocation && payment.unallocatedAmount.isPositive()) {
      const refreshedReceivable = await prisma.enterpriseReceivable.findFirst({
        where: { id: receivable.id, organizationId },
      });
      if (!refreshedReceivable?.outstandingAmount.isPositive()) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_RECEIVABLE_NOT_OPEN", 409);
      }
      const amount = Prisma.Decimal.min(payment.unallocatedAmount, refreshedReceivable.outstandingAmount);
      await allocateEnterprisePayment(
        organizationId,
        payment.id,
        actorUserId,
        { receivableId: receivable.id, amount: amount.toFixed() },
      );
    }
    await syncGamingCheckoutPaidState(organizationId, checkoutId, actorUserId);
    return { ...(await loadGamingCheckoutDetail(organizationId, checkoutId)), idempotent: false };
  }

  if (input.action === "CANCEL") {
    if (snapshot.checkout.status === "CANCELLED") return { ...snapshot, idempotent: true };
    requireCheckoutRevision(snapshot.checkout.revision, input.revision);
    if (snapshot.checkout.status !== "INVOICE_PENDING") {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_CANNOT_CANCEL", 409);
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingCheckout" WHERE id = ${checkoutId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const checkout = await tx.enterpriseGamingCheckout.findFirst({
        where: { id: checkoutId, organizationId },
        include: { session: true },
      });
      if (!checkout) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_FOUND", 404);
      if (checkout.status === "CANCELLED") return;
      if (checkout.status !== "INVOICE_PENDING" || checkout.revision !== input.revision) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REVISION_CONFLICT", 409, { currentRevision: checkout.revision });
      }
      const invoice = await requireGamingCheckoutInvoiceTx(tx, organizationId, checkout.salesInvoiceId);
      if (["ISSUED", "PARTIALLY_PAID", "PAID", "CREDIT_NOTE"].includes(invoice.status)) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_CANNOT_CANCEL", 409);
      }
      await cancelPendingAccountingApprovals(tx, {
        organizationId,
        targetEntityTypes: ["EnterpriseSalesInvoice"],
        targetEntityId: invoice.id,
        reason: input.reason,
      });
      await tx.enterpriseSalesInvoice.update({
        where: { id: invoice.id },
        data: { status: "CANCELLED", revision: { increment: 1 } },
      });
      await restockGamingCheckoutTx(tx, organizationId, checkout.id, actorUserId, "cancel");
      await tx.enterpriseGamingCheckout.update({
        where: { id: checkout.id },
        data: { status: "CANCELLED", updatedByUserId: actorUserId, revision: { increment: 1 } },
      });
      await tx.enterpriseGamingSession.update({
        where: { id: checkout.sessionId },
        data: { status: "CANCELLED", updatedByUserId: actorUserId, revision: { increment: 1 } },
      });
      await tx.enterpriseGamingSessionTransition.upsert({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: `CHECKOUT:${checkout.id}:CANCELLED` } },
        update: {},
        create: {
          organizationId,
          sessionId: checkout.sessionId,
          action: "CHECKOUT_CANCELLED",
          idempotencyKey: `CHECKOUT:${checkout.id}:CANCELLED`,
          fromStatus: checkout.session.status,
          toStatus: "CANCELLED",
          actorUserId,
          metadataJson: { checkoutId: checkout.id, reason: input.reason.slice(0, 500) },
        },
      });
      await publishFinanceEvent(tx, {
        organizationId,
        entityType: "EnterpriseSalesInvoice",
        entityId: invoice.id,
        eventType: "SALES_INVOICE_CANCEL",
        summary: `Customer invoice ${invoice.number}: CANCEL`,
        actorUserId,
        fromStatus: invoice.status,
        toStatus: "CANCELLED",
        metadataJson: { source: "GAMING_CHECKOUT", reason: input.reason.slice(0, 500) },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...(await loadGamingCheckoutDetail(organizationId, checkoutId)), idempotent: false };
  }

  if (input.action === "REQUEST_REFUND") {
    const stableKey = `gaming-checkout:${checkoutId}:refund:${input.idempotencyKey}`;
    let refund = await prisma.enterprisePayment.findFirst({ where: { organizationId, idempotencyKey: stableKey } });
    if (snapshot.checkout.status === "REFUNDED") return { ...snapshot, refundPayment: refund, idempotent: true };
    if (snapshot.checkout.status === "REFUND_PENDING") {
      refund = refund || await prisma.enterprisePayment.findFirst({
        where: {
          organizationId,
          reference: `${snapshot.checkout.reference}:REFUND`,
          paymentType: "REFUND",
          direction: "OUTBOUND",
          status: { notIn: ["CANCELLED", "REVERSED"] },
        },
        orderBy: { createdAt: "desc" },
      });
      return { ...snapshot, refundPayment: refund, idempotent: true };
    }

    requireCheckoutRevision(snapshot.checkout.revision, input.revision);
    if (snapshot.checkout.status !== "PAID" || snapshot.invoice.status !== "PAID") {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_REFUNDABLE", 409);
    }
    await assertAccountingApprovalCandidate({
      organizationId,
      targetEntityType: "EnterprisePayment",
      requesterUserId: actorUserId,
      approverUserId: input.refundApproverUserId,
    });
    if (refund) {
      if (
        refund.reference !== `${snapshot.checkout.reference}:REFUND`
        || refund.paymentType !== "REFUND"
        || refund.direction !== "OUTBOUND"
        || refund.currencyCode !== snapshot.invoice.currencyCode
        || refund.methodType !== input.methodType
        || refund.financialAccountId !== input.financialAccountId
        || !refund.amount.equals(snapshot.invoice.grandTotal)
      ) {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_IDEMPOTENCY_CONFLICT", 409);
      }
    } else {
      refund = await createEnterprisePayment(organizationId, actorUserId, {
        direction: "OUTBOUND",
        paymentType: "REFUND",
        methodType: input.methodType,
        financialAccountId: input.financialAccountId,
        businessPartyId: snapshot.invoice.businessPartyId,
        currencyCode: snapshot.invoice.currencyCode,
        amount: snapshot.invoice.grandTotal.toFixed(),
        paymentDate: new Date(),
        reference: `${snapshot.checkout.reference}:REFUND`,
        maskedExternalReference: input.maskedExternalReference || input.reference || undefined,
        idempotencyKey: stableKey,
      });
    }
    if (!refund.unallocatedAmount.isZero()) {
      refund = await prisma.enterprisePayment.update({
        where: { id: refund.id },
        data: { unallocatedAmount: gamingMoney(0), revision: { increment: 1 } },
      });
    }
    if (refund.status === "DRAFT") {
      refund = await submitPaymentForAssignedApproval(
        organizationId,
        refund.id,
        actorUserId,
        { revision: refund.revision, approverUserId: input.refundApproverUserId, reason: input.reason },
      );
    }

    const updated = await prisma.enterpriseGamingCheckout.updateMany({
      where: { id: checkoutId, organizationId, status: "PAID", revision: input.revision },
      data: {
        status: "REFUND_PENDING",
        refundRequestedAt: new Date(),
        refundRequestedByUserId: actorUserId,
        refundReason: input.reason,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      snapshot = await loadGamingCheckoutDetail(organizationId, checkoutId);
      if (snapshot.checkout.status !== "REFUND_PENDING") {
        throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REVISION_CONFLICT", 409, { currentRevision: snapshot.checkout.revision });
      }
    }
    return { ...(await loadGamingCheckoutDetail(organizationId, checkoutId)), refundPayment: refund, idempotent: false };
  }

  if (input.action === "APPROVE_REFUND") {
    if (snapshot.checkout.status === "REFUNDED") return { ...snapshot, idempotent: true };
    requireCheckoutRevision(snapshot.checkout.revision, input.revision);
    if (snapshot.checkout.status !== "REFUND_PENDING") {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_NOT_PENDING", 409);
    }
    if (!snapshot.checkout.refundRequestedByUserId || snapshot.checkout.refundRequestedByUserId === actorUserId) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_SELF_APPROVAL_FORBIDDEN", 403);
    }
    const receivable = snapshot.invoice.receivable;
    if (!receivable) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_RECEIVABLE_NOT_FOUND", 409);
    let refund = await prisma.enterprisePayment.findFirst({
      where: {
        organizationId,
        reference: `${snapshot.checkout.reference}:REFUND`,
        paymentType: "REFUND",
        direction: "OUTBOUND",
        status: { notIn: ["CANCELLED", "REVERSED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!refund) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_PAYMENT_NOT_FOUND", 409);
    if (refund.status === "PENDING_APPROVAL") {
      refund = await approvePaymentAssignedApproval(
        organizationId,
        refund.id,
        actorUserId,
        { revision: refund.revision, reason: input.reason },
      );
    }
    if (!["APPROVED", "CONFIRMED", "RECONCILED"].includes(refund.status)) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_PAYMENT_NOT_APPROVED", 409);
    }

    const refundReason = snapshot.checkout.refundReason || input.reason;
    await reverseCustomerPaymentAllocationsForRefund(organizationId, receivable.id, actorUserId, refundReason);
    const creditReason = `Gaming refund ${snapshot.checkout.reference}: ${refundReason}`;
    let credit = await prisma.enterpriseSalesCreditNote.findFirst({
      where: { organizationId, salesInvoiceId: snapshot.invoice.id, reason: creditReason },
      orderBy: { createdAt: "desc" },
    });
    if (!credit) {
      credit = await createExactSalesCreditNoteForRefund(
        organizationId,
        snapshot.invoice.id,
        snapshot.checkout.refundRequestedByUserId,
        creditReason,
      );
    }
    if (credit.status === "DRAFT") {
      credit = await approveAndPostSalesCreditNote(organizationId, credit.id, actorUserId, credit.revision);
    }
    if (credit.status !== "POSTED") {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_CREDIT_NOTE_NOT_POSTED", 409);
    }
    if (refund.status === "APPROVED") {
      refund = await confirmCustomerRefundPayment(
        organizationId,
        refund.id,
        actorUserId,
        { revision: refund.revision, reason: refundReason },
      );
    }
    if (!["CONFIRMED", "RECONCILED"].includes(refund.status)) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_NOT_CONFIRMED", 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingCheckout" WHERE id = ${checkoutId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const current = await tx.enterpriseGamingCheckout.findFirst({
        where: { id: checkoutId, organizationId },
        include: { session: true },
      });
      if (!current) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_FOUND", 404);
      if (current.status === "REFUNDED") return;
      if (current.status !== "REFUND_PENDING") throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_NOT_PENDING", 409);
      await restockGamingCheckoutTx(tx, organizationId, checkoutId, actorUserId, "refund");
      await tx.enterpriseGamingCheckout.update({
        where: { id: checkoutId },
        data: { status: "REFUNDED", refundedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } },
      });
      await tx.enterpriseGamingSessionTransition.upsert({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: `CHECKOUT:${checkoutId}:REFUNDED` } },
        update: {},
        create: {
          organizationId,
          sessionId: current.sessionId,
          action: "CHECKOUT_REFUNDED",
          idempotencyKey: `CHECKOUT:${checkoutId}:REFUNDED`,
          fromStatus: current.session.status,
          toStatus: current.session.status,
          actorUserId,
          metadataJson: { checkoutId, refundPaymentId: refund.id, creditNoteId: credit.id, reason: refundReason.slice(0, 500) },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...(await loadGamingCheckoutDetail(organizationId, checkoutId)), refundPayment: refund, creditNote: credit, idempotent: false };
  }

  throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_ACTION_INVALID", 400);
}
