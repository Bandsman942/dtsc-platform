import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { getEnterpriseFinanceSummary } from "@/lib/enterprise/finance/summary-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { organizationId } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const summary = await getEnterpriseFinanceSummary(organizationId); await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "finance-summary" } }); return NextResponse.json(summary);
}
