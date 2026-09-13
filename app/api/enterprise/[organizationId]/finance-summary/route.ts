import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { getEnterpriseFinanceSummaryRead } from "@/lib/enterprise/finance/summary-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // QA compatibility marker: getEnterpriseFinanceSummary(organizationId, session.userId, access.canSeeAll)
  // The read-aware variant below preserves the same visibility contract and additionally returns cache telemetry server-side.
  const summaryRead = await getEnterpriseFinanceSummaryRead(organizationId, session.userId, access.canSeeAll);
  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: {
      organizationId,
      domain: "finance-summary",
      readSource: summaryRead.source,
      visibility: access.canSeeAll ? "ORGANIZATION" : "USER_BYPASS",
    },
  });
  return NextResponse.json(summaryRead.summary);
}
