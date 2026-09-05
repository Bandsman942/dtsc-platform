import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  approveSupplierInvoiceAssignedStep,
  cancelSupplierInvoicePendingReview,
  rejectSupplierInvoiceAssignedStep,
  reviewSupplierInvoiceAssignedStep,
  submitSupplierInvoiceForAssignedReview,
} from "@/lib/enterprise/accounting/accounting-invoice-approval-orchestration";
import { assignedSupplierInvoiceTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { transitionSupplierInvoice } from "@/lib/enterprise/accounting/payables-service";
import { ensureSupplierInvoicePartyBeforePosting } from "@/lib/enterprise/accounting/supplier-party-convergence";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const parsed = assignedSupplierInvoiceTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const action = parsed.data.action === "APPROVE"
    ? "approve"
    : parsed.data.action === "POST"
      ? "post"
      : parsed.data.action === "REVIEW" || parsed.data.action === "REJECT"
        ? "review"
        : "submit";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYABLES", action, { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;

  try {
    if (parsed.data.action === "POST") await ensureSupplierInvoicePartyBeforePosting(organizationId, invoiceId);

    const invoice = parsed.data.action === "SUBMIT"
      ? await submitSupplierInvoiceForAssignedReview(organizationId, invoiceId, auth.session.userId, parsed.data)
      : parsed.data.action === "REVIEW"
        ? await reviewSupplierInvoiceAssignedStep(organizationId, invoiceId, auth.session.userId, parsed.data)
        : parsed.data.action === "APPROVE"
          ? await approveSupplierInvoiceAssignedStep(organizationId, invoiceId, auth.session.userId, parsed.data)
          : parsed.data.action === "REJECT"
            ? await rejectSupplierInvoiceAssignedStep(organizationId, invoiceId, auth.session.userId, parsed.data)
            : parsed.data.action === "CANCEL"
              ? await cancelSupplierInvoicePendingReview(organizationId, invoiceId, auth.session.userId, parsed.data)
              : await transitionSupplierInvoice(organizationId, invoiceId, auth.session.userId, parsed.data);

    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_SUPPLIER_INVOICE_${parsed.data.action}`,
      entity: "EnterpriseSupplierInvoice",
      entityId: invoiceId,
      request: req,
      metadata: {
        organizationId,
        reason: parsed.data.reason,
        reviewerUserId: parsed.data.action === "SUBMIT" ? parsed.data.reviewerUserId : undefined,
        approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "supplier-invoices", action: parsed.data.action },
    });
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return financeErrorResponse(error, "SUPPLIER_INVOICE_TRANSITION_FAILED");
  }
}
