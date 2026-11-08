import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { listRetailInvoiceReturnApprovers } from "@/lib/enterprise/retail/invoice-returns";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read", { limit: 60 });
  if (!auth.ok) return auth.response;
  const site = z.string().trim().min(1).max(191).safeParse(new URL(req.url).searchParams.get("siteId"));
  if (!site.success) return NextResponse.json({
    error: "RETAIL_SITE_REQUIRED", message: "Sélectionnez une boutique avant de rechercher les validateurs de retour.",
  }, { status: 400 });
  try {
    const result = await listRetailInvoiceReturnApprovers(organizationId, auth.session.userId, site.data);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-invoice-return-approver-candidates", candidateCount: result.candidates.length } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_RETURN_APPROVER_LIST_FAILED");
  }
}
