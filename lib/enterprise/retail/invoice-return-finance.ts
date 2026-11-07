import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createAccountingApprovalAssignment } from "@/lib/enterprise/accounting/accounting-approval-service";
import {
  confirmCustomerRefundPaymentTx,
  markCustomerRefundFinancialInverseReadyTx,
  reverseCustomerPaymentAllocationsForRefundAmountTx,
} from "@/lib/enterprise/accounting/customer-refund-service";
import { financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { createEnterprisePaymentTx } from "@/lib/enterprise/accounting/payments-service";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { assertRetailInvoiceReturnSettlementReadinessTx } from "@/lib/enterprise/retail/invoice-return-settlement-preflight";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";
import { valueRetailInventoryReturnTx } from "@/lib/enterprise/retail/accounting";
import { prisma } from "@/lib/prisma";

export const retailInvoiceReturnFinancePrepareSchema = z.object({
  revision: z.number().int().positive(),
}).strict();
export const retailInvoiceReturnFinanceSettlementSchema = z.object({
  revision: z.number().int().positive(),
  reason: z.string().trim().min(4).max(1000),
}).strict();

const fail = (code: string, status = 409) => new EnterpriseRetailError(code, status);

/** The Finance role is independent of the store's Retail role. A former
 * store-assigned staff member cannot use a global Finance grant to bypass a
 * revoked site assignment, even when replaying an already prepared return. */
async function requireFinancePreparer(organizationId: string, actorUserId: string) {
  const [payments, receivables] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS" }),
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES" }),
  ]);
  if (!payments.canCreate || !payments.canSubmit || !receivables.canCreate || !receivables.canSubmit) {
    throw fail("RETAIL_INVOICE_RETURN_FINANCE_PERMISSION_REQUIRED", 403);
  }
}

async function requireFinanceSettler(organizationId: string, actorUserId: string) {
  const [payments, receivables] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_PAYMENTS" }),
    resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES" }),
  ]);
  if (!payments.canWrite || !receivables.canManage) {
    throw fail("RETAIL_INVOICE_RETURN_FINANCE_PERMISSION_REQUIRED", 403);
  }
}

