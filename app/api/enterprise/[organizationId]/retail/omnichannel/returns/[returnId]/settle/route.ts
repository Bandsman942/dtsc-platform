import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { omnichannelReturnSettlementSchema } from "@/lib/enterprise/retail/omnichannel-return-schemas";
import { settleRetailOmnichannelReturnFinance, retailReturnPublicView } from "@/lib/enterprise/retail/omnichannel-returns";

type Params = { params: Promise<{ organizationId: string; returnId: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, returnId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "write", { mutation: true });
  if (!auth.ok) return auth.response;
  const parsed = omnichannelReturnSettlementSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_OMNICHANNEL_RETURN_SETTLE_INVALID", req);
  try {
    const result = await settleRetailOmnichannelReturnFinance(organizationId, returnId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, request: req, action: "RETAIL_OMNICHANNEL_RETURN_SETTLED",
      entity: "EnterpriseRetailOmnichannelReturn", entityId: returnId, metadata: { organizationId, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt,
      metadata: { organizationId, domain: "retail-omnichannel-returns", action: "settle" } });
    return NextResponse.json({ retailReturn: retailReturnPublicView(result.retailReturn), idempotent: result.idempotent });
  } catch (error) { return retailErrorResponse(error, "RETAIL_OMNICHANNEL_RETURN_SETTLE_FAILED"); }
}
