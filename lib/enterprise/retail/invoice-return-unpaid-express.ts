import { Prisma } from "@prisma/client";
import { financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { assertRetailInvoiceReturnSettlementReadinessTx } from "@/lib/enterprise/retail/invoice-return-settlement-preflight";
import { readRetailInvoiceReturnPolicy, readRetailInvoiceReturnPolicySnapshot } from "@/lib/enterprise/retail/invoice-return-policy";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { RETAIL_OWNER_ROLES, siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";

/**
 * The only safe "auto post" subset of #1222: a posted but FULLY UNPAID
 * invoice whose stock has NOT left the warehouse. The approved return
 * eliminates a receivable, creates one credit note and releases reservations.
 * There is no customer-money liability and NO refund/payment/cash movement.
 *
 * The caller owns the same SERIALIZABLE transaction that decides the return.
 * This function must never start another transaction or perform an external
 * payment. For partly collected, physically fulfilled or any payable return,
 * return null and preserve the existing independently approved Finance flow.
 */
export async function settleUnpaidRetailInvoiceCreditTx(
  tx: Prisma.TransactionClient, organizationId: string, invoiceId: string,
  returnRequestId: string, actorUserId: string,
) {
  const request = await tx.enterpriseRetailInvoiceReturnRequest.findFirst({
    where: { organizationId, id: returnRequestId, checkout: { salesInvoiceId: invoiceId } },
    include: {
      checkout: {
        include: { invoice: true },
      },
      lines: {
        include: { checkoutLine: { include: { invoiceItem: true } } },
      },
    },
  });
  if (!request || request.status !== "APPROVED" ||
      request.decidedByUserId !== actorUserId ||
      request.approverUserId !== actorUserId ||
      request.salesCreditNoteId || request.refundPaymentId) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_FINANCE_CONFLICT", 409);
  }
  const snapshot = readRetailInvoiceReturnPolicySnapshot(request.returnPolicySnapshot);
  const currentConfig = await tx.enterpriseRetailConfiguration.findUnique({
    where: { organizationId }, select: { settingsJson: true },
  });
  const policy = readRetailInvoiceReturnPolicy(currentConfig?.settingsJson);
  if (snapshot.mode !== "SIMPLIFIED" || !snapshot.autoPostCreditNote ||
      policy.mode !== "SIMPLIFIED" || !policy.autoPostCreditNote) return null;
  const invoice = request.checkout.invoice;
  if (!invoice.amountPaid.isZero() || request.checkout.stockPostedAt) return null;
  if (request.checkout.siteId === "") return null;

  const member = await tx.organizationMember.findFirst({
    where: { organizationId, userId: actorUserId, status: "ACTIVE", removedAt: null },
    select: { role: true },
  });
  if (!member) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  if (!RETAIL_OWNER_ROLES.has(member.role)) {
    const assignment = await tx.enterpriseRetailSiteAssignment.findUnique({
      where: { organizationId_siteId_userId: { organizationId, siteId: request.checkout.siteId, userId: actorUserId } },
      select: { isActive: true, roleCode: true, permissionsJson: true },
    });
    const rights = assignment?.isActive ? siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson) : [];
    if (!assignment?.isActive || assignment.roleCode !== "MANAGER" ||
        !rights.includes("APPROVE_INVOICE_RETURN") || !rights.includes("REQUEST_INVOICE_RETURN")) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE", 403);
    }
  }

  const plan = await assertRetailInvoiceReturnSettlementReadinessTx(tx, organizationId, invoiceId, returnRequestId);
  if (!plan.payoutAmount.isZero() || plan.stockSourcePlan.length) return null;
  if (!invoice.amountPaid.isZero() || invoice.outstandingAmount.lessThan(plan.refundAmount)) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_SETTLEMENT_PAYOUT_CONFLICT", 409);
  }

  const currentCredits = await tx.enterpriseSalesCreditNote.findMany({
    where: { organizationId, salesInvoiceId: invoiceId, status: { notIn: ["CANCELLED", "REJECTED"] } },
    select: { grandTotal: true },
  });
  const reserved = currentCredits.reduce((sum, row) => sum.plus(row.grandTotal), new Prisma.Decimal(0));
  if (reserved.plus(plan.refundAmount).greaterThan(invoice.grandTotal)) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_CREDIT_EXCEEDS_INVOICE", 409);
  }
  if (request.lines.some((line) => line.refundNetAmount === null || line.refundTaxAmount === null)) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_SETTLEMENT_TAX_SPLIT_INVALID", 409);
  }
  const subtotal = request.lines.reduce((sum, line) => sum.plus(line.refundNetAmount!), new Prisma.Decimal(0));
  const taxTotal = request.lines.reduce((sum, line) => sum.plus(line.refundTaxAmount!), new Prisma.Decimal(0));
  if (!subtotal.plus(taxTotal).equals(plan.refundAmount)) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_SETTLEMENT_TAX_SPLIT_INVALID", 409);
  }
  // Express approval is granted by an immutable RETAIL policy and recorded
  // with the SAME designated decision maker. It is not represented as an
  // independent Finance approval or an unverified payment.
  const now = new Date();
  const credit = await tx.enterpriseSalesCreditNote.create({
    data: {
      organizationId, number: financeReference("CN"), salesInvoiceId: invoiceId,
      reason: `Retour Retail ${request.number}: ${request.reason}`.slice(0, 1000),
      creditDate: now, currencyCode: invoice.currencyCode,
      subtotal, taxTotal, grandTotal: plan.refundAmount,
      status: "APPROVED", createdByUserId: actorUserId,
      approvedByUserId: actorUserId, approvedAt: now,
      items: { create: request.lines.map((line) => ({
        sourceInvoiceItemId: line.checkoutLine.invoiceItemId,
        description: line.checkoutLine.invoiceItem.description,
        quantity: line.quantity,
        unitPrice: line.refundAmount.div(line.quantity),
        netAmount: line.refundNetAmount!, taxAmount: line.refundTaxAmount!,
        totalAmount: line.refundAmount,
      })) },
    },
  });
  await publishFinanceEvent(tx, {
    organizationId, entityType: "EnterpriseSalesCreditNote", entityId: credit.id,
    eventType: "SALES_CREDIT_NOTE_CREATED",
    summary: "Retail unpaid invoice credit created by explicitly authorized return decision",
    actorUserId, toStatus: "APPROVED",
    metadataJson: { invoiceId, returnRequestId: request.id, creditAmount: credit.grandTotal.toFixed(2),
      payoutAmount: "0.00", expressPolicy: true, policyVersion: snapshot.version },
  });
  const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "SALES_CREDIT_NOTE_POSTED",
    sourceEntityType: "EnterpriseSalesCreditNote", sourceEntityId: credit.id,
  });
  const receivable = await tx.enterpriseReceivable.findFirst({
    where: { organizationId, id: plan.receivableId },
    select: { id: true, outstandingAmount: true, creditedAmount: true, salesInvoiceId: true },
  });
  if (!receivable || receivable.salesInvoiceId !== invoiceId ||
      !receivable.outstandingAmount.equals(invoice.outstandingAmount) ||
      plan.refundAmount.greaterThan(receivable.outstandingAmount)) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_RETURN_CREDIT_EXCEEDS_INVOICE", 409);
  }
  const nextOutstanding = receivable.outstandingAmount.minus(credit.grandTotal);
  await tx.enterpriseReceivableAllocation.create({ data: {
    organizationId, receivableId: receivable.id, sourceType: "SALES_CREDIT_NOTE",
    sourceId: credit.id, amount: credit.grandTotal, allocationDate: credit.creditDate,
    createdByUserId: actorUserId,
  } });
  await tx.enterpriseReceivable.update({ where: { id: receivable.id }, data: {
    creditedAmount: { increment: credit.grandTotal }, outstandingAmount: nextOutstanding,
    status: nextOutstanding.isZero() ? "CLOSED" : "OPEN",
  } });
  await tx.enterpriseSalesInvoice.update({ where: { id: invoiceId }, data: {
    amountCredited: { increment: credit.grandTotal },
    outstandingAmount: nextOutstanding,
    status: nextOutstanding.isZero() ? "CREDIT_NOTE" : invoice.status,
    revision: { increment: 1 },
  } });
  await tx.enterpriseSalesCreditNote.update({
    where: { id: credit.id }, data: { status: "POSTED", postedAt: now, revision: { increment: 1 } },
  });
  await publishFinanceEvent(tx, {
    organizationId, entityType: "EnterpriseSalesCreditNote", entityId: credit.id,
    eventType: "SALES_CREDIT_NOTE_POSTED",
    summary: "Unpaid Retail credit posted without any customer refund",
    actorUserId, fromStatus: "APPROVED", toStatus: "POSTED",
    metadataJson: { invoiceId, returnRequestId: request.id, receivableId: receivable.id,
      journalEntryId: posting.entry.id, payoutAmount: "0.00", expressPolicy: true },
  });
  const completed = await tx.enterpriseRetailInvoiceReturnRequest.update({
    where: { id: request.id, organizationId },
    data: {
      status: "COMPLETED", refundPayoutAmount: new Prisma.Decimal(0),
      salesCreditNoteId: credit.id, preparedByUserId: actorUserId, preparedAt: now,
      financeApproverUserId: actorUserId, settledByUserId: actorUserId,
      completedAt: now, revision: { increment: 1 },
    },
  });
  await publishFinanceEvent(tx, {
    organizationId, entityType: "EnterpriseRetailInvoiceReturnRequest", entityId: request.id,
    eventType: "RETAIL_INVOICE_RETURN_COMPLETED",
    summary: "Retail unpaid invoice closed with a canonical credit, no cash settlement",
    actorUserId, fromStatus: "APPROVED", toStatus: "COMPLETED",
    metadataJson: { invoiceId, creditNoteId: credit.id, creditAmount: credit.grandTotal.toFixed(2),
      payoutAmount: "0.00", nonStocked: true, expressPolicy: true },
  });
  return completed;
}
