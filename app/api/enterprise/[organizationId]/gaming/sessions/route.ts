import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingPricingAccess, getEnterpriseGamingSessionAccess, getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { gamingSessionErrorResponse } from "@/lib/enterprise/gaming/http";
import { gamingSessionStartSchema } from "@/lib/enterprise/gaming/schemas";
import { listGamingSessions, startGamingSession } from "@/lib/enterprise/gaming/sessions";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [gamingAccess, stationAccess, pricingAccess] = await Promise.all([
    getEnterpriseGamingSessionAccess({ session, organizationId, action: "read" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
    getEnterpriseGamingPricingAccess({ session, organizationId, action: "read" }),
  ]);
  if (!gamingAccess || !stationAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const result = await listGamingSessions({
    organizationId,
    page: Number(url.searchParams.get("page") || 1),
    pageSize: Number(url.searchParams.get("pageSize") || 20),
    search: url.searchParams.get("search") || "",
    status: url.searchParams.get("status") || "",
  });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "gaming-sessions", page: result.pagination.page },
  });
  return NextResponse.json({
    ...result,
    canWrite: gamingAccess.canWrite,
    canManage: gamingAccess.canManage,
    canReadPricing: Boolean(pricingAccess),
    canOverridePricing: Boolean(pricingAccess?.canManage),
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-session-start:${session.userId}`), 240, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = gamingSessionStartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const { organizationId } = await params;
  const wantsOverride = parsed.data.priceOverrideAmount !== undefined && parsed.data.priceOverrideAmount !== null;
  const [gamingAccess, stationAccess, catalogAccess, crmAccess, pricingAccess] = await Promise.all([
    getEnterpriseGamingSessionAccess({ session, organizationId, action: "submit" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" }),
    parsed.data.businessPartyId
      ? getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_CUSTOMERS", action: "read" })
      : Promise.resolve(true),
    wantsOverride
      ? getEnterpriseGamingPricingAccess({ session, organizationId, action: "manage" })
      : getEnterpriseGamingPricingAccess({ session, organizationId, action: "read" }),
  ]);
  if (!gamingAccess || !stationAccess || !catalogAccess || !crmAccess || (wantsOverride && !pricingAccess)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await startGamingSession(organizationId, session.userId, parsed.data, { canOverridePricing: Boolean(pricingAccess?.canManage) });
    await writeAuditLog({
      userId: session.userId,
      action: result.idempotent ? "ENTERPRISE_GAMING_SESSION_START_REPLAYED" : "ENTERPRISE_GAMING_SESSION_STARTED",
      entity: "EnterpriseGamingSession",
      entityId: result.session.id,
      request: req,
      metadata: {
        organizationId,
        stationId: result.session.stationId,
        serviceCatalogItemId: result.session.serviceCatalogItemId,
        pricingRuleId: result.session.pricingRuleId,
        currency: result.session.currency,
        quotedAmount: result.session.quotedAmount?.toString() || null,
        priceOverride: wantsOverride,
        priceOverrideReason: wantsOverride ? parsed.data.priceOverrideReason : null,
        idempotent: result.idempotent,
      },
    });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-sessions" } });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return gamingSessionErrorResponse(error, req);
  }
}
