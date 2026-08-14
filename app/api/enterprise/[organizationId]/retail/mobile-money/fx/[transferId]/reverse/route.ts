import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { finalizeMobileMoneyFxReversalAccounting } from "@/lib/enterprise/retail/mobile-money-accounting";
import { mobileMoneyFxReverseSchema } from "@/lib/enterprise/retail/mobile-money-multicurrency-schemas";
import { reverseMobileMoneyFxTransfer } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";

type Params = { params: Promise<{ organizationId: string; transferId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, transferId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "manage", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = mobileMoneyFxReverseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Annulation invalide." }, { status: 400 });
  try {
    const transfer = await reverseMobileMoneyFxTransfer(organizationId, transferId, auth.session.userId, parsed.data);
    const accounting = await finalizeMobileMoneyFxReversalAccounting(organizationId, auth.session.userId, transfer.id);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_MOBILE_MONEY_FX_REVERSED",
      entity: "EnterpriseMobileMoneyFxTransfer",
      entityId: transfer.id,
      request: req,
      metadata: { organizationId, number: transfer.number, reason: parsed.data.reason.slice(0, 500), journalEntryId: accounting.entry.id },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money-fx", action: "reverse" } });
    return NextResponse.json({ ok: true, transfer, accounting: { journalEntryId: accounting.entry.id, idempotent: accounting.idempotent } });
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_FX_REVERSE_FAILED");
  }
}
