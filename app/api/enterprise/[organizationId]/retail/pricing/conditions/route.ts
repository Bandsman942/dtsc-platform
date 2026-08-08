import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { listRetailPriceConditions, upsertRetailPriceCondition } from "@/lib/enterprise/retail/commercial-admin";
import { retailPriceConditionUpsertSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCommercialPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  try {
    const items = await listRetailPriceConditions(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pricing", action: "list-conditions", count: items.length } });
    return NextResponse.json({ items });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PRICE_CONDITIONS_LOAD_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCommercialPermissions(auth.session.userId, organizationId);
  if (!permissions.canManagePricing) return NextResponse.json({ error: "Forbidden", message: "Vous n’êtes pas autorisé à administrer les règles de prix Retail." }, { status: 403 });
  const parsed = retailPriceConditionUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Règle de prix invalide." }, { status: 400 });
  try {
    const condition = await upsertRetailPriceCondition(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_PRICE_CONDITION_UPSERTED", entity: "EnterpriseRetailPriceCondition", entityId: condition.id, request: req, metadata: { organizationId, catalogPriceId: condition.catalogPriceId, siteId: condition.siteId, priority: condition.priority, active: condition.isActive } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pricing", action: "upsert-condition" } });
    return NextResponse.json({ ok: true, condition });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PRICE_CONDITION_SAVE_FAILED");
  }
}
