import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import {
  createRetailInvoiceReturnRequest, listRetailInvoiceReturnRequests, retailInvoiceReturnRequestSchema,
} from "@/lib/enterprise/retail/invoice-returns";

type Params = { params: Promise<{ organizationId: string; invoiceId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const parsed = z.coerce.number().int().min(1).max(10000).safeParse(new URL(req.url).searchParams.get("page") || "1");
  if (!parsed.success) return retailErrorResponse(new Error("INVALID_PAGE"), "RETAIL_INVOICE_RETURN_PAGE_INVALID");
  try {
    const data = await listRetailInvoiceReturnRequests(organizationId, invoiceId, auth.session.userId, parsed.data);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-invoice-return-requests", page: parsed.data } });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_RETURN_LIST_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, invoiceId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = retailInvoiceReturnRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_INVOICE_RETURN_INPUT_INVALID", req);
  try {
    const data = await createRetailInvoiceReturnRequest(organizationId, invoiceId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_INVOICE_RETURN_SUBMITTED",
      entity: "EnterpriseRetailInvoiceReturnRequest", entityId: data.request.id, request: req,
      metadata: { organizationId, invoiceId, idempotent: data.idempotent, status: data.request.status } });
    await writeApiLog({ request: req, startedAt, statusCode: data.idempotent ? 200 : 201,
      userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-return-requests",
        action: "create", idempotent: data.idempotent } });
    return NextResponse.json(data, { status: data.idempotent ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_RETURN_CREATE_FAILED");
  }
}
