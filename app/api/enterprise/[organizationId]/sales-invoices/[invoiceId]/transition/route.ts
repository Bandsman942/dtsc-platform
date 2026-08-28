import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  approveSalesInvoiceAssignedApproval,
  submitSalesInvoiceForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-invoice-approval-orchestration";
import { assignedSalesInvoiceTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { transitionSalesInvoice } from "@/lib/enterprise/accounting/receivables-service";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const parsed = assignedSalesInvoiceTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const action = parsed.data.action === "APPROVE" ? "approve" : parsed.data.action === "ISSUE" ? "post" : "submit";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", action, { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;

  try {
    const invoice = parsed.data.action === "SUBMIT"
      ? await submitSalesInvoiceForAssignedApproval(organizationId, invoiceId, auth.session.userId, parsed.data)
      : parsed.data.action === "APPROVE"
        ? await approveSalesInvoiceAssignedApproval(organizationId, invoiceId, auth.session.userId, parsed.data)
        : await transitionSalesInvoice(organizationId, invoiceId, auth.session.userId, parsed.data);

    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_SALES_INVOICE_${parsed.data.action}`,
      entity: "EnterpriseSalesInvoice",
      entityId: invoiceId,
      request: req,
      metadata: {
        organizationId,
        reason: parsed.data.reason,
        approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "sales-invoices", action: parsed.data.action },
    });
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return financeErrorResponse(error, "SALES_INVOICE_TRANSITION_FAILED");
  }
}