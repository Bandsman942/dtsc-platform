import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { resolveRetailCommercialPricingDecisions, serializeRetailPricingPreview } from "@/lib/enterprise/retail/commercial-engine";
import { retailPricingPreviewSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string }> };

/** Invoice-only FX quote. The 24 legacy routed Retail handlers remain immutable.
 * The same server pricing engine and per-line historical rates are rechecked
 * during atomic Finance invoice preparation. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 1000 });
  if (!auth.ok) return auth.response;
  const parsed = retailPricingPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_PRICING_PREVIEW_INPUT_INVALID", req);
  if (!parsed.data.invoiceCheckout || parsed.data.couponCode) {
    return retailErrorResponse(new EnterpriseRetailError("RETAIL_FINANCE_PROMOTION_LEDGER_REQUIRED", 409), "RETAIL_INVOICE_FX_PREVIEW_INVALID");
  }
  try {
    const decisions = await resolveRetailCommercialPricingDecisions(organizationId, {
      siteId: parsed.data.siteId, customerBusinessPartyId: parsed.data.customerBusinessPartyId,
      currencyCode: parsed.data.currencyCode, soldAt: parsed.data.soldAt, lines: parsed.data.lines,
    }, { channelCode: "POS", couponCode: null, invoiceCheckoutFx: true });
    if (decisions.some((decision) => (decision.promotions?.length || 0) > 0)) throw new EnterpriseRetailError("RETAIL_FINANCE_PROMOTION_LEDGER_REQUIRED", 409);
    const preview = serializeRetailPricingPreview(decisions, parsed.data.currencyCode);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-invoice-fx-preview", lineCount: decisions.length } });
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return retailErrorResponse(error, "RETAIL_INVOICE_FX_PREVIEW_FAILED"); }
}
