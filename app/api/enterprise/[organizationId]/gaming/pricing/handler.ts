import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingPricingAccess, getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { gamingPricingErrorResponse } from "@/lib/enterprise/gaming/http";
import { createGamingPricingRule, listGamingPricingRules } from "@/lib/enterprise/gaming/pricing";
import { gamingPricingRuleCreateSchema } from "@/lib/enterprise/gaming/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [pricingAccess, catalogAccess, stationAccess] = await Promise.all([
    getEnterpriseGamingPricingAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
  ]);
  if (!pricingAccess || !catalogAccess || !stationAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  try {
    const result = await listGamingPricingRules({
      organizationId,
      page: Number(url.searchParams.get("page") || 1),
      pageSize: Number(url.searchParams.get("pageSize") || 20),
      search: url.searchParams.get("search") || "",
      status: url.searchParams.get("status") || "",
    });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-pricing", page: result.pagination.page } });
    return NextResponse.json({ ...result, canWrite: pricingAccess.canWrite, canManage: pricingAccess.canManage });
  } catch (error) {
    return gamingPricingErrorResponse(error, req);
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-pricing-create:${session.userId}`), 180, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = gamingPricingRuleCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });

  const { organizationId } = await params;
  const [pricingAccess, catalogAccess, stationAccess] = await Promise.all([
    getEnterpriseGamingPricingAccess({ session, organizationId, action: "submit" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
  ]);
  if (!pricingAccess || !catalogAccess || !stationAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const rule = await createGamingPricingRule(organizationId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({
        userId: session.userId,
        action: "ENTERPRISE_GAMING_PRICING_RULE_CREATED",
        entity: "EnterpriseGamingPricingRule",
        entityId: rule.id,
        request: req,
        metadata: {
          organizationId,
          code: rule.code,
          serviceCatalogItemId: rule.serviceCatalogItemId,
          pricingMode: rule.pricingMode,
          currency: rule.currency,
          status: rule.status,
        },
      }),
      writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-pricing" } }),
    ]);
    return NextResponse.json({ ok: true, rule }, { status: 201 });
  } catch (error) {
    return gamingPricingErrorResponse(error, req);
  }
}
