import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { listCrossModuleProjections } from "@/lib/enterprise/cross-module/projection-service";

export const runtime = "nodejs";

type Params = { params: Promise<{ organizationId: string }> };
const STATUSES = new Set(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DEAD"]);

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "view");
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const requestedStatus = url.searchParams.get("status")?.trim().toUpperCase();
  const status = requestedStatus && STATUSES.has(requestedStatus) ? requestedStatus : undefined;
  const eventType = url.searchParams.get("eventType")?.trim().slice(0, 120) || undefined;
  try {
    const result = await listCrossModuleProjections(organizationId, { page, pageSize, status, eventType });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "erp-cross-module-projections", page, status: status || "ALL" },
    });
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error, "ERP_CROSS_MODULE_PROJECTIONS_READ_FAILED");
  }
}
