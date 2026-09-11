import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { enterpriseCurrencyUpdateSchema } from "@/lib/enterprise/accounting/currency-schemas";
import { updateEnterpriseCurrency } from "@/lib/enterprise/accounting/currency-service";

type Params = { params: Promise<{ organizationId: string; currencyId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, currencyId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = enterpriseCurrencyUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "FINANCE_CURRENCY_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Vérifiez les informations de la devise." }, { status: 400 });
  }
  try {
    const currency = await updateEnterpriseCurrency(organizationId, currencyId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: currency.isActive ? "ENTERPRISE_CURRENCY_UPDATED" : "ENTERPRISE_CURRENCY_DEACTIVATED",
      entity: "EnterpriseCurrency",
      entityId: currency.id,
      request: req,
      metadata: { organizationId, currencyCode: currency.code, isActive: currency.isActive },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "enterprise-currencies", action: "update", currencyCode: currency.code, isActive: currency.isActive },
    });
    return NextResponse.json({ ok: true, currency });
  } catch (error) {
    return financeErrorResponse(error, "FINANCE_CURRENCY_UPDATE_FAILED");
  }
}
