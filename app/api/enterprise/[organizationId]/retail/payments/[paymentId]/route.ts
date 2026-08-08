import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { transitionRetailPayment } from "@/lib/enterprise/retail/customer-payments";
import { retailPaymentTransitionSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string; paymentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, paymentId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  const parsed = retailPaymentTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Transition de paiement invalide." }, { status: 400 });
  const needsRefundPermission = parsed.data.status === "REFUNDED";
  if ((needsRefundPermission && !permissions.canRefundPayments) || (!needsRefundPermission && !permissions.canManagePayments)) {
    return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas cette transition de paiement." }, { status: 403 });
  }
  try {
    const payment = await transitionRetailPayment(organizationId, paymentId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: `ENTERPRISE_RETAIL_PAYMENT_${payment.status}`, entity: "EnterpriseRetailPaymentTransaction", entityId: payment.id, request: req, metadata: { organizationId, status: payment.status, revision: payment.revision, providerReference: payment.providerReference } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-payments", action: "transition", status: payment.status } });
    return NextResponse.json({ ok: true, payment });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PAYMENT_TRANSITION_FAILED");
  }
}
