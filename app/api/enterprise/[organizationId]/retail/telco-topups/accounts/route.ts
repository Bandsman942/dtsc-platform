import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { telcoProviderAccountUpsertSchema } from "@/lib/enterprise/retail/telco-multicurrency-schemas";
import { getTelcoProviderAccountConfiguration, upsertTelcoProviderAccount } from "@/lib/enterprise/retail/telco-multicurrency-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "read");
  if (!auth.ok) return auth.response;
  try {
    const configuration = await getTelcoProviderAccountConfiguration(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-provider-accounts" } });
    return NextResponse.json(configuration);
  } catch (error) {
    return retailErrorResponse(error, "TELCO_PROVIDER_ACCOUNTS_LOAD_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "manage", { mutation: true, limit: 80 });
  if (!auth.ok) return auth.response;
  const parsed = telcoProviderAccountUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Configuration Télécom invalide." }, { status: 400 });
  try {
    const mapping = await upsertTelcoProviderAccount(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_TELCO_PROVIDER_ACCOUNT_MAPPED",
      entity: "EnterpriseRetailProviderAccount",
      entityId: mapping.id,
      request: req,
      metadata: { organizationId, providerCode: parsed.data.providerCode, currencyCode: parsed.data.currencyCode, financialAccountId: parsed.data.financialAccountId },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-provider-accounts", action: "upsert" } });
    return NextResponse.json({ ok: true, mapping });
  } catch (error) {
    return retailErrorResponse(error, "TELCO_PROVIDER_ACCOUNT_UPSERT_FAILED");
  }
}
