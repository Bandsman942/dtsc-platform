import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { listRetailCustomers, upsertRetailCustomerProfile } from "@/lib/enterprise/retail/customer-payments";
import { retailCustomerProfileUpsertSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canReadCustomers) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas de consulter les clients Retail." }, { status: 403 });
  const { page, pageSize, search } = retailListParams(req);
  try {
    const result = await listRetailCustomers(organizationId, search, page, pageSize);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-customers", action: "list", page, pageSize, search: Boolean(search) } });
    return NextResponse.json(result);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_CUSTOMERS_LOAD_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canManageCustomers) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas de modifier le profil Retail d’un client." }, { status: 403 });
  const parsed = retailCustomerProfileUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Profil client invalide." }, { status: 400 });
  try {
    const profile = await upsertRetailCustomerProfile(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_CUSTOMER_PROFILE_UPSERTED", entity: "EnterpriseRetailCustomerProfile", entityId: profile.id, request: req, metadata: { organizationId, businessPartyId: profile.businessPartyId, segmentCode: profile.segmentCode, priceListCode: profile.priceListCode, status: profile.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-customers", action: "upsert-profile" } });
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_CUSTOMER_PROFILE_SAVE_FAILED");
  }
}
