import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { submitPaymentForAssignedApproval } from "@/lib/enterprise/accounting/accounting-human-approval-orchestration";
import { transitionEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { retailInvoicePaymentOptions } from "@/lib/enterprise/retail/invoice-payments";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; invoiceId: string; paymentId: string }> };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), revision: z.number().int().positive(), approverUserId: z.string().trim().min(1).max(191), reason: z.string().trim().max(1000).optional() }).strict(),
  z.object({ action: z.literal("CANCEL"), revision: z.number().int().positive(), reason: z.string().trim().min(4).max(1000) }).strict(),
]);

/** Retail may submit its own draft for an INDEPENDENT Finance approver, or
 * cancel before submission. Only Finance may approve/confirm the payment. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId, paymentId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_PAYMENT_TRANSITION_INPUT_INVALID", req);
  try {
    await retailInvoicePaymentOptions(organizationId, invoiceId, auth.session.userId);
    const proposal = await prisma.enterpriseRetailInvoicePaymentProposal.findFirst({
      where: { organizationId, paymentId, checkout: { salesInvoiceId: invoiceId } },
      select: { checkout: { select: { siteId: true } }, recordedByUserId: true, payment: { select: { revision: true, status: true, initiatedByUserId: true } } },
    });
    if (!proposal || proposal.recordedByUserId !== auth.session.userId || proposal.payment.initiatedByUserId !== auth.session.userId) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_NOT_FOUND", 404);
    }
    if (proposal.payment.revision !== parsed.data.revision) throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_REVISION_CONFLICT", 409);
    if (proposal.payment.status !== "DRAFT") throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_NOT_DRAFT", 409);
    const payment = parsed.data.action === "SUBMIT"
      ? await submitPaymentForAssignedApproval(organizationId, paymentId, auth.session.userId, parsed.data, { retailPaymentSiteId: proposal.checkout.siteId })
      : await transitionEnterprisePayment(organizationId, paymentId, auth.session.userId, { action: "CANCEL", revision: parsed.data.revision, reason: parsed.data.reason });
    await writeAuditLog({ userId: auth.session.userId, action: `ENTERPRISE_RETAIL_INVOICE_PAYMENT_${parsed.data.action}`, entity: "EnterprisePayment", entityId: paymentId,
      request: req, metadata: { organizationId, invoiceId, siteId: proposal.checkout.siteId, approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined } });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-payment-proposals", action: parsed.data.action } });
    return NextResponse.json({ ok: true, payment }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_PAYMENT_TRANSITION_FAILED");
  }
}
