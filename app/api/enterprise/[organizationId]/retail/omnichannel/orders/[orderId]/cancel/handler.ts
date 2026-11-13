import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { cancelRetailOmnichannelOrder } from "@/lib/enterprise/retail/omnichannel";

const schema = z.object({
  revision: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
});

type Params = { params: Promise<{ organizationId: string; orderId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, orderId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "write", { mutation: true });
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_OMNICHANNEL_CANCEL_INPUT_INVALID", req);
  try {
    const result = await cancelRetailOmnichannelOrder(organizationId, auth.session.userId, orderId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_OMNICHANNEL_ORDER_CANCELLED",
      entity: "EnterpriseSalesOrder",
      entityId: orderId,
      metadata: { organizationId, idempotent: result.idempotent, fulfillmentMode: result.orchestration.fulfillmentMode },
      request: req,
    });
    await writeApiLog({
      request: req, statusCode: 200, userId: auth.session.userId, startedAt,
      metadata: { organizationId, domain: "retail-omnichannel-orders", action: "cancel", idempotent: result.idempotent },
    });
    return NextResponse.json(result);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_OMNICHANNEL_CANCEL_FAILED");
  }
}
