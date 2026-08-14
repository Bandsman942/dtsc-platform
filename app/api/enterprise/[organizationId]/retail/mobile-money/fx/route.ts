import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { finalizeMobileMoneyFxAccounting } from "@/lib/enterprise/retail/mobile-money-accounting";
import { mobileMoneyFxPreviewSchema, mobileMoneyFxTransferSchema } from "@/lib/enterprise/retail/mobile-money-multicurrency-schemas";
import { createMobileMoneyFxTransfer, previewMobileMoneyFxTransfer } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "read");
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const parsed = mobileMoneyFxPreviewSchema.safeParse({
    providerCode: url.searchParams.get("providerCode"),
    sourceCurrencyCode: url.searchParams.get("sourceCurrencyCode"),
    targetCurrencyCode: url.searchParams.get("targetCurrencyCode"),
    sourceAmount: url.searchParams.get("sourceAmount"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query", message: parsed.error.issues[0]?.message || "Paramètres de conversion invalides." }, { status: 400 });
  try {
    const preview = await previewMobileMoneyFxTransfer(organizationId, parsed.data);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money-fx", action: "preview", providerCode: parsed.data.providerCode } });
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_FX_PREVIEW_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "manage", { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;
  const parsed = mobileMoneyFxTransferSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Transfert de devise invalide." }, { status: 400 });
  try {
    const result = await createMobileMoneyFxTransfer(organizationId, auth.session.userId, parsed.data);
    const accounting = await finalizeMobileMoneyFxAccounting(organizationId, auth.session.userId, result.transfer.id);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_MOBILE_MONEY_FX_CONFIRMED",
      entity: "EnterpriseMobileMoneyFxTransfer",
      entityId: result.transfer.id,
      request: req,
      metadata: {
        organizationId,
        providerCode: result.transfer.providerCode,
        sourceCurrencyCode: result.transfer.sourceCurrencyCode,
        targetCurrencyCode: result.transfer.targetCurrencyCode,
        sourceAmount: result.transfer.sourceAmount.toFixed(),
        targetAmount: result.transfer.targetAmount.toFixed(),
        exchangeRate: result.transfer.exchangeRate.toFixed(),
        journalEntryId: accounting.entry.id,
        idempotent: result.idempotent,
      },
    });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money-fx", action: "create" } });
    return NextResponse.json({ ok: true, ...result, accounting: { journalEntryId: accounting.entry.id, idempotent: accounting.idempotent } }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_FX_CREATE_FAILED");
  }
}
