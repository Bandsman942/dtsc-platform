import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingCheckoutAccess, getEnterpriseGamingSessionAccess } from "@/lib/enterprise/gaming/access";
import { listGamingCheckouts, prepareGamingCheckout } from "@/lib/enterprise/gaming/checkout";
import { gamingCheckoutErrorResponse } from "@/lib/enterprise/gaming/checkout-http";
import { gamingCheckoutPrepareSchema } from "@/lib/enterprise/gaming/checkout-schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [gamingAccess, financeAccess] = await Promise.all([
    getEnterpriseGamingCheckoutAccess({ session, organizationId, action: "read" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "view" }),
  ]);
  if (!gamingAccess || !financeAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  try {
    const result = await listGamingCheckouts(organizationId, {
      page: Number(url.searchParams.get("page") || 1),
      pageSize: Number(url.searchParams.get("pageSize") || 20),
      status: url.searchParams.get("status")?.trim() || undefined,
      search: url.searchParams.get("search")?.trim() || undefined,
    });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-checkout", page: result.pagination.page } });
    return NextResponse.json({ ...result, canWrite: gamingAccess.canWrite, canManage: gamingAccess.canManage });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req);
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-checkout-create:${session.userId}`), 120, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = gamingCheckoutPrepareSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { organizationId } = await params;
  const needsInventory = parsed.data.extraItems.length > 0;
  const [checkoutAccess, sessionAccess, catalogAccess, inventoryAccess, receivableCreate, receivableSubmit] = await Promise.all([
    getEnterpriseGamingCheckoutAccess({ session, organizationId, action: "submit" }),
    getEnterpriseGamingSessionAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" }),
    needsInventory
      ? getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" })
      : Promise.resolve(true),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "create" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "submit" }),
  ]);
  if (!checkoutAccess || !sessionAccess || !catalogAccess || !inventoryAccess || !receivableCreate || !receivableSubmit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await prepareGamingCheckout(organizationId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({
        userId: session.userId,
        action: result.idempotent ? "ENTERPRISE_GAMING_CHECKOUT_REPLAYED" : "ENTERPRISE_GAMING_CHECKOUT_CREATED",
        entity: "EnterpriseGamingCheckout",
        entityId: result.checkout.id,
        request: req,
        metadata: {
          organizationId,
          sessionId: result.checkout.sessionId,
          salesInvoiceId: result.checkout.salesInvoiceId,
          extraItemCount: parsed.data.extraItems.length,
          warehouseId: parsed.data.warehouseId || null,
          idempotent: result.idempotent,
        },
      }),
      writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-checkout" } }),
    ]);
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req);
  }
}