export async function prepareRetailInvoiceReturnFinance(
  organizationId: string, invoiceId: string, requestId: string,
  actorUserId: string, input: z.infer<typeof retailInvoiceReturnFinancePrepareSchema>,
) {
  await requireFinancePreparer(organizationId, actorUserId);
  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    const config = await tx.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { settingsJson: true },
    });
    const settings = config?.settingsJson;
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || settings.invoiceCheckoutEnabled !== true) {
      throw fail("RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE", 403);
    }
    // Lock in the same order as the canonical invoice/payment path. A second
    // preparer racing this call observes FINANCE_PENDING and cannot duplicate
    // either Finance document.
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    await tx.$executeRaw(Prisma.sql`SELECT r.id FROM "EnterpriseRetailInvoiceReturnRequest" r JOIN "EnterpriseRetailInvoiceCheckout" c ON c.id = r."checkoutId" AND c."organizationId" = r."organizationId" WHERE r.id = ${requestId} AND r."organizationId" = ${organizationId} AND c."salesInvoiceId" = ${invoiceId} FOR UPDATE OF r`);
    const request = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
      where: { organizationId, id: requestId, checkout: { salesInvoiceId: invoiceId } },
      include: { checkout: { select: { siteId: true, invoice: { select: { businessPartyId: true, currencyCode: true } } } },
        lines: { include: { checkoutLine: { include: { invoiceItem: true } } } } },
    });
    if (!request) throw fail("RETAIL_INVOICE_RETURN_NOT_FOUND", 404);
    const allowedSites = await retailFinanceReadSiteScope(organizationId, actorUserId, "COLLECT_PAYMENT", tx);
    if (allowedSites !== null && !allowedSites.includes(request.checkout.siteId)) {
      throw fail("RETAIL_SITE_ACCESS_DENIED", 403);
    }
    if (request.status === "FINANCE_PENDING" && request.refundPaymentId && request.salesCreditNoteId &&
        request.preparedByUserId === actorUserId && request.revision === input.revision + 1) {
      return { request, idempotent: true };
    }
    if (request.status !== "APPROVED" || request.revision !== input.revision ||
        actorUserId === request.approverUserId || actorUserId === request.requestedByUserId) {
      throw fail("RETAIL_INVOICE_RETURN_FINANCE_CONFLICT");
    }
    const preview = await assertRetailInvoiceReturnSettlementReadinessTx(tx, organizationId, invoiceId, requestId);
    // One Finance refund is bound to one account. Fail closed if the invoice
    // was paid from several accounts; a future split-refund adapter must
    // explicitly model multiple independently approved payouts.
    const accountIds = new Set(preview.financeSourcePlan.map((source) => source.financialAccountId));
    if (accountIds.size !== 1 || preview.financeSourcePlan.length === 0) {
      throw fail("RETAIL_INVOICE_RETURN_MULTIPLE_REFUND_ACCOUNTS_UNSUPPORTED");
    }
    const payments = await tx.enterprisePayment.findMany({
      where: { organizationId, id: { in: [...new Set(preview.financeSourcePlan.map((source) => source.paymentId))] } },
      select: { id: true, methodType: true, financialAccountId: true, businessPartyId: true,
        currencyCode: true, status: true, paymentType: true, direction: true },
    });
    const methods = new Set(payments.map((payment) => payment.methodType));
    const sourceAccountId = [...accountIds][0];
    const method = payments[0]?.methodType;
    if (methods.size !== 1 || payments.length !== new Set(preview.financeSourcePlan.map((source) => source.paymentId)).size ||
        !method || !["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CHEQUE"].includes(method) ||
        payments.some((payment) => payment.financialAccountId !== sourceAccountId ||
          payment.businessPartyId !== request.checkout.invoice.businessPartyId ||
          payment.currencyCode !== request.checkout.invoice.currencyCode ||
          !["CONFIRMED", "RECONCILED"].includes(payment.status) || payment.paymentType !== "CUSTOMER_PAYMENT" ||
          payment.direction !== "INBOUND")) {
      throw fail("RETAIL_INVOICE_RETURN_FINANCE_SOURCE_MISMATCH");
    }

    // Every credit note reserves invoice creditable value, including drafts
    // awaiting approval. Never credit more than the original paid invoice.
    const credits = await tx.enterpriseSalesCreditNote.findMany({
      where: { organizationId, salesInvoiceId: invoiceId, status: { notIn: ["CANCELLED", "REJECTED"] } },
      select: { grandTotal: true },
    });
    const reserved = credits.reduce((total, credit) => total.plus(credit.grandTotal), new Prisma.Decimal(0));
    const invoice = await tx.enterpriseSalesInvoice.findFirst({
      where: { organizationId, id: invoiceId }, select: { grandTotal: true, currencyCode: true },
    });
    if (!invoice || reserved.plus(preview.refundAmount).greaterThan(invoice.grandTotal)) {
      throw fail("RETAIL_INVOICE_RETURN_CREDIT_EXCEEDS_INVOICE");
    }
    if (request.lines.some((line) => line.refundNetAmount === null || line.refundTaxAmount === null)) {
      throw fail("RETAIL_INVOICE_RETURN_SETTLEMENT_TAX_SPLIT_INVALID");
    }
    const subtotal = request.lines.reduce((total, line) => total.plus(line.refundNetAmount!), new Prisma.Decimal(0));
    const taxTotal = request.lines.reduce((total, line) => total.plus(line.refundTaxAmount!), new Prisma.Decimal(0));
    if (!subtotal.plus(taxTotal).equals(preview.refundAmount)) {
      throw fail("RETAIL_INVOICE_RETURN_SETTLEMENT_TAX_SPLIT_INVALID");
    }
    const payment = await createEnterprisePaymentTx(tx, organizationId, actorUserId, {
      direction: "OUTBOUND", paymentType: "REFUND", methodType: method as "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | "CARD" | "CHEQUE",
      financialAccountId: sourceAccountId,
      businessPartyId: request.checkout.invoice.businessPartyId,
      currencyCode: invoice.currencyCode, amount: preview.refundAmount.toFixed(2),
      paymentDate: new Date(), reference: request.number,
      idempotencyKey: `retail-invoice-return:${request.id}:refund`,
    });
    const credit = await tx.enterpriseSalesCreditNote.create({
      data: {
        organizationId, number: financeReference("CN"), salesInvoiceId: invoiceId,
        reason: `Retour Retail ${request.number}: ${request.reason}`.slice(0, 1000),
        creditDate: new Date(), currencyCode: invoice.currencyCode,
        subtotal, taxTotal, grandTotal: preview.refundAmount, createdByUserId: actorUserId,
        items: { create: request.lines.map((line) => ({
          organizationId, description: line.checkoutLine.invoiceItem.description,
          quantity: line.quantity, unitPrice: line.refundAmount.div(line.quantity),
          netAmount: line.refundNetAmount!, taxAmount: line.refundTaxAmount!, totalAmount: line.refundAmount,
        })) },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId, entityType: "EnterpriseSalesCreditNote", entityId: credit.id,
      eventType: "SALES_CREDIT_NOTE_CREATED", summary: `Credit note ${credit.number} prepared for verified Retail invoice return`,
      actorUserId, toStatus: "DRAFT", metadataJson: { invoiceId, returnRequestId: request.id,
        amount: credit.grandTotal.toFixed(), currency: credit.currencyCode, source: "RETAIL_INVOICE_RETURN" },
    });

    // Two real, independently approved Finance assignments, committed in the
    // same transaction as the draft documents and the Retail binding.
    const paymentApproval = await createAccountingApprovalAssignment(tx, {
      organizationId, targetEntityType: "EnterprisePayment", targetEntityId: payment.id,
      requesterUserId: actorUserId, approverUserId: request.approverUserId,
    });
    await tx.enterprisePayment.update({ where: { id: payment.id },
      data: { status: "PENDING_APPROVAL", revision: { increment: 1 } } });
    await tx.enterprisePaymentEvent.create({ data: {
      organizationId, paymentId: payment.id, actorUserId, eventType: "SUBMIT",
      summary: "Refund payment submitted for independent Finance approval",
      metadataJson: { approvalId: paymentApproval.id, returnRequestId: request.id },
    } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterprisePayment", entityId: payment.id,
      eventType: "PAYMENT_SUBMIT", summary: `Payment ${payment.number}: SUBMIT`, actorUserId,
      fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL",
      metadataJson: { approvalId: paymentApproval.id, approverUserId: request.approverUserId, returnRequestId: request.id },
    });
    const creditApproval = await createAccountingApprovalAssignment(tx, {
      organizationId, targetEntityType: "EnterpriseSalesCreditNoteApproval", targetEntityId: credit.id,
      requesterUserId: actorUserId, approverUserId: request.approverUserId,
    });
    await tx.enterpriseSalesCreditNote.update({ where: { id: credit.id },
      data: { status: "PENDING_APPROVAL", revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesCreditNote", entityId: credit.id,
      eventType: "SALES_CREDIT_NOTE_SUBMITTED", summary: `Credit note ${credit.number} submitted for approval`,
      actorUserId, fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL",
      metadataJson: { approvalId: creditApproval.id, approverUserId: request.approverUserId, returnRequestId: request.id },
    });

    const updated = await tx.enterpriseRetailInvoiceReturnRequest.update({
      where: { id: request.id, organizationId }, data: {
        status: "FINANCE_PENDING", refundPaymentId: payment.id, salesCreditNoteId: credit.id,
        preparedByUserId: actorUserId, preparedAt: new Date(), revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId, entityType: "EnterpriseRetailInvoiceReturnRequest", entityId: request.id,
      eventType: "RETAIL_INVOICE_RETURN_FINANCE_PREPARED", summary: "Retail invoice return bound to two Finance approvals",
      actorUserId, fromStatus: "APPROVED", toStatus: "FINANCE_PENDING",
      metadataJson: { invoiceId, siteId: preview.siteId, paymentId: payment.id,
        creditNoteId: credit.id, amount: preview.refundAmount.toFixed(2) },
    });
    return { request: updated, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 45000 }));
}

