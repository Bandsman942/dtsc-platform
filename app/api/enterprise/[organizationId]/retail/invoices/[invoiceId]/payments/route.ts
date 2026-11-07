import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { retailInvoicePaymentOptions, retailInvoicePaymentProposalSchema, proposeRetailInvoicePayment } from "@/lib/enterprise/retail/invoice-payments";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };

/** The cashier sees only this invoice's bounded Finance proposals plus the
 * store-local account/session choices. No general Finance payments access. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read", { limit: 90 });
  if (!auth.ok) return auth.response;
  try {
    const options = await retailInvoicePaymentOptions(organizationId, invoiceId, auth.session.userId);
    const pageInput = z.coerce.number().int().min(1).max(10000).safeParse(new URL(req.url).searchParams.get("page") || "1");
    if (!pageInput.success) throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_PAGE_INVALID", 400);
    const where = { organizationId, checkout: { salesInvoiceId: invoiceId } };
    const [proposals, total] = await Promise.all([
      prisma.enterpriseRetailInvoicePaymentProposal.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (pageInput.data - 1) * 30, take: 30,
        select: { id: true, recordedByUserId: true, createdAt: true,
          payment: { select: { id: true, number: true, status: true, amount: true, currencyCode: true, unallocatedAmount: true, revision: true, methodType: true, financialAccountId: true, initiatedByUserId: true } } },
      }),
      prisma.enterpriseRetailInvoicePaymentProposal.count({ where }),
    ]);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-payment-proposals", page: pageInput.data } });
    const visibleProposals = proposals.map((item) => ({
      ...item,
      canSubmit: item.recordedByUserId === auth.session.userId && item.payment.status === "DRAFT",
      canCancel: item.recordedByUserId === auth.session.userId && item.payment.status === "DRAFT",
      canAllocate: ["CONFIRMED", "RECONCILED"].includes(item.payment.status) && item.payment.unallocatedAmount.isPositive(),
    }));
    return NextResponse.json({ ...options, proposals: visibleProposals, pagination: { page: pageInput.data, pageSize: 30, total, pageCount: Math.max(1, Math.ceil(total / 30)) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_PAYMENT_LIST_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 45 });
  if (!auth.ok) return auth.response;
  const parsed = retailInvoicePaymentProposalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_PAYMENT_INPUT_INVALID", req);
  try {
    const result = await proposeRetailInvoicePayment(organizationId, invoiceId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_INVOICE_PAYMENT_PROPOSED", entity: "EnterprisePayment", entityId: result.payment.id,
      request: req, metadata: { organizationId, invoiceId, paymentId: result.payment.id, idempotent: result.idempotent } });
    await writeApiLog({ request: req, startedAt, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-payment-proposals", action: "create", idempotent: result.idempotent } });
    return NextResponse.json({ payment: result.payment, idempotent: result.idempotent }, { status: result.idempotent ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_PAYMENT_CREATE_FAILED");
  }
}
