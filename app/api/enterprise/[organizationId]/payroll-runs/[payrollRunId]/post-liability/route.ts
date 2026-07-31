import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { postApprovedClientPayroll } from "@/lib/enterprise/accounting/payroll-expense-accounting-service";

type Params = { params: Promise<{ organizationId: string; payrollRunId: string }> };
export async function POST(req: Request, { params }: Params) { const startedAt = Date.now(); const { organizationId, payrollRunId } = await params; const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYABLES", "post", { mutation: true, limit: 30 }); if (!auth.ok) return auth.response; try { const result = await postApprovedClientPayroll(organizationId, payrollRunId, auth.session.userId); await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_PAYROLL_LIABILITY_POSTED", entity: "EnterprisePayrollRun", entityId: payrollRunId, request: req, metadata: { organizationId, journalEntryId: result.entry.id, aggregateOnly: true } }); await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "payroll-accounting", action: "post-liability" } }); return NextResponse.json({ ok: true, ...result }); } catch (error) { return financeErrorResponse(error, "PAYROLL_LIABILITY_POST_FAILED"); } }
