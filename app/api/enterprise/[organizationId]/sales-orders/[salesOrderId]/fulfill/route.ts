import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { fulfillmentCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { createEnterpriseFulfillment } from "@/lib/enterprise/crm-sales/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; salesOrderId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-sales-fulfillment:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, salesOrderId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SALES_QUOTES_ORDERS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = fulfillmentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Livraison invalide." }, { status: 400 });
  try {
    const fulfillment = await createEnterpriseFulfillment(organizationId, salesOrderId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_SALES_ORDER_FULFILLED", entity: "EnterpriseSalesOrder", entityId: salesOrderId, request: req, metadata: { organizationId, fulfillmentId: fulfillment.id, idempotencyKey: parsed.data.idempotencyKey } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "sales-orders", action: "fulfill" } });
    return NextResponse.json({ ok: true, fulfillment }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "FULFILLMENT_CREATE_FAILED");
  }
}
