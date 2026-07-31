import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeListParams } from "@/lib/enterprise/accounting/http";
import { listPayables } from "@/lib/enterprise/accounting/payables-service";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) { const startedAt = Date.now(); const { organizationId } = await params; const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYABLES", "view"); if (!auth.ok) return auth.response; const result = await listPayables(organizationId, financeListParams(req)); await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "payables" } }); return NextResponse.json(result); }
