import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { listRetailInvoiceFinanceApprovers } from "@/lib/enterprise/retail/invoice-approval";
import { retailInvoiceVisibleSites } from "@/lib/enterprise/retail/site-access";

type Params = { params: Promise<{ organizationId: string }> };
const siteSchema = z.string().trim().min(1).max(191);

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read", { limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = siteSchema.safeParse(new URL(req.url).searchParams.get("siteId"));
  if (!parsed.success) return NextResponse.json({ error: "RETAIL_SITE_REQUIRED", message: "Sélectionnez une boutique avant de demander les validateurs." }, { status: 400 });
  try {
    const visibility = await retailInvoiceVisibleSites(organizationId, auth.session.userId);
    if (!visibility.isOwner && !visibility.siteIds.includes(parsed.data)) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
    const result = await listRetailInvoiceFinanceApprovers(organizationId, auth.session.userId, parsed.data);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-approval-candidates", candidateCount: result.candidates.length } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVOICE_APPROVER_LIST_FAILED");
  }
}
