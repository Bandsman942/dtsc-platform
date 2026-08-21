import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { telcoTopupReverseSchema } from "@/lib/enterprise/retail/schemas";
import { reverseTelcoTopup } from "@/lib/enterprise/retail/service";
import { finalizeTelcoTopupReversalAccounting } from "@/lib/enterprise/retail/telco-accounting";

type Params = { params: Promise<{ organizationId: string; topupId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, topupId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "manage", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = telcoTopupReverseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Annulation invalide." }, { status: 400 });
  try {
    const topup = await reverseTelcoTopup(organizationId, topupId, auth.session.userId, parsed.data);
    const accounting = await finalizeTelcoTopupReversalAccounting(organizationId, auth.session.userId, topup.id);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_TELCO_TOPUP_REVERSED",
      entity: "EnterpriseTelcoTopup",
      entityId: topup.id,
      request: req,
      metadata: {
        organizationId,
        number: topup.number,
        reason: parsed.data.reason.slice(0, 500),
        journalEntryId: accounting.entry.id,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "telco-topups", action: "reverse", journalEntryId: accounting.entry.id },
    });
    return NextResponse.json({ ok: true, topup, accounting: { journalEntryId: accounting.entry.id, idempotent: accounting.idempotent } });
  } catch (error) {
    return retailErrorResponse(error, "TELCO_TOPUP_REVERSE_FAILED");
  }
}
