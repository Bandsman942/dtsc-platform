import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { finalizeRetailReturnAccounting } from "@/lib/enterprise/retail/accounting";
import { retailReturnDecisionSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { reverseRetailLoyaltyForCompletedReturn } from "@/lib/enterprise/retail/loyalty-sale-hooks";
import { getRetailCommercialPermissions } from "@/lib/enterprise/retail/permissions";
import { decideRetailReturn } from "@/lib/enterprise/retail/returns";

type Params = { params: Promise<{ organizationId: string; returnId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, returnId } = await params;
  // Module visibility/read remains the broad gate; the exact refund permission below is the mutation authority.
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read", { mutation: true, limit: 80 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCommercialPermissions(auth.session.userId, organizationId);
  if (!permissions.canManageRefunds) return NextResponse.json({ error: "Forbidden", message: "Vous n’êtes pas autorisé à valider les remboursements Retail." }, { status: 403 });
  const parsed = retailReturnDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Décision de retour invalide." }, { status: 400 });
  try {
    const result = await decideRetailReturn(organizationId, returnId, auth.session.userId, parsed.data);
    const accounting = parsed.data.decision === "APPROVE"
      ? await finalizeRetailReturnAccounting(organizationId, auth.session.userId, result.retailReturn.id)
      : null;
    const loyalty = parsed.data.decision === "APPROVE"
      ? await reverseRetailLoyaltyForCompletedReturn(organizationId, auth.session.userId, result.retailReturn.id)
      : null;
    await writeAuditLog({
      userId: auth.session.userId,
      action: parsed.data.decision === "APPROVE" ? "ENTERPRISE_RETAIL_RETURN_APPROVED" : "ENTERPRISE_RETAIL_RETURN_REJECTED",
      entity: "EnterpriseRetailReturn",
      entityId: result.retailReturn.id,
      request: req,
      metadata: {
        organizationId,
        number: result.retailReturn.number,
        decision: parsed.data.decision,
        reason: parsed.data.reason || null,
        idempotent: result.idempotent,
        loyaltyReversalEntryIds: loyalty?.applied.map((entry) => entry.entryId) || [],
        returnJournalEntryId: accounting?.returnJournalEntryId || null,
        inventoryReturnCount: accounting?.inventoryReturnPostings.length || 0,
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-returns", action: parsed.data.decision.toLowerCase(), loyaltyReversed: loyalty?.applied.length || 0, accountingPosted: Boolean(accounting) } });
    return NextResponse.json({ ok: true, ...result, accounting, loyalty });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_RETURN_DECISION_FAILED");
  }
}
