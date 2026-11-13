import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { omnichannelReturnRevisionSchema } from "@/lib/enterprise/retail/omnichannel-return-schemas";
import { prepareRetailOmnichannelReturnFinance, retailReturnPublicView } from "@/lib/enterprise/retail/omnichannel-returns";

type Params = { params: Promise<{ organizationId: string; returnId: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, returnId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "write", { mutation: true });
  if (!auth.ok) return auth.response;
  const parsed = omnichannelReturnRevisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_OMNICHANNEL_RETURN_PREPARE_INVALID", req);
  try {
    const result = await prepareRetailOmnichannelReturnFinance(organizationId, returnId, auth.session.userId, parsed.data.revision);
    await writeAuditLog({ userId: auth.session.userId, request: req, action: "RETAIL_OMNICHANNEL_RETURN_FINANCE_PREPARED",
      entity: "EnterpriseRetailOmnichannelReturn", entityId: returnId, metadata: { organizationId, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt,
      metadata: { organizationId, domain: "retail-omnichannel-returns", action: "prepare" } });
    return NextResponse.json({ retailReturn: retailReturnPublicView(result.retailReturn), idempotent: result.idempotent });
  } catch (error) { return retailErrorResponse(error, "RETAIL_OMNICHANNEL_RETURN_PREPARE_FAILED"); }
}
