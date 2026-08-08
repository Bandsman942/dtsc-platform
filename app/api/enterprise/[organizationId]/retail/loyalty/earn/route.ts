import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { earnRetailLoyaltyPoints } from "@/lib/enterprise/retail/customer-payments";
import { retailLoyaltyEarnSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canManageLoyalty) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas de créditer la fidélité manuellement." }, { status: 403 });
  const parsed = retailLoyaltyEarnSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Mouvement fidélité invalide." }, { status: 400 });
  try {
    const result = await earnRetailLoyaltyPoints(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_LOYALTY_EARNED", entity: "EnterpriseRetailLoyaltyEntry", entityId: result.entry.id, request: req, metadata: { organizationId, accountId: result.account.id, points: result.entry.points.toString(), idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-loyalty", action: "earn", idempotent: result.idempotent } });
    return NextResponse.json(result);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_LOYALTY_EARN_FAILED");
  }
}
