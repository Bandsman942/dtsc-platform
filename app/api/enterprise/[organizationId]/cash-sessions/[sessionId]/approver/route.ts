import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assignCashSessionApproverSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { assignCashSessionApproverRecovery } from "@/lib/enterprise/accounting/accounting-operations-approval-orchestration";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";

type Params = { params: Promise<{ organizationId: string; sessionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, sessionId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;

  const parsed = assignCashSessionApproverSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", message: parsed.error.issues[0]?.message || "Sélectionnez un validateur autorisé puis réessayez." },
      { status: 400 },
    );
  }

  try {
    const result = await assignCashSessionApproverRecovery(
      organizationId,
      sessionId,
      auth.session.userId,
      parsed.data,
    );
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CASH_SESSION_APPROVER_ASSIGNED",
      entity: "EnterpriseCashSession",
      entityId: sessionId,
      request: req,
      metadata: {
        organizationId,
        approvalId: result.approval.id,
        approverUserId: result.approval.approverUserId,
        recovery: true,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "cash-sessions", action: "assign-approver-recovery" },
    });
    return NextResponse.json({ ok: true, session: result.session });
  } catch (error) {
    return financeErrorResponse(error, "CASH_SESSION_APPROVER_ASSIGNMENT_FAILED");
  }
}
