import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { redeemRetailStoredValue } from "@/lib/enterprise/retail/customer-payments";
import { retailStoredValueRedeemSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
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
  if (!permissions.canRedeemStoredValue) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas d’utiliser une carte cadeau ou un avoir." }, { status: 403 });
  const parsed = retailStoredValueRedeemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Utilisation de valeur stockée invalide." }, { status: 400 });
  try {
    const result = await withRetailTransactionRetry(() => redeemRetailStoredValue(organizationId, auth.session.userId, parsed.data), { maxAttempts: 3, baseDelayMs: 20 });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_STORED_VALUE_REDEEMED", entity: "EnterpriseRetailStoredValueEntry", entityId: result.entry.id, request: req, metadata: { organizationId, accountId: result.account.id, displayCode: result.account.displayCode, amount: result.entry.amount.toString(), balance: result.account.balance.toString(), idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-stored-value", action: "redeem", idempotent: result.idempotent } });
    return NextResponse.json(result);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_STORED_VALUE_REDEEM_FAILED");
  }
}
