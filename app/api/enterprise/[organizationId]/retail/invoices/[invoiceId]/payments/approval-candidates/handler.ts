import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { listRetailInvoicePaymentFinanceApprovers } from "@/lib/enterprise/retail/invoice-approval";
import { retailInvoicePaymentOptions } from "@/lib/enterprise/retail/invoice-payments";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read", { limit: 70 });
  if (!auth.ok) return auth.response;
  try {
    // Reuse the same strict invoice/site visibility as payment creation.
    await retailInvoicePaymentOptions(organizationId, invoiceId, auth.session.userId);
    const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirst({ where: { organizationId, salesInvoiceId: invoiceId }, select: { siteId: true } });
    if (!checkout) return NextResponse.json({ error: "RETAIL_INVOICE_NOT_FOUND" }, { status: 404 });
    const result = await listRetailInvoicePaymentFinanceApprovers(organizationId, auth.session.userId, checkout.siteId);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-payment-approval-candidates", candidateCount: result.candidates.length } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_PAYMENT_APPROVERS_FAILED");
  }
}
