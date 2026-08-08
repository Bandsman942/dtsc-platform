import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { previewRetailCommercialPricing } from "@/lib/enterprise/retail/commercial-engine";
import { retailPricingPreviewSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 1000 });
  if (!auth.ok) return auth.response;
  const parsed = retailPricingPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Aperçu tarifaire invalide." }, { status: 400 });
  try {
    const preview = await previewRetailCommercialPricing(
      organizationId,
      {
        siteId: parsed.data.siteId,
        customerBusinessPartyId: parsed.data.customerBusinessPartyId,
        currencyCode: parsed.data.currencyCode,
        soldAt: parsed.data.soldAt,
        lines: parsed.data.lines,
      },
      {
        couponCode: parsed.data.couponCode,
        customerSegmentCode: parsed.data.customerSegmentCode,
        channelCode: parsed.data.channelCode,
      },
    );
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pricing", action: "preview", lineCount: parsed.data.lines.length } });
    return NextResponse.json(preview);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PRICING_PREVIEW_FAILED");
  }
}
