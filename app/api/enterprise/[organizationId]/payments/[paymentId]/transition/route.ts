import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import {
  approvePaymentAssignedApproval,
  cancelPaymentPendingApproval,
  submitPaymentForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-human-approval-orchestration";
import { assignedPaymentTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { transitionEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { confirmCustomerRefundPayment } from "@/lib/enterprise/accounting/customer-refund-service";
import { prisma } from "@/lib/prisma";
import { convergeConfirmedGamingPayment } from "@/lib/enterprise/gaming/payment-convergence";

type Params = { params: Promise<{ organizationId: string; paymentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, paymentId } = await params;
  const parsed = assignedPaymentTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error);

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
    const currentPayment = parsed.data.action === "CONFIRM"
      ? await prisma.enterprisePayment.findFirst({
          where: { id: paymentId, organizationId },
          select: { paymentType: true },
        })
      : null;
    const payment = parsed.data.action === "SUBMIT"
      ? await submitPaymentForAssignedApproval(organizationId, paymentId, auth.session.userId, parsed.data)
      : parsed.data.action === "APPROVE"
        ? await approvePaymentAssignedApproval(organizationId, paymentId, auth.session.userId, parsed.data)
        : parsed.data.action === "CANCEL"
          ? await cancelPaymentPendingApproval(organizationId, paymentId, auth.session.userId, parsed.data)
          : parsed.data.action === "CONFIRM" && currentPayment?.paymentType === "REFUND"
            ? await confirmCustomerRefundPayment(
                organizationId,
                paymentId,
                auth.session.userId,
                { revision: parsed.data.revision, reason: parsed.data.reason || "Confirmation du remboursement client" },
              )
            : await transitionEnterprisePayment(organizationId, paymentId, auth.session.userId, parsed.data);

    if (parsed.data.action === "CONFIRM" && ["CONFIRMED", "RECONCILED"].includes(payment.status)) {
      await convergeConfirmedGamingPayment(organizationId, payment.id, auth.session.userId);
    }

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