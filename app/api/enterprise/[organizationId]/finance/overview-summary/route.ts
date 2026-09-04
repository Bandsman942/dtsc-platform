import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { getEnterpriseFinanceOverviewSummary } from "@/lib/enterprise/finance/overview-summary-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "view");
  if (!auth.ok) return auth.response;
  try {
    const summary = await getEnterpriseFinanceOverviewSummary(organizationId);
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "finance-overview-summary" },
    });
    return NextResponse.json(summary);
  } catch (error) {
    return financeErrorResponse(error, "FINANCE_OVERVIEW_SUMMARY_FAILED");
  }
}
