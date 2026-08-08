import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { issueRetailStoredValue, listRetailStoredValueAccounts } from "@/lib/enterprise/retail/customer-payments";
import { retailStoredValueIssueSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canIssueStoredValue && !permissions.canRefundStoredValue) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const customerBusinessPartyId = new URL(req.url).searchParams.get("customerBusinessPartyId");
  const items = await listRetailStoredValueAccounts(organizationId, customerBusinessPartyId);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-stored-value", action: "list", customerScoped: Boolean(customerBusinessPartyId) } });
  return NextResponse.json({ items });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canIssueStoredValue) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas d’émettre une carte cadeau ou un avoir." }, { status: 403 });
  const parsed = retailStoredValueIssueSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Émission de valeur stockée invalide." }, { status: 400 });
  try {
    const result = await issueRetailStoredValue(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_STORED_VALUE_ISSUED", entity: "EnterpriseRetailStoredValueAccount", entityId: result.account.id, request: req, metadata: { organizationId, accountType: result.account.accountType, displayCode: result.account.displayCode, amount: result.account.initialValue.toString(), currencyCode: result.account.currencyCode, customerBusinessPartyId: result.account.customerBusinessPartyId, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-stored-value", action: "issue", idempotent: result.idempotent } });
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_STORED_VALUE_ISSUE_FAILED");
  }
}
