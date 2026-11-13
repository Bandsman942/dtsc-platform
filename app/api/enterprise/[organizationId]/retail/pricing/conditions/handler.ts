import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
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
    const params = new URL(req.url).searchParams;
    const page = Math.max(1, Math.min(1000, Number(params.get("page") || "1") || 1));
    const pageSize = Math.max(5, Math.min(100, Number(params.get("pageSize") || "20") || 20));
    const from = params.get("from") || "", to = params.get("to") || "";
    if ([from, to].some((v) => v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v + "T00:00:00.000Z")))) || (from && to && from > to)) {
      return NextResponse.json({ error: "RETAIL_DATE_RANGE_INVALID", message: "Vérifiez la période des règles." }, { status: 400 });
    }
    const result = await listRetailPriceConditions(organizationId, {
      page, pageSize, search: params.get("search") || "",
      ...(params.get("active") === "true" ? { active: true } : params.get("active") === "false" ? { active: false } : {}),
      ...(from ? { from: new Date(from + "T00:00:00.000Z") } : {}),
      ...(to ? { toExclusive: new Date(Date.parse(to + "T00:00:00.000Z") + 86_400_000) } : {}),
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pricing", action: "list-conditions", page, count: result.items.length } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
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
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_PRICING_CONDITIONS_INPUT_INVALID", req);
  try {
    const condition = await upsertRetailPriceCondition(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_PRICE_CONDITION_UPSERTED", entity: "EnterpriseRetailPriceCondition", entityId: condition.id, request: req, metadata: { organizationId, catalogPriceId: condition.catalogPriceId, siteId: condition.siteId, priority: condition.priority, active: condition.isActive } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-pricing", action: "upsert-condition" } });
    return NextResponse.json({ ok: true, condition });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PRICE_CONDITION_SAVE_FAILED");
  }
}
