import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseGamingSessionAccess, getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { gamingSessionErrorResponse } from "@/lib/enterprise/gaming/http";
import { gamingSessionTransitionSchema } from "@/lib/enterprise/gaming/schemas";
import { promoteEndedGamingSessionToCheckout } from "@/lib/enterprise/gaming/session-checkout-state";
import { transitionGamingSession } from "@/lib/enterprise/gaming/sessions";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; sessionId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-session-transition:${session.userId}`), 600, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = gamingSessionTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });

  const { organizationId, sessionId } = await params;
  const [gamingAccess, stationAccess] = await Promise.all([
    getEnterpriseGamingSessionAccess({ session, organizationId, action: "write" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
  ]);
  if (!gamingAccess || !stationAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await transitionGamingSession(organizationId, sessionId, session.userId, parsed.data);
    const checkoutState = parsed.data.action === "END"
      ? await promoteEndedGamingSessionToCheckout(organizationId, sessionId, session.userId, parsed.data.idempotencyKey)
      : null;
    const responseSession = checkoutState?.status === "TO_CHECKOUT"
      ? { ...result.session, status: "TO_CHECKOUT", revision: checkoutState.revision ?? result.session.revision }
      : result.session;
    await writeAuditLog({
      userId: session.userId,
      action: `ENTERPRISE_GAMING_SESSION_${parsed.data.action}${result.idempotent ? "_REPLAYED" : ""}`,
      entity: "EnterpriseGamingSession",
      entityId: sessionId,
      request: req,
      metadata: {
        organizationId,
        idempotent: result.idempotent,
        transition: parsed.data.action,
        pricingRuleId: result.session.pricingRuleId,
        currency: result.session.currency,
        quotedAmount: result.session.quotedAmount?.toString() || null,
        finalAmount: result.session.finalAmount?.toString() || null,
        readyToCheckout: checkoutState?.status === "TO_CHECKOUT",
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-sessions", transition: parsed.data.action } });
    return NextResponse.json({ ok: true, ...result, session: responseSession });
  } catch (error) {
    return gamingSessionErrorResponse(error, req);
  }
}
