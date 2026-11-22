import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { finalizeRetailDirectCashCheckout, retailDirectCashCheckoutSchema } from "@/lib/enterprise/retail/direct-checkout";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string }> };

/** CASH only: pricing is authoritative on the server; cash change is not a
 * second expense or payment. Every retry must use the same idempotencyKey. */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 35 });
  if (!auth.ok) return auth.response;
  const parsed = retailDirectCashCheckoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_DIRECT_CHECKOUT_INPUT_INVALID", req);
  try {
    const completed = await finalizeRetailDirectCashCheckout(organizationId, auth.session.userId, parsed.data);
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, siteId: parsed.data.siteId, domain: "retail-direct-checkout", action: "confirm", idempotent: completed.idempotent } });
    return NextResponse.json(completed, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return retailErrorResponse(error, "RETAIL_DIRECT_CHECKOUT_FAILED"); }
}
