import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { enterpriseCurrencyCreateSchema } from "@/lib/enterprise/accounting/currency-schemas";
import { createEnterpriseCurrency, listEnterpriseCurrencies } from "@/lib/enterprise/accounting/currency-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "view");
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  try {
    const items = await listEnterpriseCurrencies(organizationId, {
      includeInactive: url.searchParams.get("includeInactive") === "true",
      search: url.searchParams.get("search") || undefined,
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "enterprise-currencies", includeInactive: url.searchParams.get("includeInactive") === "true" },
    });
    return NextResponse.json({ items });
  } catch (error) {
    return financeErrorResponse(error, "FINANCE_CURRENCY_LIST_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = enterpriseCurrencyCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "FINANCE_CURRENCY_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Vérifiez les informations de la devise." }, { status: 400 });
  }
  try {
    const currency = await createEnterpriseCurrency(organizationId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CURRENCY_CREATED",
      entity: "EnterpriseCurrency",
      entityId: currency.id,
      request: req,
      metadata: { organizationId, currencyCode: currency.code },
    });
    await writeApiLog({
      request: req,
      statusCode: 201,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "enterprise-currencies", action: "create", currencyCode: currency.code },
    });
    return NextResponse.json({ ok: true, currency }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "FINANCE_CURRENCY_CREATE_FAILED");
  }
}
