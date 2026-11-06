import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { transitionSalesInvoice } from "@/lib/enterprise/accounting/receivables-service";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };
const transitionSchema = z.object({
  action: z.literal("CANCEL"),
  revision: z.number().int().positive(),
  reason: z.string().trim().min(4).max(1000),
}).strict();

/** Retail can cancel only its own, still-unissued Finance draft. Approval,
 * issuance, refunds and allocations remain exclusive to the canonical
 * Finance workflows; no shortcut is exposed to a store cashier. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = transitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_TRANSITION_INPUT_INVALID", req);
  try {
    const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirst({
      where: { organizationId, salesInvoiceId: invoiceId },
      select: { siteId: true, invoice: { select: { status: true, revision: true } } },
    });
    if (!checkout) throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
    await requireRetailSiteCapability(organizationId, auth.session.userId, checkout.siteId, "CANCEL_UNPAID_INVOICE", prisma, { requireAssignment: true });
    if (checkout.invoice.status !== "DRAFT") throw new EnterpriseRetailError("RETAIL_INVOICE_CANCELLATION_NOT_ALLOWED", 409);
    if (checkout.invoice.revision !== parsed.data.revision) throw new EnterpriseRetailError("RETAIL_INVOICE_REVISION_CONFLICT", 409);

    // Finance checks status and revision again while holding the invoice row
    // lock in a serializable transaction; concurrent approval cannot be lost.
    const invoice = await transitionSalesInvoice(organizationId, invoiceId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId, action: "ENTERPRISE_RETAIL_INVOICE_CANCELLED",
      entity: "EnterpriseSalesInvoice", entityId: invoice.id, request: req,
      metadata: { organizationId, siteId: checkout.siteId, reason: parsed.data.reason },
    });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-checkout-invoices", action: "cancel" } });
    return NextResponse.json({ ok: true, invoice }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_TRANSITION_FAILED");
  }
}
