import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { allocateEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { retailInvoicePaymentOptions } from "@/lib/enterprise/retail/invoice-payments";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; invoiceId: string; paymentId: string }> };

/** Allocate the entire confirmed, unallocated payment to its ONE source
 * invoice. Partial invoice settlement is achieved by multiple cashier
 * proposals; this endpoint never accepts a client-supplied amount/target. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId, paymentId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 75 });
  if (!auth.ok) return auth.response;
  try {
    await retailInvoicePaymentOptions(organizationId, invoiceId, auth.session.userId);
    const proposal = await prisma.enterpriseRetailInvoicePaymentProposal.findFirst({
      where: { organizationId, paymentId, checkout: { salesInvoiceId: invoiceId } },
      select: { payment: { select: { status: true, unallocatedAmount: true } }, checkout: { select: { invoice: { select: { receivable: { select: { id: true } } } } } } },
    });
    if (!proposal) throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_NOT_FOUND", 404);
    const receivableId = proposal.checkout.invoice.receivable?.id;
    if (!receivableId) throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_NOT_RECEIVABLE", 409);
    if (!["CONFIRMED", "RECONCILED"].includes(proposal.payment.status)) throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_NOT_CONFIRMED", 409);

    if (proposal.payment.unallocatedAmount.isZero()) {
      const previous = await prisma.enterprisePaymentAllocation.findFirst({
        where: { organizationId, paymentId, receivableId, status: "CONFIRMED" }, select: { id: true },
      });
      if (!previous) throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_NOT_ALLOCATABLE", 409);
      await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-payment-proposals", action: "allocate", idempotent: true } });
      return NextResponse.json({ ok: true, idempotent: true, allocationId: previous.id }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const allocation = await allocateEnterprisePayment(organizationId, paymentId, auth.session.userId, {
      receivableId, amount: proposal.payment.unallocatedAmount.toFixed(6),
    });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_INVOICE_PAYMENT_ALLOCATED", entity: "EnterprisePaymentAllocation", entityId: allocation.id,
      request: req, metadata: { organizationId, invoiceId, paymentId, receivableId, amount: allocation.amount.toFixed() } });
    await writeApiLog({ request: req, startedAt, statusCode: 201, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-payment-proposals", action: "allocate" } });
    return NextResponse.json({ ok: true, allocation }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_PAYMENT_ALLOCATION_FAILED");
  }
}
