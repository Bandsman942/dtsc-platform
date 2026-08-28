import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { transitionFinancialClose } from "@/lib/enterprise/accounting/close-service";
import {
  approveFinancialCloseAssignedApproval,
  submitFinancialCloseForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-operations-approval-orchestration";
import { assignedFinancialCloseTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";

type Params = { params: Promise<{ organizationId: string; closeId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, closeId } = await params;
  const parsed = assignedFinancialCloseTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const action = parsed.data.action === "APPROVE"
    ? "approve"
    : parsed.data.action === "CLOSE"
      ? "close"
      : parsed.data.action === "REOPEN"
        ? "reopen"
        : "submit";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CLOSE", action, { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;

  try {
    const close = parsed.data.action === "SUBMIT"
      ? await submitFinancialCloseForAssignedApproval(organizationId, closeId, auth.session.userId, parsed.data)
      : parsed.data.action === "APPROVE"
        ? await approveFinancialCloseAssignedApproval(organizationId, closeId, auth.session.userId, parsed.data)
        : await transitionFinancialClose(organizationId, closeId, auth.session.userId, parsed.data);

    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_FINANCIAL_CLOSE_${parsed.data.action}`,
      entity: "EnterpriseFinancialClose",
      entityId: closeId,
      request: req,
      metadata: {
        organizationId,
        reason: parsed.data.reason,
        fiscalPeriodId: close.fiscalPeriodId,
        approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "financial-close", action: parsed.data.action },
    });
    return NextResponse.json({ ok: true, close });
  } catch (error) {
    return financeErrorResponse(error, "FINANCIAL_CLOSE_TRANSITION_FAILED");
  }
}