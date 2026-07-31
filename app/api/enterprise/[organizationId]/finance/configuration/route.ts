import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getFinanceReadiness, refreshFinanceReadiness, upsertFinanceConfiguration } from "@/lib/enterprise/accounting/configuration-service";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { financeConfigurationSchema } from "@/lib/enterprise/accounting/schemas";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "view");
  if (!auth.ok) return auth.response;
  try {
    const readiness = await getFinanceReadiness(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "finance-configuration" } });
    return NextResponse.json(readiness);
  } catch (error) { return financeErrorResponse(error, "FINANCE_CONFIGURATION_READ_FAILED"); }
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = financeConfigurationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const configuration = await upsertFinanceConfiguration(organizationId, auth.session.userId, parsed.data);
    const readiness = await refreshFinanceReadiness(organizationId, auth.session.userId);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_FINANCE_CONFIGURATION_UPDATED", entity: "EnterpriseFinanceConfiguration", entityId: configuration.id, request: req, metadata: { organizationId, functionalCurrencyCode: configuration.functionalCurrencyCode } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "finance-configuration" } });
    return NextResponse.json({ ok: true, configuration: readiness });
  } catch (error) { return financeErrorResponse(error, "FINANCE_CONFIGURATION_UPDATE_FAILED"); }
}
