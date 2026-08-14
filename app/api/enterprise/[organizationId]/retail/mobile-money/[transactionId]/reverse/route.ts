import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { finalizeMobileMoneyReversalAccounting } from "@/lib/enterprise/retail/mobile-money-accounting";
import { mobileMoneyReverseSchema } from "@/lib/enterprise/retail/schemas";
import { reverseMobileMoneyTransaction } from "@/lib/enterprise/retail/service";

type Params = { params: Promise<{ organizationId: string; transactionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, transactionId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "manage", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = mobileMoneyReverseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Annulation invalide." }, { status: 400 });
  try {
    const transaction = await reverseMobileMoneyTransaction(organizationId, transactionId, auth.session.userId, parsed.data);
    const accounting = await finalizeMobileMoneyReversalAccounting(organizationId, auth.session.userId, transaction.id);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_MOBILE_MONEY_REVERSED", entity: "EnterpriseMobileMoneyTransaction", entityId: transaction.id, request: req, metadata: { organizationId, number: transaction.number, reason: parsed.data.reason.slice(0, 500), journalEntryId: accounting.entry.id } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money", action: "reverse", journalEntryId: accounting.entry.id } });
    return NextResponse.json({ ok: true, transaction, accounting: { journalEntryId: accounting.entry.id, idempotent: accounting.idempotent } });
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_REVERSE_FAILED");
  }
}
