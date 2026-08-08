import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { redeemRetailLoyaltyPoints } from "@/lib/enterprise/retail/customer-payments";
import { retailLoyaltyRedeemSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canRedeemLoyalty) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas d’utiliser les points fidélité." }, { status: 403 });
  const parsed = retailLoyaltyRedeemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Utilisation de points invalide." }, { status: 400 });
  try {
    const result = await withRetailTransactionRetry(() => redeemRetailLoyaltyPoints(organizationId, auth.session.userId, parsed.data), { maxAttempts: 3, baseDelayMs: 20 });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_LOYALTY_REDEEMED", entity: "EnterpriseRetailLoyaltyEntry", entityId: result.entry.id, request: req, metadata: { organizationId, accountId: result.account.id, points: result.entry.points.toString(), idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-loyalty", action: "redeem", idempotent: result.idempotent } });
    return NextResponse.json(result);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_LOYALTY_REDEEM_FAILED");
  }
}
