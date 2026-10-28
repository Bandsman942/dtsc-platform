import { Prisma } from "@prisma/client";

/**
 * Canonical Finance proof for an omnichannel order. A submitted payment,
 * invoice status, or confirmed order is never sufficient to issue store credit.
 *
 * Called inside the caller's serializable transaction; the caller must lock
 * the order and finance allocation boundaries before mutating the credit ledger.
 */
export async function resolvePaidDeliveredOmnichannelOrderTx(args: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  salesOrderId: string;
}) {
  const { tx, organizationId, salesOrderId } = args;
  const [order, orchestration] = await Promise.all([
    tx.enterpriseSalesOrder.findFirst({
      where: { id: salesOrderId, organizationId, status: "FULFILLED", archivedAt: null },
      select: {
        id: true, businessPartyId: true, currency: true, totalAmount: true,
        fulfilledAt: true, items: { select: { id: true, quantityOrdered: true, quantityFulfilled: true } },
        fulfillments: { select: { id: true, status: true, fulfillmentType: true, proofDocumentId: true, acceptedByCustomerAt: true } },
      },
    }),
    tx.enterpriseRetailOrderOrchestration.findFirst({
      where: { organizationId, salesOrderId, status: "FULFILLED", archivedAt: null },
      select: { id: true, sourceSiteId: true },
    }),
  ]);
  if (!order || !orchestration || !order.fulfilledAt ||
      !order.items.length || !order.fulfillments.length ||
      order.items.some((line) => !line.quantityOrdered.gt(0) || line.quantityFulfilled.lt(line.quantityOrdered)) ||
      order.fulfillments.some((row) => row.status !== "COMPLETED" || row.fulfillmentType !== "PRODUCT_DELIVERY")) return null;
  const hasCustomerAcceptance = order.fulfillments.some((row) => Boolean(row.acceptedByCustomerAt));
  const proofIds = order.fulfillments
    .map((row) => row.proofDocumentId)
    .filter((id): id is string => Boolean(id));
  if (!hasCustomerAcceptance) {
    if (!proofIds.length) return null;
    const document = await tx.enterpriseDocument.findFirst({
      where: {
        organizationId, id: { in: proofIds }, status: "ACTIVE", archivedAt: null,
        sourceEntityType: "EnterpriseSalesOrder", sourceEntityId: order.id,
        currentVersion: { gt: 0 }, versions: { some: { organizationId } },
      },
      select: { id: true },
    });
    if (!document) return null;
  }

  const anyReturn = await tx.enterpriseRetailOmnichannelReturn.count({
    where: { organizationId, salesOrderId, status: { not: "REJECTED" } },
  });
  if (anyReturn) return null;

  // Enforce a unique invoice for the same order, rather than choosing the most
  // convenient one; a posted refund or a duplicate invoice must fail closed.
  const invoices = await tx.enterpriseSalesInvoice.findMany({
    where: {
      organizationId, salesOrderId,
    },
    select: {
      id: true, status: true, businessPartyId: true, currencyCode: true, grandTotal: true, amountCredited: true, issuedAt: true, postedAt: true,
      receivable: {
        select: {
          paymentAllocations: {
            select: {
              amount: true, status: true,
              payment: {
                select: {
                  status: true, direction: true, paymentType: true,
                  businessPartyId: true, currencyCode: true,
                  financialAccountId: true, methodType: true,
                },
              },
            },
          },
        },
      },
    },
    take: 2,
  });
  if (invoices.length !== 1 || invoices[0].status !== "PAID" ||
      invoices[0].businessPartyId !== order.businessPartyId || invoices[0].currencyCode !== order.currency ||
      !invoices[0].issuedAt || !invoices[0].postedAt || !invoices[0].amountCredited.isZero() ||
      !invoices[0].grandTotal.equals(order.totalAmount) || !order.totalAmount.gt(0)) return null;
  const invoice = invoices[0];
  if (!invoice.receivable) return null;
  const paidAmount = invoice.receivable.paymentAllocations.reduce((sum, row) => {
    const payment = row.payment;
    if (row.status !== "CONFIRMED" ||
        !["CONFIRMED", "RECONCILED"].includes(payment.status) ||
        payment.direction !== "INBOUND" || payment.paymentType !== "CUSTOMER_PAYMENT" ||
        payment.businessPartyId !== order.businessPartyId || payment.currencyCode !== order.currency ||
        !payment.financialAccountId ||
        !["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CHEQUE"].includes(payment.methodType) ||
        !row.amount.gt(0)) return sum;
    return sum.plus(row.amount);
  }, new Prisma.Decimal(0));
  if (paidAmount.lt(invoice.grandTotal)) return null;

  return {
    salesOrderId: order.id,
    invoiceId: invoice.id,
    customerBusinessPartyId: order.businessPartyId,
    currencyCode: order.currency,
    sourceSiteId: orchestration.sourceSiteId,
    grossTotal: order.totalAmount,
    paidAmount,
    fulfilledAt: order.fulfilledAt,
  };
}
