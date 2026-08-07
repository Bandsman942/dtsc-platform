import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { exchangeRateCreateSchema } from "@/lib/enterprise/accounting/exchange-rate-schemas";
import { createEnterpriseExchangeRate, getEnterpriseExchangeRateConfiguration } from "@/lib/enterprise/accounting/exchange-rate-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "view");
  if (!auth.ok) return auth.response;
  try {
    const payload = await getEnterpriseExchangeRateConfiguration(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "exchange-rates" } });
    return NextResponse.json(payload);
  } catch (error) {
    return financeErrorResponse(error, "FINANCE_EXCHANGE_RATE_LIST_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = exchangeRateCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Taux de change invalide." }, { status: 400 });
  try {
    const rate = await createEnterpriseExchangeRate(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_EXCHANGE_RATE_CREATED",
      entity: "EnterpriseExchangeRate",
      entityId: rate.id,
      request: req,
      metadata: {
        organizationId,
        sourceCurrencyCode: rate.sourceCurrencyCode,
        targetCurrencyCode: rate.targetCurrencyCode,
        rateDate: rate.rateDate.toISOString(),
        source: rate.source,
        rate: rate.rate.toFixed(),
      },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "exchange-rates", action: "create" } });
    return NextResponse.json({ ok: true, rate }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "FINANCE_EXCHANGE_RATE_CREATE_FAILED");
  }
}
