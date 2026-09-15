import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseGamingDailyCloseAccess } from "@/lib/enterprise/gaming/access";
import { decideGamingDailyClose, getGamingDailyClose } from "@/lib/enterprise/gaming/checkout";
import { gamingCheckoutErrorResponse } from "@/lib/enterprise/gaming/checkout-http";
import { gamingDailyCloseDecisionSchema } from "@/lib/enterprise/gaming/checkout-schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; closeId: string }> };

async function financeReadAccess(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, organizationId: string) {
  return Promise.all([
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "view" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_TREASURY", action: "view" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_CASH", action: "view" }),
  ]);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, closeId } = await params;
  const [gamingAccess, financeAccess] = await Promise.all([
    getEnterpriseGamingDailyCloseAccess({ session, organizationId, action: "read" }),
    financeReadAccess(session, organizationId),
  ]);
  if (!gamingAccess || financeAccess.some((access) => !access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const close = await getGamingDailyClose(organizationId, closeId);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-daily-close-detail", closeId } });
    return NextResponse.json({ close, canManage: gamingAccess.canManage });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req, "GAMING_DAILY_CLOSE_READ_FAILED");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-daily-close-decision:${session.userId}`), 80, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = gamingDailyCloseDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { organizationId, closeId } = await params;
  const [gamingAccess, financeAccess] = await Promise.all([
    getEnterpriseGamingDailyCloseAccess({ session, organizationId, action: "manage" }),
    financeReadAccess(session, organizationId),
  ]);
  if (!gamingAccess || financeAccess.some((access) => !access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const close = await decideGamingDailyClose(organizationId, closeId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({
        userId: session.userId,
        action: `ENTERPRISE_GAMING_DAILY_CLOSE_${parsed.data.action}`,
        entity: "EnterpriseGamingDailyClose",
        entityId: closeId,
        request: req,
        metadata: { organizationId, action: parsed.data.action, reason: parsed.data.reason || null },
      }),
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-daily-close-decision", closeId, action: parsed.data.action } }),
    ]);
    return NextResponse.json({ ok: true, close });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req, "GAMING_DAILY_CLOSE_DECISION_FAILED");
  }
}
