import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { prepareRetailInvoiceReturnFinance, retailInvoiceReturnFinancePrepareSchema } from "@/lib/enterprise/retail/invoice-return-finance";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string; invoiceId: string; requestId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId, requestId } = await params;
  // An independent Finance preparer need not be a Retail cashier. The
  // transaction still checks Finance *and* store restrictions/revocations.
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYMENTS", "submit", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = retailInvoiceReturnFinancePrepareSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_RETURN_FINANCE_PREPARE_INVALID", req);
  try {
    const result = await prepareRetailInvoiceReturnFinance(
      organizationId, invoiceId, requestId, auth.session.userId, parsed.data,
    );
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_INVOICE_RETURN_FINANCE_PREPARE",
      entity: "EnterpriseRetailInvoiceReturnRequest", entityId: requestId, request: req,
      metadata: { organizationId, invoiceId, idempotent: result.idempotent, status: result.request.status } });
    await writeApiLog({ request: req, startedAt, statusCode: result.idempotent ? 200 : 201,
      userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-return-requests",
        action: "finance-prepare", idempotent: result.idempotent } });
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_RETURN_FINANCE_PREPARE_FAILED");
  }
}
