import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { EnterpriseCrossModuleProjectionError, retryCrossModuleProjection } from "@/lib/enterprise/cross-module/projection-service";

export const runtime = "nodejs";

type Params = { params: Promise<{ organizationId: string; projectionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, projectionId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  try {
    const result = await retryCrossModuleProjection(organizationId, projectionId, auth.session.userId);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CROSS_MODULE_PROJECTION_RETRIED",
      entity: "EnterpriseCrossModuleProjection",
      entityId: projectionId,
      request: req,
      metadata: { organizationId, finalStatus: result.projection.status, eventType: result.projection.eventType },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "erp-cross-module-projections", action: "retry" },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof EnterpriseCrossModuleProjectionError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return financeErrorResponse(error, "ERP_CROSS_MODULE_PROJECTION_RETRY_FAILED");
  }
}
