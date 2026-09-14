import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingPricingAccess, getEnterpriseGamingSessionAccess, getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { gamingPricingErrorResponse } from "@/lib/enterprise/gaming/http";
import { simulateGamingPricing } from "@/lib/enterprise/gaming/pricing";
import { gamingPricingSimulationSchema } from "@/lib/enterprise/gaming/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-pricing-simulate:${session.userId}`), 360, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = gamingPricingSimulationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const { organizationId } = await params;
  const wantsOverride = parsed.data.priceOverrideAmount !== undefined && parsed.data.priceOverrideAmount !== null;
  const [pricingRead, sessionRead, stationAccess, catalogAccess, pricingManage] = await Promise.all([
    getEnterpriseGamingPricingAccess({ session, organizationId, action: "read" }),
    getEnterpriseGamingSessionAccess({ session, organizationId, action: "read" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" }),
    wantsOverride ? getEnterpriseGamingPricingAccess({ session, organizationId, action: "manage" }) : Promise.resolve(null),
  ]);
  if ((!pricingRead && !sessionRead) || !stationAccess || !catalogAccess || (wantsOverride && !pricingManage)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const quote = await simulateGamingPricing(organizationId, session.userId, parsed.data, Boolean(pricingManage));
    const audit = wantsOverride
      ? writeAuditLog({
        userId: session.userId,
        action: "ENTERPRISE_GAMING_PRICING_OVERRIDE_SIMULATED",
        entity: "EnterpriseGamingPricingRule",
        entityId: quote.pricingRuleId,
        request: req,
        metadata: {
          organizationId,
          stationId: quote.station.id,
          serviceCatalogItemId: quote.service.id,
          currency: quote.currency,
          quotedAmount: quote.quotedAmount,
          overrideReason: parsed.data.priceOverrideReason,
        },
      })
      : Promise.resolve();
    await Promise.allSettled([
      audit,
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-pricing-simulation", pricingRuleId: quote.pricingRuleId } }),
    ]);
    return NextResponse.json({ ok: true, quote });
  } catch (error) {
    return gamingPricingErrorResponse(error, req);
  }
}