/** ONE serializable commit: allocation/journal inverse, credit note posting,
 * outbound treasury and cash, inventory/valuation and completed return.
 * A failure anywhere rolls the entire refund back, including the stock.
 * No route is allowed to settle an unbound, unapproved Finance document. */
export async function settleRetailInvoiceReturnFinance(
  organizationId: string, invoiceId: string, requestId: string, actorUserId: string,
  input: z.infer<typeof retailInvoiceReturnFinanceSettlementSchema>,
) {
  await requireFinanceSettler(organizationId, actorUserId);
  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    const config = await tx.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { settingsJson: true },
    });
    const settings = config?.settingsJson;
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || settings.invoiceCheckoutEnabled !== true) {
      throw fail("RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE", 403);
    }
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    await tx.$executeRaw(Prisma.sql`SELECT r.id FROM "EnterpriseRetailInvoiceReturnRequest" r JOIN "EnterpriseRetailInvoiceCheckout" c ON c.id = r."checkoutId" AND c."organizationId" = r."organizationId" WHERE r.id = ${requestId} AND r."organizationId" = ${organizationId} AND c."salesInvoiceId" = ${invoiceId} FOR UPDATE OF r`);
    const request = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
      where: { organizationId, id: requestId, checkout: { salesInvoiceId: invoiceId } },
      include: { checkout: { select: { siteId: true } } },
    });
    if (!request) throw fail("RETAIL_INVOICE_RETURN_NOT_FOUND", 404);
    const allowedSites = await retailFinanceReadSiteScope(organizationId, actorUserId, "COLLECT_PAYMENT", tx);
    if (allowedSites !== null && !allowedSites.includes(request.checkout.siteId)) {
      throw fail("RETAIL_SITE_ACCESS_DENIED", 403);
    }
    if (request.status === "COMPLETED" && request.settledByUserId === actorUserId &&
        request.revision === input.revision + 1) {
      return { request, idempotent: true };
    }
    if (request.status !== "FINANCE_PENDING" || request.revision !== input.revision ||
        !request.refundPaymentId || !request.salesCreditNoteId || !request.preparedByUserId ||
        [request.requestedByUserId, request.inspectedByUserId, request.approverUserId,
          request.preparedByUserId].includes(actorUserId)) {
      throw fail("RETAIL_INVOICE_RETURN_FINANCE_CONFLICT");
    }
    const plan = await assertRetailInvoiceReturnSettlementReadinessTx(
      tx, organizationId, invoiceId, requestId, "FINANCE_PENDING",
    );
    const [payment, credit, invoice, receivable] = await Promise.all([
      tx.enterprisePayment.findFirst({ where: { organizationId, id: request.refundPaymentId } }),
      tx.enterpriseSalesCreditNote.findFirst({ where: { organizationId, id: request.salesCreditNoteId } }),
      tx.enterpriseSalesInvoice.findFirst({ where: { organizationId, id: invoiceId } }),
      tx.enterpriseReceivable.findFirst({ where: { organizationId, id: plan.receivableId } }),
    ]);
    const accountIds = new Set(plan.financeSourcePlan.map((source) => source.financialAccountId));
    if (!payment || !credit || !invoice || !receivable ||
        accountIds.size !== 1 || !accountIds.has(payment.financialAccountId || "") ||
        payment.status !== "APPROVED" || credit.status !== "APPROVED" ||
        payment.approvedByUserId !== request.approverUserId ||
        credit.approvedByUserId !== request.approverUserId ||
        payment.initiatedByUserId !== request.preparedByUserId ||
        credit.createdByUserId !== request.preparedByUserId ||
        payment.direction !== "OUTBOUND" || payment.paymentType !== "REFUND" ||
        payment.businessPartyId !== invoice.businessPartyId ||
        payment.currencyCode !== invoice.currencyCode || credit.currencyCode !== invoice.currencyCode ||
        credit.salesInvoiceId !== invoiceId || !payment.amount.equals(plan.refundAmount) ||
        !credit.grandTotal.equals(plan.refundAmount) ||
        !credit.subtotal.plus(credit.taxTotal).equals(credit.grandTotal) ||
        credit.grandTotal.greaterThan(invoice.grandTotal)) {
      throw fail("RETAIL_INVOICE_RETURN_FINANCE_CONFLICT");
    }
    const account = await tx.enterpriseFinancialAccount.findFirst({
      where: { organizationId, id: payment.financialAccountId!, status: "ACTIVE", archivedAt: null },
      select: { siteId: true, currencyCode: true, operationalBalance: true },
    });
    if (!account || account.siteId !== plan.siteId || account.currencyCode !== plan.currencyCode ||
        account.operationalBalance.lessThan(plan.refundAmount)) {
      throw fail("RETAIL_INVOICE_RETURN_REFUND_ACCOUNT_INSUFFICIENT");
    }
    // The source allocation identifiers are recomputed WITHIN this locked
    // transaction; the Finance helper cannot consume payments from another
    // shop, even if they happen to have earlier allocation timestamps.
    await reverseCustomerPaymentAllocationsForRefundAmountTx(
      tx, organizationId, receivable.id, payment.id, actorUserId, input.reason,
      plan.refundAmount, null, plan.financeSourcePlan.map((source) => source.allocationId),
    );
    const liveReceivable = await tx.enterpriseReceivable.findFirst({
      where: { organizationId, id: receivable.id }, select: { outstandingAmount: true },
    });
    if (!liveReceivable || credit.grandTotal.greaterThan(liveReceivable.outstandingAmount)) {
      throw fail("RETAIL_INVOICE_RETURN_CREDIT_EXCEEDS_INVOICE");
    }
    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: "SALES_CREDIT_NOTE_POSTED",
      sourceEntityType: "EnterpriseSalesCreditNote", sourceEntityId: credit.id,
    });
    const nextOutstanding = liveReceivable.outstandingAmount.minus(credit.grandTotal);
    await tx.enterpriseReceivableAllocation.create({ data: {
      organizationId, receivableId: receivable.id, sourceType: "SALES_CREDIT_NOTE", sourceId: credit.id,
      amount: credit.grandTotal, allocationDate: credit.creditDate, createdByUserId: actorUserId,
    } });
    await tx.enterpriseReceivable.update({ where: { id: receivable.id },
      data: { creditedAmount: { increment: credit.grandTotal }, outstandingAmount: nextOutstanding,
        status: nextOutstanding.isZero() ? "CLOSED" : "OPEN" } });
    await tx.enterpriseSalesInvoice.update({ where: { id: invoiceId }, data: {
      amountCredited: { increment: credit.grandTotal }, outstandingAmount: nextOutstanding,
      status: nextOutstanding.isZero() ? "CREDIT_NOTE" : "PARTIALLY_PAID", revision: { increment: 1 },
    } });
    await tx.enterpriseSalesCreditNote.update({ where: { id: credit.id }, data: {
      status: "POSTED", postedAt: new Date(), revision: { increment: 1 },
    } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesCreditNote", entityId: credit.id,
      eventType: "SALES_CREDIT_NOTE_POSTED", summary: `Credit note ${credit.number} posted`,
      actorUserId, fromStatus: "APPROVED", toStatus: "POSTED",
      metadataJson: { receivableId: receivable.id, journalEntryId: posting.entry.id, returnRequestId: request.id },
    });
    await markCustomerRefundFinancialInverseReadyTx(
      tx, organizationId, payment.id, credit.id, actorUserId, request.id,
    );
    await confirmCustomerRefundPaymentTx(tx, organizationId, payment.id, actorUserId,
      { revision: payment.revision, reason: input.reason });
    let restockedCount = 0;
    for (const source of plan.stockSourcePlan) {
      if (source.stockDisposition !== "RESTOCK") continue;
      const stock = await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: source.inventoryItemId, warehouseId: source.warehouseId,
        storageLocationId: source.storageLocationId, stockLotId: source.stockLotId,
        movementType: "RETURN_IN", direction: "IN", quantity: Number(source.quantity),
        sourceEntityType: "EnterpriseRetailInvoiceReturnRequest",
        sourceEntityId: request.id, sourceLineId: source.returnLineId,
        idempotencyKey: `retail-invoice-return:${request.id}:${source.returnLineId}:${source.originalMovementId}`,
        reason: request.reason,
      });
      await valueRetailInventoryReturnTx(tx, organizationId, stock.movement.id, actorUserId,
        { originalStockMovementId: source.originalMovementId });
      restockedCount += 1;
    }
    const completed = await tx.enterpriseRetailInvoiceReturnRequest.update({
      where: { organizationId, id: request.id }, data: {
        status: "COMPLETED", settledByUserId: actorUserId, completedAt: new Date(), revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId, entityType: "EnterpriseRetailInvoiceReturnRequest", entityId: request.id,
      eventType: "RETAIL_INVOICE_RETURN_COMPLETED",
      summary: "Retail invoice return settled atomically in Finance and Inventory",
      actorUserId, fromStatus: "FINANCE_PENDING", toStatus: "COMPLETED",
      metadataJson: { invoiceId, siteId: plan.siteId, refundPaymentId: payment.id,
        creditNoteId: credit.id, amount: plan.refundAmount.toFixed(2),
        restockedMovementCount: restockedCount,
        nonRestockedLineCount: plan.stockSourcePlan.filter((source) => source.stockDisposition !== "RESTOCK").length },
    });
    return { request: completed, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 }));
}
