import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { omnichannelReturnRequestSchema } from "@/lib/enterprise/retail/omnichannel-return-schemas";
import { listRetailOmnichannelReturns, requestRetailOmnichannelReturn, retailReturnPublicView } from "@/lib/enterprise/retail/omnichannel-returns";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";

type Params = { params: Promise<{ organizationId: string; orderId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, orderId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const result = await listRetailOmnichannelReturns(organizationId, orderId);
  const [payments, receivables] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ organizationId, userId: auth.session.userId, moduleCode: "FINANCE_PAYMENTS" }),
    resolveEnterpriseModuleCapabilities({ organizationId, userId: auth.session.userId, moduleCode: "FINANCE_RECEIVABLES" }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt,
    metadata: { organizationId, domain: "retail-omnichannel-returns", action: "list" } });
  return NextResponse.json({ items: result, viewerUserId: auth.session.userId,
    canPrepare: payments.canCreate && payments.canSubmit && receivables.canCreate && receivables.canSubmit,
    canSettle: payments.canWrite && receivables.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, orderId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true });
  if (!auth.ok) return auth.response;
  const parsed = omnichannelReturnRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_OMNICHANNEL_RETURN_INPUT_INVALID", req);
  try {
    const result = await requestRetailOmnichannelReturn(organizationId, orderId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, request: req, action: "RETAIL_OMNICHANNEL_RETURN_REQUESTED",
      entity: "EnterpriseRetailOmnichannelReturn", entityId: result.retailReturn.id,
      metadata: { organizationId, salesOrderId: orderId, idempotent: result.idempotent } });
    const statusCode = result.idempotent ? 200 : 201;
    await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt,
      metadata: { organizationId, domain: "retail-omnichannel-returns", action: "request", idempotent: result.idempotent } });
    return NextResponse.json({ retailReturn: retailReturnPublicView(result.retailReturn), idempotent: result.idempotent }, { status: statusCode });
  } catch (error) { return retailErrorResponse(error, "RETAIL_OMNICHANNEL_RETURN_REQUEST_FAILED"); }
}
