import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  getOperationalFinanceSummary,
  type OperationalFinanceModuleCode,
} from "@/lib/enterprise/finance/operational-summary-service";

type Params = { params: Promise<{ organizationId: string }> };
const ALLOWED_MODULES = new Set<OperationalFinanceModuleCode>([
  "FINANCE_RECEIVABLES",
  "FINANCE_PAYABLES",
  "FINANCE_PAYMENTS",
]);

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const url = new URL(req.url);
  const requestedModule = url.searchParams.get("module") as OperationalFinanceModuleCode | null;
  if (!requestedModule || !ALLOWED_MODULES.has(requestedModule)) {
    return NextResponse.json({ error: "Invalid module" }, { status: 400 });
  }

  const auth = await authorizeFinanceRequest(req, organizationId, requestedModule, "view");
  if (!auth.ok) return auth.response;

  try {
    const summary = await getOperationalFinanceSummary(organizationId, requestedModule);
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "operational-finance-summary", moduleCode: requestedModule },
    });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return financeErrorResponse(error, "OPERATIONAL_FINANCE_SUMMARY_FAILED");
  }
}
