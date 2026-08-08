import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { refundRetailStoredValue } from "@/lib/enterprise/retail/customer-payments";
import { retailStoredValueRefundSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canRefundStoredValue) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas de recréditer un avoir ou une carte cadeau." }, { status: 403 });
  const parsed = retailStoredValueRefundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Recrédit de valeur stockée invalide." }, { status: 400 });
  try {
    const result = await refundRetailStoredValue(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_STORED_VALUE_REFUNDED", entity: "EnterpriseRetailStoredValueEntry", entityId: result.entry.id, request: req, metadata: { organizationId, accountId: result.account.id, amount: result.entry.amount.toString(), balance: result.account.balance.toString(), returnId: parsed.data.returnId || null, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-stored-value", action: "refund", idempotent: result.idempotent } });
    return NextResponse.json(result);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_STORED_VALUE_REFUND_FAILED");
  }
}
