import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { allocateEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { syncGamingCheckoutPaidState } from "@/lib/enterprise/gaming/checkout-common";
import { prisma } from "@/lib/prisma";

export async function convergeConfirmedGamingPayment(
  organizationId: string,
  paymentId: string,
  actorUserId: string,
) {
  const payment = await prisma.enterprisePayment.findFirst({
    where: {
      id: paymentId,
      organizationId,
      direction: "INBOUND",
      paymentType: "CUSTOMER_PAYMENT",
      status: { in: ["CONFIRMED", "RECONCILED"] },
    },
  });
  if (!payment?.reference) return { matched: false as const, idempotent: true };

  const checkout = await prisma.enterpriseGamingCheckout.findFirst({
    where: { organizationId, reference: payment.reference },
    select: { id: true, salesInvoiceId: true },
  });
  if (!checkout) return { matched: false as const, idempotent: true };

  const invoice = await prisma.enterpriseSalesInvoice.findFirst({
    where: { id: checkout.salesInvoiceId, organizationId },
    include: { receivable: true },
  });
  if (!invoice?.receivable) {
    throw new EnterpriseAccountingError("PAYMENT_GAMING_CONVERGENCE_FAILED", 409, { checkoutId: checkout.id });
  }
  if (payment.businessPartyId !== invoice.businessPartyId || payment.currencyCode !== invoice.currencyCode) {
    throw new EnterpriseAccountingError("PAYMENT_GAMING_SCOPE_INVALID", 409, { checkoutId: checkout.id });
  }

  let allocation = await prisma.enterprisePaymentAllocation.findFirst({
    where: {
      organizationId,
      paymentId: payment.id,
      receivableId: invoice.receivable.id,
      status: "CONFIRMED",
    },
  });

  if (!allocation && payment.unallocatedAmount.isPositive() && invoice.receivable.outstandingAmount.isPositive()) {
    const amount = Prisma.Decimal.min(payment.unallocatedAmount, invoice.receivable.outstandingAmount);
    try {
      allocation = await allocateEnterprisePayment(
        organizationId,
        payment.id,
        actorUserId,
        { receivableId: invoice.receivable.id, amount: amount.toFixed() },
      );
    } catch (error) {
      const recovered = await prisma.enterprisePaymentAllocation.findFirst({
        where: {
          organizationId,
          paymentId: payment.id,
          receivableId: invoice.receivable.id,
          status: "CONFIRMED",
        },
      });
      if (!recovered) throw error;
      allocation = recovered;
    }
  }

  const refreshedInvoice = await prisma.enterpriseSalesInvoice.findFirst({
    where: { id: invoice.id, organizationId },
    select: { status: true, outstandingAmount: true },
  });
  if (!allocation && refreshedInvoice?.outstandingAmount.isPositive()) {
    throw new EnterpriseAccountingError("PAYMENT_GAMING_CONVERGENCE_FAILED", 409, { checkoutId: checkout.id });
  }

  const state = await syncGamingCheckoutPaidState(organizationId, checkout.id, actorUserId);
  return {
    matched: true as const,
    idempotent: Boolean(allocation && !payment.unallocatedAmount.isPositive()),
    checkoutId: checkout.id,
    salesInvoiceId: invoice.id,
    receivableId: invoice.receivable.id,
    allocationId: allocation?.id || null,
    state,
  };
}
