import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { decideRetailInvoiceReturnRequest, retailInvoiceReturnDecisionSchema } from "@/lib/enterprise/retail/invoice-returns";

type Params = { params: Promise<{ organizationId: string; invoiceId: string; requestId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId, requestId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = retailInvoiceReturnDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_RETURN_DECISION_INVALID", req);
  try {
    const request = await decideRetailInvoiceReturnRequest(organizationId, invoiceId, requestId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_INVOICE_RETURN_" + parsed.data.decision,
      entity: "EnterpriseRetailInvoiceReturnRequest", entityId: request.id, request: req,
      metadata: { organizationId, invoiceId, requestId, status: request.status, reason: parsed.data.reason } });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-invoice-return-requests", action: parsed.data.decision } });
    return NextResponse.json({ request }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_RETURN_DECISION_FAILED");
  }
}
