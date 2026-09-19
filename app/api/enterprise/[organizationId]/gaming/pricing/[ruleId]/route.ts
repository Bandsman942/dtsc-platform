import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingPricingAccess, getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { gamingPricingErrorResponse } from "@/lib/enterprise/gaming/http";
import { updateGamingPricingRule } from "@/lib/enterprise/gaming/pricing";
import { gamingPricingRuleUpdateSchema } from "@/lib/enterprise/gaming/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; ruleId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-pricing-update:${session.userId}`), 240, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = gamingPricingRuleUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });

  const { organizationId, ruleId } = await params;
  const privilegedAction = parsed.data.action === "ACTIVATE" || parsed.data.action === "DEACTIVATE" || parsed.data.action === "ARCHIVE";
  const [pricingAccess, catalogAccess, stationAccess] = await Promise.all([
    getEnterpriseGamingPricingAccess({ session, organizationId, action: privilegedAction ? "manage" : "write" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
  ]);
  if (!pricingAccess || !catalogAccess || !stationAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const rule = await updateGamingPricingRule(organizationId, ruleId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({
        userId: session.userId,
        action: `ENTERPRISE_GAMING_PRICING_RULE_${parsed.data.action}`,
        entity: "EnterpriseGamingPricingRule",
        entityId: ruleId,
        request: req,
        metadata: { organizationId, action: parsed.data.action, revision: parsed.data.revision },
      }),
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-pricing", action: parsed.data.action } }),
    ]);
    return NextResponse.json({ ok: true, rule });
  } catch (error) {
    return gamingPricingErrorResponse(error, req);
  }
}
