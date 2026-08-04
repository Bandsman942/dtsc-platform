import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { ENTERPRISE_METRIC_DEFINITIONS, ENTERPRISE_REPORT_CATALOG } from "@/lib/enterprise/reporting/metric-registry";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" });
  if (!access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json({
    reports: ENTERPRISE_REPORT_CATALOG,
    metrics: ENTERPRISE_METRIC_DEFINITIONS,
    generatedAt: new Date().toISOString(),
    freshnessPolicyCode: "REQUEST_TIME",
  });
}
