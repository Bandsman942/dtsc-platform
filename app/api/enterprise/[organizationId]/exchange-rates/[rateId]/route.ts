import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { exchangeRateDeactivateSchema } from "@/lib/enterprise/accounting/exchange-rate-schemas";
import { deactivateEnterpriseExchangeRate } from "@/lib/enterprise/accounting/exchange-rate-service";

type Params = { params: Promise<{ organizationId: string; rateId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, rateId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = exchangeRateDeactivateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Motif invalide." }, { status: 400 });
  try {
    const result = await deactivateEnterpriseExchangeRate(organizationId, rateId);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_EXCHANGE_RATE_DEACTIVATED",
      entity: "EnterpriseExchangeRate",
      entityId: rateId,
      request: req,
      metadata: {
        organizationId,
        reason: parsed.data.reason,
        pair: `${result.rate.sourceCurrencyCode}/${result.rate.targetCurrencyCode}`,
        rateDate: result.rate.rateDate.toISOString(),
        idempotent: result.idempotent,
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "exchange-rates", action: "deactivate" } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return financeErrorResponse(error, "FINANCE_EXCHANGE_RATE_DEACTIVATE_FAILED");
  }
}
