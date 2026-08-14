import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { mobileMoneyProviderAccountUpsertSchema } from "@/lib/enterprise/retail/mobile-money-multicurrency-schemas";
import { getMobileMoneyProviderAccountConfiguration, upsertMobileMoneyProviderAccount } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "read");
  if (!auth.ok) return auth.response;
  try {
    const configuration = await getMobileMoneyProviderAccountConfiguration(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money-provider-accounts" } });
    return NextResponse.json(configuration);
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_PROVIDER_ACCOUNTS_LOAD_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "manage", { mutation: true, limit: 80 });
  if (!auth.ok) return auth.response;
  const parsed = mobileMoneyProviderAccountUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Configuration Mobile Money invalide." }, { status: 400 });
  try {
    const mapping = await upsertMobileMoneyProviderAccount(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_MOBILE_MONEY_PROVIDER_ACCOUNT_MAPPED",
      entity: "EnterpriseRetailProviderAccount",
      entityId: mapping.id,
      request: req,
      metadata: { organizationId, providerCode: parsed.data.providerCode, currencyCode: parsed.data.currencyCode, financialAccountId: parsed.data.financialAccountId },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money-provider-accounts", action: "upsert" } });
    return NextResponse.json({ ok: true, mapping });
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_PROVIDER_ACCOUNT_UPSERT_FAILED");
  }
}
