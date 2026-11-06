import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { reverseRetailOmnichannelCashbackTx } from "@/lib/enterprise/relationship-benefits/omnichannel-cashback";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { valueRetailInventoryReturnTx } from "@/lib/enterprise/retail/accounting";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";
import {
  omnichannelReturnDecisionSchema, omnichannelReturnRequestSchema,
} from "@/lib/enterprise/retail/omnichannel-return-schemas";
import { createEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import {
  submitPaymentForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-human-approval-orchestration";
import {
  prepareSalesCreditNoteForRefundAmount,
  reverseCustomerPaymentAllocationsForRefundAmount,
  markCustomerRefundFinancialInverseReady,
  confirmCustomerRefundPayment,
  consumeCustomerPaymentRefundAvailability,
} from "@/lib/enterprise/accounting/customer-refund-service";
import {
  submitSalesCreditNoteForAssignedApproval,
  postApprovedSalesCreditNote,
} from "@/lib/enterprise/accounting/accounting-document-approval-orchestration";
import { assertSalesCreditNoteStillPostable } from "@/lib/enterprise/accounting/credit-note-posting-preflight";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

type ReturnRequest = z.infer<typeof omnichannelReturnRequestSchema>;
type ReturnDecision = z.infer<typeof omnichannelReturnDecisionSchema>;
const conflict = (code: string, status = 409) => new EnterpriseRetailError(code, status);
const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const money = (value: Prisma.Decimal.Value) => d(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** Keep Finance access distinct from the Retail POS role, with no role-name bypass. */
async function assertReturnFinanceAccess(organizationId: string, actorUserId: string, stage: "PREPARE" | "SETTLE") {
  const [payments, receivables] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS" }),
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES" }),
  ]);
  if (stage === "PREPARE" && (!payments.canCreate || !payments.canSubmit || !receivables.canCreate || !receivables.canSubmit)) {
    throw conflict("RETAIL_OMNICHANNEL_RETURN_FINANCE_PERMISSION_REQUIRED", 403);
  }
  if (stage === "SETTLE" && (!payments.canWrite || !receivables.canManage)) {
    throw conflict("RETAIL_OMNICHANNEL_RETURN_FINANCE_PERMISSION_REQUIRED", 403);
  }
}

function assertEligiblePaymentSource(
  invoice: {
    currencyCode: string;
    businessPartyId: string;
    receivable: null | {
      paymentAllocations: Array<{
        amount: Prisma.Decimal;
        status: string;
        payment: {
          id: string; status: string; direction: string; paymentType: string;
          currencyCode: string; businessPartyId: string | null;
          financialAccountId: string | null; methodType: string;
        };
      }>;
    };
  },
  amount: Prisma.Decimal,
) {
  if (!invoice.receivable) throw conflict("RETAIL_OMNICHANNEL_RETURN_INVOICE_UNPAID");
  const candidates = new Map<string, { payment: NonNullable<typeof invoice.receivable>["paymentAllocations"][number]["payment"]; amount: Prisma.Decimal }>();
  for (const allocation of invoice.receivable.paymentAllocations) {
    const payment = allocation.payment;
    if (allocation.status !== "CONFIRMED" ||
        payment.direction !== "INBOUND" || payment.paymentType !== "CUSTOMER_PAYMENT" ||
        !["CONFIRMED", "RECONCILED"].includes(payment.status) ||
        payment.currencyCode !== invoice.currencyCode ||
        payment.businessPartyId !== invoice.businessPartyId ||
        !payment.financialAccountId ||
        !["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CHEQUE"].includes(payment.methodType)) continue;
    const previous = candidates.get(payment.id);
    candidates.set(payment.id, { payment, amount: (previous?.amount || d(0)).plus(allocation.amount) });
  }
  const eligible = [...candidates.values()].find((candidate) => candidate.amount.gte(amount));
  if (!eligible) throw conflict("RETAIL_OMNICHANNEL_RETURN_PAID_SOURCE_REQUIRED");
  return eligible.payment;
}

export async function listRetailOmnichannelReturns(organizationId: string, salesOrderId: string) {
  return prisma.enterpriseRetailOmnichannelReturn.findMany({
    where: { organizationId, salesOrderId },
    select: {
      id: true, number: true, status: true, reason: true, currencyCode: true,
      refundAmount: true, revision: true, requestedByUserId: true,
      validatorUserId: true, approvedByUserId: true, preparedByUserId: true, createdAt: true,
      lines: { select: { id: true, salesOrderItemId: true, quantity: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
}

/** Never leak payment or invoice identifiers through a Retail-only API response. */
export function retailReturnPublicView(value: {
  id: string; number: string; status: string; reason: string; currencyCode: string;
  refundAmount: Prisma.Decimal; revision: number;
}) {
  return { id: value.id, number: value.number, status: value.status, reason: value.reason,
    currencyCode: value.currencyCode, refundAmount: value.refundAmount, revision: value.revision };
}

export async function requestRetailOmnichannelReturn(
  organizationId: string, salesOrderId: string, actorUserId: string, input: ReturnRequest,
) {
  const [validatorPayments, validatorReceivables, retailCandidates] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ organizationId, userId: input.validatorUserId, moduleCode: "FINANCE_PAYMENTS" }),
    resolveEnterpriseModuleCapabilities({ organizationId, userId: input.validatorUserId, moduleCode: "FINANCE_RECEIVABLES" }),
    listEnterpriseApprovalCandidates({ organizationId, requesterUserId: actorUserId, moduleCode: "RETAIL_POS" }),
  ]);
  if (!validatorPayments.canApprove || !validatorReceivables.canApprove ||
      !retailCandidates.candidates.some((candidate) => candidate.userId === input.validatorUserId &&
        !candidate.isRequester && !candidate.selfApprovalOverride)) {
    throw conflict("RETAIL_OMNICHANNEL_RETURN_VALIDATOR_REQUIRED", 403);
  }
  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesOrder" WHERE id = ${salesOrderId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const existing = await tx.enterpriseRetailOmnichannelReturn.findFirst({
      where: { organizationId, idempotencyKey: input.idempotencyKey }, include: { lines: true },
    });
    if (existing) {
      if (existing.salesOrderId !== salesOrderId || existing.requestedByUserId !== actorUserId ||
          existing.reason !== input.reason || existing.validatorUserId !== input.validatorUserId ||
          existing.lines.length !== input.lines.length || input.lines.some((line) => !existing.lines.some((stored) =>
            stored.salesOrderItemId === line.salesOrderItemId && stored.quantity.equals(line.quantity) &&
            stored.stockDisposition === line.stockDisposition && stored.productCondition === line.productCondition))) {
        throw conflict("RETAIL_OMNICHANNEL_RETURN_IDEMPOTENCY_COLLISION");
      }
      return { retailReturn: existing, idempotent: true };
    }
    const [order, context, validator] = await Promise.all([
      tx.enterpriseSalesOrder.findFirst({ where: { id: salesOrderId, organizationId, archivedAt: null }, include: { items: { include: { catalogItem: true } }, fulfillments: true } }),
      tx.enterpriseRetailOrderOrchestration.findFirst({ where: { organizationId, salesOrderId, archivedAt: null } }),
      tx.organizationMember.findFirst({ where: { organizationId, userId: input.validatorUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }),
    ]);
    if (!order || !context) throw conflict("RETAIL_OMNICHANNEL_ORDER_NOT_FOUND", 404);
    if (order.status !== "FULFILLED" || context.status !== "FULFILLED" ||
        order.fulfillments.length === 0 || order.fulfillments.some((f) => f.status !== "COMPLETED")) {
      throw conflict("RETAIL_OMNICHANNEL_RETURN_DELIVERY_PROOF_REQUIRED");
    }
    const accepted = order.fulfillments.some((fulfillment) => Boolean(fulfillment.acceptedByCustomerAt));
    const proofIds = order.fulfillments.map((fulfillment) => fulfillment.proofDocumentId).filter((value): value is string => Boolean(value));
    const document = !accepted && proofIds.length ? await tx.enterpriseDocument.findFirst({
      where: { organizationId, id: { in: proofIds }, archivedAt: null,
        sourceEntityType: "EnterpriseSalesOrder", sourceEntityId: order.id,
        currentVersion: { gt: 0 }, versions: { some: { organizationId } } }, select: { id: true },
    }) : null;
    if (!accepted && !document) throw conflict("RETAIL_OMNICHANNEL_RETURN_DELIVERY_PROOF_REQUIRED");
    if (!validator || input.validatorUserId === actorUserId) throw conflict("RETAIL_OMNICHANNEL_RETURN_VALIDATOR_REQUIRED", 403);

    const invoiceMatches = await tx.enterpriseSalesInvoice.findMany({
      where: { organizationId, salesOrderId, businessPartyId: order.businessPartyId, currencyCode: order.currency },
      include: { receivable: { include: { paymentAllocations: { include: { payment: true } } } } }, take: 3,
    });
    if (invoiceMatches.length !== 1 || !invoiceMatches[0].grandTotal.equals(order.totalAmount)) {
      throw conflict("RETAIL_OMNICHANNEL_RETURN_INVOICE_REQUIRED");
    }
    const invoice = invoiceMatches[0];
    if (!["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CREDIT_NOTE"].includes(invoice.status)) {
      throw conflict("RETAIL_OMNICHANNEL_RETURN_INVOICE_REQUIRED");
    }

    const previous = await tx.enterpriseRetailOmnichannelReturnLine.findMany({
      where: { organizationId, salesOrderItemId: { in: input.lines.map((line) => line.salesOrderItemId) },
        retailReturn: { salesOrderId, status: { not: "REJECTED" } } },
      select: { salesOrderItemId: true, quantity: true, refundAmount: true },
    });
    const stockMovements = await tx.enterpriseStockMovement.findMany({
      where: { organizationId, sourceEntityType: "EnterpriseFulfillment", direction: "OUT", movementType: "SALE_FULFILLMENT",
        sourceEntityId: { in: order.fulfillments.map((fulfillment) => fulfillment.id) },
        sourceLineId: { in: input.lines.map((line) => line.salesOrderItemId) } },
      select: { id: true, sourceLineId: true, inventoryItemId: true, warehouseId: true, storageLocationId: true, stockLotId: true },
    });
    const postedIssues = await tx.enterpriseInventoryAccountingEvent.findMany({
      where: { organizationId, stockMovementId: { in: stockMovements.map((movement) => movement.id) },
        eventType: "ISSUE", status: "POSTED", journalEntryId: { not: null } },
      select: { stockMovementId: true },
    });
    const valuedMovements = new Set(postedIssues.map((issue) => issue.stockMovementId));
    const lines = input.lines.map((line) => {
      const source = order.items.find((item) => item.id === line.salesOrderItemId);
      if (!source) throw conflict("RETAIL_OMNICHANNEL_RETURN_LINE_INVALID");
      const returned = previous.filter((item) => item.salesOrderItemId === source.id);
      const usedQuantity = returned.reduce((sum, item) => sum.plus(item.quantity), d(0));
      const usedAmount = returned.reduce((sum, item) => sum.plus(item.refundAmount), d(0));
      const quantity = d(line.quantity);
      if (quantity.lte(0) || quantity.gt(source.quantityFulfilled.minus(usedQuantity))) {
        throw conflict("RETAIL_OMNICHANNEL_RETURN_QUANTITY_EXCEEDED");
      }
      if (line.stockDisposition === "RESTOCK" && !source.catalogItem?.trackInventory) {
        throw conflict("RETAIL_OMNICHANNEL_RETURN_STOCK_INVALID");
      }
      if (line.stockDisposition === "RESTOCK") {
        const sourceMovements = stockMovements.filter((movement) => movement.sourceLineId === source.id);
        const coordinates = new Set(sourceMovements
          .map((movement) => [movement.inventoryItemId, movement.warehouseId, movement.storageLocationId || "", movement.stockLotId || ""].join(":")));
        if (coordinates.size !== 1) throw conflict("RETAIL_OMNICHANNEL_RETURN_STOCK_AMBIGUOUS");
        if (sourceMovements.some((movement) => !valuedMovements.has(movement.id))) {
          throw conflict("RETAIL_OMNICHANNEL_RETURN_ORIGINAL_STOCK_UNVALUED");
        }
      }
      const isFinal = quantity.eq(source.quantityOrdered.minus(usedQuantity));
      const refundAmount = isFinal
        ? money(source.lineTotal.minus(usedAmount))
        : money(source.lineTotal.times(quantity).dividedBy(source.quantityOrdered));
      if (refundAmount.lt(0)) throw conflict("RETAIL_OMNICHANNEL_RETURN_AMOUNT_INVALID");
      return { ...line, quantity, refundAmount };
    });
    const amount = lines.reduce((sum, line) => sum.plus(line.refundAmount), d(0));
    if (!amount.isPositive() || amount.gt(invoice.grandTotal)) throw conflict("RETAIL_OMNICHANNEL_RETURN_AMOUNT_INVALID");
    const sourcePayment = assertEligiblePaymentSource(invoice, amount);

    const created = await tx.enterpriseRetailOmnichannelReturn.create({
      data: {
        organizationId, salesOrderId, number: `OMR-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`,
        idempotencyKey: input.idempotencyKey, reason: input.reason, status: "PENDING_APPROVAL",
        currencyCode: order.currency, refundAmount: amount, salesInvoiceId: invoice.id,
        sourcePaymentId: sourcePayment.id, requestedByUserId: actorUserId, validatorUserId: input.validatorUserId,
        lines: { create: lines.map((line) => ({ salesOrderItemId: line.salesOrderItemId,
          quantity: line.quantity, refundAmount: line.refundAmount, productCondition: line.productCondition,
          stockDisposition: line.stockDisposition })) },
      }, include: { lines: true },
    });
    await publishEnterpriseEvent(tx, {
      organizationId, entityType: "EnterpriseRetailOmnichannelReturn", entityId: created.id,
      eventType: "RETAIL_OMNICHANNEL_RETURN_REQUESTED", summary: `Retour ${created.number} demandé`,
      actorUserId, toStatus: created.status, metadataJson: { salesOrderId, salesInvoiceId: invoice.id, currencyCode: order.currency, refundAmount: amount.toFixed() },
    });
    return { retailReturn: created, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

export async function decideRetailOmnichannelReturn(
  organizationId: string, returnId: string, actorUserId: string, input: ReturnDecision,
) {
  const [payments, receivables] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS" }),
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES" }),
  ]);
  if (!payments.canApprove || !receivables.canApprove) throw conflict("RETAIL_OMNICHANNEL_RETURN_VALIDATOR_REQUIRED", 403);
  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailOmnichannelReturn" WHERE id = ${returnId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterpriseRetailOmnichannelReturn.findFirst({ where: { organizationId, id: returnId } });
    if (!current) throw conflict("RETAIL_OMNICHANNEL_RETURN_NOT_FOUND", 404);
    if (current.validatorUserId !== actorUserId || current.requestedByUserId === actorUserId) {
      throw conflict("RETAIL_OMNICHANNEL_RETURN_VALIDATOR_REQUIRED", 403);
    }
    if (current.status !== "PENDING_APPROVAL" || current.revision !== input.revision) {
      throw conflict("RETAIL_OMNICHANNEL_RETURN_CONFLICT");
    }
    const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.enterpriseRetailOmnichannelReturn.update({ where: { id: current.id },
      data: { status, approvedAt: status === "APPROVED" ? new Date() : null,
        approvedByUserId: status === "APPROVED" ? actorUserId : null,
        decisionReason: input.reason, revision: { increment: 1 } }, include: { lines: true } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseRetailOmnichannelReturn", entityId: returnId,
      eventType: `RETAIL_OMNICHANNEL_RETURN_${status}`, summary: `Retour ${updated.number} ${status === "APPROVED" ? "approuvé" : "refusé"}`,
      actorUserId, fromStatus: current.status, toStatus: status, metadataJson: { decisionReason: input.reason } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

/** Resumable financial preparation. Never approve a payment or credit note on behalf of the validator. */
export async function prepareRetailOmnichannelReturnFinance(organizationId: string, returnId: string, actorUserId: string, revision: number) {
  await assertReturnFinanceAccess(organizationId, actorUserId, "PREPARE");
  const current = await prisma.enterpriseRetailOmnichannelReturn.findFirst({ where: { organizationId, id: returnId } });
  if (!current) throw conflict("RETAIL_OMNICHANNEL_RETURN_NOT_FOUND", 404);
  if (current.status === "FINANCE_PENDING") return { retailReturn: current, idempotent: true };
  if (current.status !== "APPROVED" || current.revision !== revision || actorUserId === current.validatorUserId) {
    throw conflict("RETAIL_OMNICHANNEL_RETURN_CONFLICT");
  }
  const source = await prisma.enterprisePayment.findFirst({ where: {
    organizationId, id: current.sourcePaymentId, status: { in: ["CONFIRMED", "RECONCILED"] },
    direction: "INBOUND", paymentType: "CUSTOMER_PAYMENT", businessPartyId: {
      not: null,
    },
  } });
  const order = await prisma.enterpriseSalesOrder.findFirst({ where: { organizationId, id: current.salesOrderId } });
  if (!source?.financialAccountId || !order || source.businessPartyId !== order.businessPartyId ||
      source.currencyCode !== current.currencyCode) throw conflict("RETAIL_OMNICHANNEL_RETURN_PAID_SOURCE_REQUIRED");
  const paymentKey = `retail-omnichannel-return:${returnId}:refund`;
  let payment = await prisma.enterprisePayment.findFirst({ where: { organizationId, idempotencyKey: paymentKey } });
  if (!payment) {
    payment = await createEnterprisePayment(organizationId, actorUserId, {
      direction: "OUTBOUND", paymentType: "REFUND",
      methodType: source.methodType as "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CARD" | "CHEQUE",
      financialAccountId: source.financialAccountId,
      businessPartyId: order.businessPartyId,
      currencyCode: current.currencyCode,
      amount: current.refundAmount.toFixed(), paymentDate: new Date(), reference: current.number,
      idempotencyKey: paymentKey,
    });
  }
  if (payment.status === "DRAFT") {
    payment = await submitPaymentForAssignedApproval(organizationId, payment.id, payment.initiatedByUserId,
      { revision: payment.revision, approverUserId: current.validatorUserId, reason: current.reason });
  }
  if (!["PENDING_APPROVAL", "APPROVED", "CONFIRMED", "RECONCILED"].includes(payment.status) ||
      !payment.amount.equals(current.refundAmount) || payment.businessPartyId !== order.businessPartyId) {
    throw conflict("RETAIL_OMNICHANNEL_RETURN_FINANCE_CONFLICT");
  }
  const creditReason = `Retail omnichannel return ${current.id}: ${current.reason}`.slice(0, 1000);
  let credit = await prepareSalesCreditNoteForRefundAmount(organizationId, current.salesInvoiceId,
    actorUserId, creditReason, current.refundAmount);
  if (credit.status === "DRAFT") {
    credit = await submitSalesCreditNoteForAssignedApproval(organizationId, credit.id, credit.createdByUserId,
      { revision: credit.revision, approverUserId: current.validatorUserId, reason: current.reason });
  }
  if (!["PENDING_APPROVAL", "APPROVED", "POSTED"].includes(credit.status) ||
      !credit.grandTotal.equals(current.refundAmount)) throw conflict("RETAIL_OMNICHANNEL_RETURN_FINANCE_CONFLICT");

  const changed = await prisma.enterpriseRetailOmnichannelReturn.updateMany({
    where: { id: returnId, organizationId, status: "APPROVED", revision },
    data: { refundPaymentId: payment.id, salesCreditNoteId: credit.id, preparedByUserId: payment.initiatedByUserId,
      status: "FINANCE_PENDING", revision: { increment: 1 } },
  });
  if (changed.count !== 1) throw conflict("RETAIL_OMNICHANNEL_RETURN_CONFLICT");
  return { retailReturn: await prisma.enterpriseRetailOmnichannelReturn.findFirstOrThrow({ where: { id: returnId, organizationId }, include: { lines: true } }), idempotent: false };
}

/** Finance is settled first; stock and quota are finalized atomically and idempotently afterward. */
export async function settleRetailOmnichannelReturnFinance(organizationId: string, returnId: string, actorUserId: string,
  input: { revision: number; receivedAndInspected: true; inspectionNotes: string }) {
  await assertReturnFinanceAccess(organizationId, actorUserId, "SETTLE");
  const initial = await prisma.enterpriseRetailOmnichannelReturn.findFirst({ where: { organizationId, id: returnId } });
  if (!initial) throw conflict("RETAIL_OMNICHANNEL_RETURN_NOT_FOUND", 404);
  if (initial.status === "COMPLETED") return { retailReturn: initial, idempotent: true };
  if (initial.status !== "FINANCE_PENDING" || initial.revision !== input.revision || !initial.refundPaymentId || !initial.salesCreditNoteId ||
      actorUserId === initial.requestedByUserId || actorUserId === initial.approvedByUserId) {
    throw conflict("RETAIL_OMNICHANNEL_RETURN_CONFLICT");
  }
  const [invoice, payment, credit] = await Promise.all([
    prisma.enterpriseSalesInvoice.findFirst({ where: { organizationId, id: initial.salesInvoiceId }, include: { receivable: true } }),
    prisma.enterprisePayment.findFirst({ where: { organizationId, id: initial.refundPaymentId } }),
    prisma.enterpriseSalesCreditNote.findFirst({ where: { organizationId, id: initial.salesCreditNoteId } }),
  ]);
  if (!invoice?.receivable || !payment || !credit || credit.salesInvoiceId !== invoice.id ||
      !credit.grandTotal.equals(initial.refundAmount) || !payment.amount.equals(initial.refundAmount) ||
      payment.direction !== "OUTBOUND" || payment.paymentType !== "REFUND" ||
      payment.businessPartyId !== invoice.businessPartyId || payment.currencyCode !== invoice.currencyCode ||
      !["APPROVED", "CONFIRMED", "RECONCILED"].includes(payment.status) ||
      !["APPROVED", "POSTED"].includes(credit.status) ||
      payment.approvedByUserId !== initial.validatorUserId || credit.approvedByUserId !== initial.validatorUserId) {
    throw conflict("RETAIL_OMNICHANNEL_RETURN_FINANCE_CONFLICT");
  }
  if (actorUserId === payment.initiatedByUserId || actorUserId === credit.createdByUserId ||
      actorUserId === initial.preparedByUserId) throw conflict("RETAIL_OMNICHANNEL_RETURN_SETTLEMENT_SELF_APPROVAL", 403);
  if (payment.status === "APPROVED") {
    await reverseCustomerPaymentAllocationsForRefundAmount(organizationId, invoice.receivable.id,
      payment.id, actorUserId, initial.reason, initial.refundAmount, initial.sourcePaymentId);
  }
  if (credit.status === "APPROVED") {
    await assertSalesCreditNoteStillPostable(organizationId, credit.id, credit.revision);
    await postApprovedSalesCreditNote(organizationId, credit.id, actorUserId, credit.revision);
  }
  await markCustomerRefundFinancialInverseReady(organizationId, payment.id, credit.id, actorUserId);
  const refreshedPayment = await prisma.enterprisePayment.findFirstOrThrow({ where: { organizationId, id: payment.id } });
  if (refreshedPayment.status === "APPROVED") {
    await confirmCustomerRefundPayment(organizationId, payment.id, actorUserId,
      { revision: refreshedPayment.revision, reason: initial.reason });
  }
  await consumeCustomerPaymentRefundAvailability(organizationId, payment.id, actorUserId);

  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesOrder" WHERE id = ${initial.salesOrderId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailOmnichannelReturn" WHERE id = ${returnId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const [current, order] = await Promise.all([
      tx.enterpriseRetailOmnichannelReturn.findFirst({ where: { id: returnId, organizationId }, include: { lines: true } }),
      tx.enterpriseSalesOrder.findFirst({ where: { id: initial.salesOrderId, organizationId, archivedAt: null }, include: { items: true, fulfillments: true } }),
    ]);
    if (!current || !order) throw conflict("RETAIL_OMNICHANNEL_RETURN_NOT_FOUND", 404);
    if (current.status === "COMPLETED") return { retailReturn: current, idempotent: true };
    if (current.status !== "FINANCE_PENDING" || current.revision !== input.revision || !input.receivedAndInspected || input.inspectionNotes.trim().length < 5) throw conflict("RETAIL_OMNICHANNEL_RETURN_CONFLICT");
    const confirmedPayment = await tx.enterprisePayment.findFirst({ where: { id: payment.id, organizationId, status: { in: ["CONFIRMED", "RECONCILED"] } } });
    const postedCredit = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: credit.id, organizationId, status: "POSTED" } });
    if (!confirmedPayment || !postedCredit) throw conflict("RETAIL_OMNICHANNEL_RETURN_FINANCE_CONFLICT");

    for (const line of current.lines) {
      if (line.stockDisposition !== "RESTOCK") continue;
      const source = order.items.find((item) => item.id === line.salesOrderItemId);
      if (!source?.catalogItemId) throw conflict("RETAIL_OMNICHANNEL_RETURN_STOCK_INVALID");
      const fulfillmentIds = order.fulfillments.map((fulfillment) => fulfillment.id);
      const movements = await tx.enterpriseStockMovement.findMany({
        where: { organizationId, sourceEntityType: "EnterpriseFulfillment", sourceEntityId: { in: fulfillmentIds },
          sourceLineId: source.id, movementType: "SALE_FULFILLMENT", direction: "OUT" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const previous = await tx.enterpriseRetailOmnichannelReturnLine.aggregate({
        where: { organizationId, salesOrderItemId: source.id, retailReturn: { salesOrderId: order.id, status: "COMPLETED" } },
        _sum: { quantity: true },
      });
      let skip = d(previous._sum.quantity || 0);
      let remaining = d(line.quantity);
      for (const movement of movements) {
        if (remaining.lte(0)) break;
        if (skip.gte(movement.quantity)) { skip = skip.minus(movement.quantity); continue; }
        const available = d(movement.quantity).minus(skip);
        skip = d(0);
        const portion = Prisma.Decimal.min(remaining, available);
        const stockReturn = await applyStockMovementTx(tx, organizationId, actorUserId, {
          inventoryItemId: movement.inventoryItemId, warehouseId: movement.warehouseId,
          storageLocationId: movement.storageLocationId, stockLotId: movement.stockLotId,
          movementType: "RETURN_IN", direction: "IN", quantity: Number(portion),
          sourceEntityType: "EnterpriseRetailOmnichannelReturn", sourceEntityId: current.id,
          sourceLineId: line.id, idempotencyKey: `omni-return:${current.id}:${line.id}:${movement.id}`,
          reason: current.reason,
        });
        await valueRetailInventoryReturnTx(tx, organizationId, stockReturn.movement.id, actorUserId,
          { originalStockMovementId: movement.id });
        remaining = remaining.minus(portion);
      }
      if (!remaining.isZero()) throw conflict("RETAIL_OMNICHANNEL_RETURN_STOCK_INVALID");
    }

    const updated = await tx.enterpriseRetailOmnichannelReturn.update({ where: { id: current.id },
      data: { status: "COMPLETED", settledByUserId: actorUserId, inspectedByUserId: actorUserId,
        inspectedAt: new Date(), inspectionNotes: input.inspectionNotes,
        completedAt: new Date(), revision: { increment: 1 } },
      include: { lines: true } });
    const previousLines = await tx.enterpriseRetailOmnichannelReturnLine.findMany({
      where: { organizationId, retailReturn: { salesOrderId: order.id, status: "COMPLETED" } },
      select: { salesOrderItemId: true, quantity: true },
    });
    const fullyReturned = order.items.every((item) => {
      const sum = previousLines.filter((line) => line.salesOrderItemId === item.id)
        .reduce((total, line) => total.plus(line.quantity), d(0));
      return sum.eq(item.quantityOrdered);
    });
    // Finance refund is already confirmed. Only now release the proportional
    // cashback liability from the canonical Store Credit ledger.
    await reverseRetailOmnichannelCashbackTx({
      tx, organizationId, orderId: order.id, returnId: current.id,
      actorUserId, fullyReturned,
    });
    if (fullyReturned) {
      await tx.enterpriseRelationshipBenefitUsage.updateMany({
        where: { organizationId, effectEntityType: "EnterpriseSalesOrder", effectEntityId: order.id,
          executionMode: "AUTO_RETAIL_OMNICHANNEL", status: "CONSUMED" },
        data: { status: "CANCELLED", cancelledAt: new Date(), revision: { increment: 1 } },
      });
    }
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseRetailOmnichannelReturn", entityId: current.id,
      eventType: "RETAIL_OMNICHANNEL_RETURN_COMPLETED", summary: `Retour ${current.number} remboursé et enregistré`,
      actorUserId, fromStatus: "FINANCE_PENDING", toStatus: "COMPLETED",
      metadataJson: { salesOrderId: order.id, refundPaymentId: payment.id, salesCreditNoteId: credit.id,
        refundAmount: current.refundAmount.toFixed(), fullyReturned },
    });
    return { retailReturn: updated, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}
