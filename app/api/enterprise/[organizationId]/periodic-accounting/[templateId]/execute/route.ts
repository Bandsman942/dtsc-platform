import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { executePeriodicAccountingTemplate } from "@/lib/enterprise/accounting/periodic-accounting-service";
import { periodicAccountingExecutionSchema } from "@/lib/enterprise/accounting/periodic-accounting-schemas";

type Params = { params: Promise<{ organizationId: string; templateId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, templateId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "post", { mutation: true, limit: 80 });
  if (!auth.ok) return auth.response;
  const parsed = periodicAccountingExecutionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const result = await executePeriodicAccountingTemplate(organizationId, templateId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_PERIODIC_ACCOUNTING_EXECUTED", entity: "EnterprisePeriodicAccountingExecution", entityId: result.execution.id, request: req, metadata: { organizationId, templateId, journalEntryId: result.entry?.id || null, reversalEntryId: result.reversal?.id || null, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "periodic-accounting", action: "execute", idempotent: result.idempotent } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return financeErrorResponse(error, "PERIODIC_ACCOUNTING_EXECUTION_FAILED");
  }
}
