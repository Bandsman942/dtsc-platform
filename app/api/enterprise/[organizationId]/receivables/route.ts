import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeListParams } from "@/lib/enterprise/accounting/http";
import { listReceivables } from "@/lib/enterprise/accounting/receivables-service";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) { const startedAt = Date.now(); const { organizationId } = await params; const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", "view"); if (!auth.ok) return auth.response; const result = await listReceivables(organizationId, financeListParams(req)); await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "receivables" } }); return NextResponse.json(result); }
