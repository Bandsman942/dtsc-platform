import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  approvePaymentAssignedApproval,
  cancelPaymentPendingApproval,
  submitPaymentForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-human-approval-orchestration";
import { assignedPaymentTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { transitionEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";

type Params = { params: Promise<{ organizationId: string; paymentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, paymentId } = await params;
  const parsed = assignedPaymentTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const action = parsed.data.action === "APPROVE"
    ? "approve"
    : parsed.data.action === "CONFIRM"
      ? "pay"
      : parsed.data.action === "RECONCILE"
        ? "reconcile"
        : parsed.data.action === "REVERSE"
          ? "reverse"
          : "submit";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYMENTS", action, { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;

  try {
    const payment = parsed.data.action === "SUBMIT"
      ? await submitPaymentForAssignedApproval(organizationId, paymentId, auth.session.userId, parsed.data)
      : parsed.data.action === "APPROVE"
        ? await approvePaymentAssignedApproval(organizationId, paymentId, auth.session.userId, parsed.data)
        : parsed.data.action === "CANCEL"
          ? await cancelPaymentPendingApproval(organizationId, paymentId, auth.session.userId, parsed.data)
          : await transitionEnterprisePayment(organizationId, paymentId, auth.session.userId, parsed.data);

    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_PAYMENT_${parsed.data.action}`,
      entity: "EnterprisePayment",
      entityId: paymentId,
      request: req,
      metadata: {
        organizationId,
        reason: parsed.data.reason,
        approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "payments", action: parsed.data.action },
    });
    return NextResponse.json({ ok: true, payment });
  } catch (error) {
    return financeErrorResponse(error, "PAYMENT_TRANSITION_FAILED");
  }
}