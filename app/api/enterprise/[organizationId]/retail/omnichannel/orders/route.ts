import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { createRetailOmnichannelOrder, getRetailOmnichannelOrders, RETAIL_OMNICHANNEL_MODES } from "@/lib/enterprise/retail/omnichannel";

const createSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  customerBusinessPartyId: z.string().trim().min(1).max(240),
  sourceSiteId: z.string().trim().min(1).max(240),
  fulfillmentWarehouseId: z.string().trim().min(1).max(240),
  pickupSiteId: z.string().trim().min(1).max(240).optional().nullable(),
  fulfillmentMode: z.enum(RETAIL_OMNICHANNEL_MODES),
  currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  expectedFulfillmentAt: z.coerce.date().optional().nullable(),
  reservationExpiresAt: z.coerce.date().optional().nullable(),
  lines: z.array(z.object({ catalogItemId: z.string().trim().min(1).max(240), quantity: z.coerce.number().positive().max(1_000_000) })).min(1).max(200),
});

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const state = await getRetailOmnichannelOrders(organizationId, page, pageSize);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-omnichannel-orders", page } });
  return NextResponse.json(state);
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "write", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Commande omnicanale invalide." }, { status: 400 });
  try {
    const result = await createRetailOmnichannelOrder(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_OMNICHANNEL_ORDER_CREATED",
      entity: "EnterpriseSalesOrder",
      entityId: result.order.id,
      metadata: { organizationId, fulfillmentMode: result.orchestration.fulfillmentMode, warehouseId: result.orchestration.fulfillmentWarehouseId, reservationCount: result.reservations.length, idempotent: result.idempotent },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-omnichannel-orders", salesOrderId: result.order.id, idempotent: result.idempotent } });
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_OMNICHANNEL_ORDER_FAILED");
  }
}
