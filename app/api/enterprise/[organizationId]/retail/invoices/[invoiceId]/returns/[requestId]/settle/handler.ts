import { NextResponse } from "next/server";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { settleRetailInvoiceReturnFinance, confirmDeferredRetailInvoiceReturnRefund, retailInvoiceReturnFinanceSettlementSchema } from "@/lib/enterprise/retail/invoice-return-finance";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string; invoiceId: string; requestId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId, requestId } = await params;
  // Finance settlement is not a POS cashier mutation. No implicit Retail POS
  // privilege is granted; the service enforces both Finance modules and site.
  const raw = await req.json().catch(() => null);
  // Choose the permission boundary from the requested action before
  // returning validation details. Authorization and same-origin must be
  // enforced even for an empty or malformed anonymous request.
  const wantsDeferredConfirmation = raw !== null && typeof raw === "object" &&
    !Array.isArray(raw) && raw.completeDeferred === true;
  const auth = wantsDeferredConfirmation
    ? await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 20 })
    : await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYMENTS", "update", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = retailInvoiceReturnFinanceSettlementSchema.safeParse(raw);
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_RETURN_FINANCE_SETTLE_INVALID", req);
  // Settlement confirms an outbound customer refund and posts the credit and
  // inventory movements atomically. It must not bypass the real-password/TOTP
  // step-up required by the canonical Finance CONFIRM endpoint.
  if (!(await hasRecentStepUp(auth.session))) {
    await writeAuditLog({ userId: auth.session.userId, action: "AUTH_CRITICAL_MUTATION_STEPUP_DENIED",
      entity: "EnterpriseRetailInvoiceReturnRequest", entityId: requestId, request: req,
      result: "DENIED", riskLevel: "CRITICAL", reasonCode: "STEP_UP_REQUIRED",
      metadata: { organizationId, action: "SETTLE_FINANCE" } });
    return NextResponse.json({ error: "Une vérification récente par mot de passe et authentificateur est nécessaire.",
      reasonCode: "STEP_UP_REQUIRED" }, { status: 428, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = parsed.data.completeDeferred
      ? await confirmDeferredRetailInvoiceReturnRefund(
          organizationId, invoiceId, requestId, auth.session.userId, parsed.data)
      : await settleRetailInvoiceReturnFinance(
          organizationId, invoiceId, requestId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: parsed.data.completeDeferred ? "ENTERPRISE_RETAIL_INVOICE_RETURN_DEFERRED_REFUND_CONFIRMED" : "ENTERPRISE_RETAIL_INVOICE_RETURN_SETTLED",
      entity: "EnterpriseRetailInvoiceReturnRequest", entityId: requestId, request: req,
      metadata: { organizationId, invoiceId, idempotent: result.idempotent, status: result.request.status, deferred: Boolean(parsed.data.completeDeferred) } });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-invoice-return-requests", action: "settle",
        idempotent: result.idempotent } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_RETURN_FINANCE_SETTLE_FAILED");
  }
}
