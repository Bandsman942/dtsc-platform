import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { listRetailPromotions, upsertRetailPromotion } from "@/lib/enterprise/retail/commercial-admin";
import { retailPromotionUpsertSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { getRetailCommercialPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize } = retailListParams(req);
  const queryParams = new URL(req.url).searchParams;
  const from = queryParams.get("from") || "", to = queryParams.get("to") || "";
  if ([from, to].some((v) => v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v + "T00:00:00.000Z")))) || (from && to && from > to)) {
    return NextResponse.json({ error: "RETAIL_DATE_RANGE_INVALID", message: "Vérifiez la période des promotions." }, { status: 400 });
  }
  try {
    const result = await listRetailPromotions(organizationId, page, pageSize, {
      search: queryParams.get("search") || "",
      status: queryParams.get("status") || "",
      ...(from ? { from: new Date(from + "T00:00:00.000Z") } : {}),
      ...(to ? { toExclusive: new Date(Date.parse(to + "T00:00:00.000Z") + 86_400_000) } : {}),
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-promotions", action: "list", page } });
    return NextResponse.json(result);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PROMOTIONS_LOAD_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCommercialPermissions(auth.session.userId, organizationId);
  if (!permissions.canManagePromotions) return NextResponse.json({ error: "Forbidden", message: "Vous n’êtes pas autorisé à administrer les promotions Retail." }, { status: 403 });
  const parsed = retailPromotionUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_PROMOTION_INPUT_INVALID", req);
  try {
    const promotion = await upsertRetailPromotion(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_PROMOTION_UPSERTED", entity: "EnterpriseRetailPromotion", entityId: promotion.id, request: req, metadata: { organizationId, code: promotion.code, type: promotion.promotionType, status: promotion.status, priority: promotion.priority } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-promotions", action: "upsert" } });
    return NextResponse.json({ ok: true, promotion });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PROMOTION_SAVE_FAILED");
  }
}
