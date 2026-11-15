import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog } from "@/lib/audit";
import { getRetailActiveCustomerIdFromCookieHeader } from "@/lib/enterprise/retail/active-customer";
import {
  resolveRetailRelationshipBenefitPricing,
  serializeRetailRelationshipBenefitEffects,
} from "@/lib/enterprise/relationship-benefits/retail-adapter";
import {
  applyRetailRelationshipBenefitPricing,
  resolveRetailCommercialPricingDecisions,
  serializeRetailPricingPreview,
} from "@/lib/enterprise/retail/commercial-engine";
import { retailPricingPreviewSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 1000 });
  if (!auth.ok) return auth.response;
  const originalRaw = await req.json().catch(() => null);
  const rawObject =
    originalRaw && typeof originalRaw === "object" && !Array.isArray(originalRaw)
      ? (originalRaw as Record<string, unknown>)
      : null;
  const explicitCustomerId =
    typeof rawObject?.customerBusinessPartyId === "string" &&
    rawObject.customerBusinessPartyId.trim()
      ? rawObject.customerBusinessPartyId.trim()
      : null;
  const activeCustomerId = getRetailActiveCustomerIdFromCookieHeader(
    req.headers.get("cookie"),
    organizationId,
  );
  const raw = rawObject
    ? {
        ...rawObject,
        ...(explicitCustomerId || activeCustomerId
          ? { customerBusinessPartyId: explicitCustomerId || activeCustomerId }
          : {}),
      }
    : originalRaw;
  const parsed = retailPricingPreviewSchema.safeParse(raw);
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_PRICING_PREVIEW_INPUT_INVALID", req);
  try {
    const commercialContext = {
      couponCode: parsed.data.couponCode,
      customerSegmentCode: parsed.data.customerSegmentCode,
      channelCode: parsed.data.channelCode,
    };
    const decisions = await resolveRetailCommercialPricingDecisions(
      organizationId,
      {
        siteId: parsed.data.siteId,
        customerBusinessPartyId: parsed.data.customerBusinessPartyId,
        currencyCode: parsed.data.currencyCode,
        soldAt: parsed.data.soldAt,
        lines: parsed.data.lines,
      },
      commercialContext,
    );
    // Finance invoice checkout currently persists only canonical commercial decisions.
    // Do not show relationship discounts in its preview until Finance invoices
    // can also persist and reverse the corresponding benefit ledger effects.
    if (parsed.data.invoiceCheckout) {
      if (parsed.data.couponCode || decisions.some((decision) => (decision.promotions?.length || 0) > 0)) {
        throw new EnterpriseRetailError("RETAIL_FINANCE_PROMOTION_LEDGER_REQUIRED", 409);
      }
      const preview = serializeRetailPricingPreview(decisions, parsed.data.currencyCode);
      await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pricing", action: "invoice-preview", lineCount: parsed.data.lines.length, relationshipBenefitCount: 0 } });
      return NextResponse.json(preview);
    }
    const relationshipResolution = await resolveRetailRelationshipBenefitPricing({
      organizationId,
      customerBusinessPartyId: parsed.data.customerBusinessPartyId,
      currencyCode: parsed.data.currencyCode,
      siteId: parsed.data.siteId,
      channelCode: parsed.data.channelCode,
      soldAt: parsed.data.soldAt,
      decisions,
    });
    const adjustedDecisions = applyRetailRelationshipBenefitPricing(
      decisions,
      relationshipResolution.adjustment,
    );
    const preview = serializeRetailPricingPreview(
      adjustedDecisions,
      parsed.data.currencyCode,
      serializeRetailRelationshipBenefitEffects(relationshipResolution.effects),
    );
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pricing", action: "preview", lineCount: parsed.data.lines.length, customerAttached: Boolean(parsed.data.customerBusinessPartyId), relationshipBenefitCount: preview.relationshipBenefits.length } });
    return NextResponse.json(preview);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PRICING_PREVIEW_FAILED");
  }
}
