import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { submitCashSessionCloseForAssignedValidation } from "@/lib/enterprise/accounting/accounting-operations-approval-orchestration";
import { assignedCashCloseSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";

type Params = { params: Promise<{ organizationId: string; sessionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, sessionId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "close", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = assignedCashCloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const session = await submitCashSessionCloseForAssignedValidation(organizationId, sessionId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CASH_SESSION_SUBMITTED",
      entity: "EnterpriseCashSession",
      entityId: sessionId,
      request: req,
      metadata: {
        organizationId,
        approverUserId: parsed.data.approverUserId,
        expectedClosingAmount: session.expectedClosingAmount?.toFixed(),
        countedClosingAmount: session.countedClosingAmount?.toFixed(),
        discrepancyAmount: session.discrepancyAmount?.toFixed(),
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "cash-sessions", action: "close" } });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return financeErrorResponse(error, "CASH_SESSION_CLOSE_FAILED");
  }
}