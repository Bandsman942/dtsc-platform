import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseGamingDailyCloseAccess } from "@/lib/enterprise/gaming/access";
import { assignGamingDailyCloseApprover, decideGamingDailyClose, EnterpriseGamingCheckoutError, getGamingDailyClose } from "@/lib/enterprise/gaming/checkout";
import { gamingCheckoutErrorResponse } from "@/lib/enterprise/gaming/checkout-http";
import { gamingDailyCloseCommandSchema } from "@/lib/enterprise/gaming/checkout-schemas";
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
    const capabilities = {
      canAssignApprover: Boolean(gamingAccess.capabilities.canSubmit && close.status === "SUBMITTED" && close.submittedByUserId === session.userId && !close.approverUserId),
      canApprove: Boolean(gamingAccess.capabilities.canApprove && close.status === "SUBMITTED" && close.approverUserId === session.userId),
      canReject: Boolean(gamingAccess.capabilities.canApprove && close.status === "SUBMITTED" && close.approverUserId === session.userId),
    };
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-daily-close-detail", closeId } });
    return NextResponse.json({ close: { ...close, capabilities }, canManage: gamingAccess.canManage });
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
  const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = gamingDailyCloseCommandSchema.safeParse(payload);
  if (!parsed.success) {
    const action = payload && typeof payload.action === "string" ? payload.action : "";
    const reason = payload && typeof payload.reason === "string" ? payload.reason.trim() : "";
    const code = action === "REJECT" && reason.length < 8
      ? "GAMING_CLOSE_REJECTION_REASON_TOO_SHORT"
      : action === "ASSIGN_APPROVER"
        ? "GAMING_CLOSE_APPROVER_REQUIRED"
        : "GAMING_CLOSE_DECISION_INVALID";
    return gamingCheckoutErrorResponse(new EnterpriseGamingCheckoutError(code, 400), req);
  }
  const { organizationId, closeId } = await params;
  const accessAction = parsed.data.action === "ASSIGN_APPROVER" ? "submit" : "approve";
  const [gamingAccess, financeAccess] = await Promise.all([
    getEnterpriseGamingDailyCloseAccess({ session, organizationId, action: accessAction }),
    financeReadAccess(session, organizationId),
  ]);
  if (!gamingAccess || financeAccess.some((access) => !access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const close = parsed.data.action === "ASSIGN_APPROVER"
      ? await assignGamingDailyCloseApprover(organizationId, closeId, session.userId, {
          revision: parsed.data.revision,
          approverUserId: parsed.data.approverUserId,
        })
      : await decideGamingDailyClose(organizationId, closeId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({
        userId: session.userId,
        action: `ENTERPRISE_GAMING_DAILY_CLOSE_${parsed.data.action}`,
        entity: "EnterpriseGamingDailyClose",
        entityId: closeId,
        request: req,
        metadata: {
          organizationId,
          action: parsed.data.action,
          ...("reason" in parsed.data ? { reason: parsed.data.reason || null } : {}),
          ...("approverUserId" in parsed.data ? { approverUserId: parsed.data.approverUserId } : {}),
        },
      }),
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-daily-close-decision", closeId, action: parsed.data.action } }),
    ]);
    return NextResponse.json({ ok: true, close });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req, "GAMING_DAILY_CLOSE_DECISION_FAILED");
  }
}
