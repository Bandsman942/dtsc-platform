import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingDailyCloseAccess } from "@/lib/enterprise/gaming/access";
import { createGamingDailyClose, EnterpriseGamingCheckoutError, listGamingDailyCloses } from "@/lib/enterprise/gaming/checkout";
import { gamingCheckoutErrorResponse } from "@/lib/enterprise/gaming/checkout-http";
import { gamingDailyCloseCreateSchema } from "@/lib/enterprise/gaming/checkout-schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

async function readAccess(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, organizationId: string) {
  return Promise.all([
    getEnterpriseGamingDailyCloseAccess({ session, organizationId, action: "read" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "view" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_TREASURY", action: "view" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_CASH", action: "view" }),
  ]);
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [gamingAccess, paymentsAccess, treasuryAccess, cashAccess] = await readAccess(session, organizationId);
  if (!gamingAccess || !paymentsAccess || !treasuryAccess || !cashAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  try {
    const result = await listGamingDailyCloses(organizationId, {
      page: Number(url.searchParams.get("page") || 1),
      pageSize: Number(url.searchParams.get("pageSize") || 20),
      status: url.searchParams.get("status")?.trim() || undefined,
      siteId: url.searchParams.get("siteId")?.trim() || undefined,
    });
    const items = result.items.map((item) => ({
      ...item,
      capabilities: {
        canAssignApprover: Boolean(gamingAccess.capabilities.canSubmit && item.status === "SUBMITTED" && item.submittedByUserId === session.userId && !item.approverUserId),
        canApprove: Boolean(gamingAccess.capabilities.canApprove && item.status === "SUBMITTED" && item.approverUserId === session.userId),
        canReject: Boolean(gamingAccess.capabilities.canApprove && item.status === "SUBMITTED" && item.approverUserId === session.userId),
      },
    }));
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-daily-close", page: result.pagination.page } });
    return NextResponse.json({ ...result, items, canWrite: gamingAccess.canWrite, canManage: gamingAccess.canManage });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req, "GAMING_DAILY_CLOSE_LIST_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-daily-close-create:${session.userId}`), 80, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const payload = await req.json().catch(() => null);
  const parsed = gamingDailyCloseCreateSchema.safeParse(payload);
  if (!parsed.success) {
    const missingApprover = parsed.error.issues.some((issue) => issue.path[0] === "approverUserId");
    return gamingCheckoutErrorResponse(
      new EnterpriseGamingCheckoutError(missingApprover ? "GAMING_CLOSE_APPROVER_REQUIRED" : "GAMING_CLOSE_SUBMISSION_INVALID", 400),
      req,
    );
  }
  const { organizationId } = await params;
  const [gamingAccess, paymentsAccess, treasuryAccess, cashAccess, sitesAccess] = await Promise.all([
    getEnterpriseGamingDailyCloseAccess({ session, organizationId, action: "submit" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_PAYMENTS", action: "view" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_TREASURY", action: "view" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_CASH", action: "view" }),
    parsed.data.siteId
      ? getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "read" })
      : Promise.resolve(true),
  ]);
  if (!gamingAccess || !paymentsAccess || !treasuryAccess || !cashAccess || !sitesAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await createGamingDailyClose(organizationId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({
        userId: session.userId,
        action: result.idempotent ? "ENTERPRISE_GAMING_DAILY_CLOSE_REPLAYED" : "ENTERPRISE_GAMING_DAILY_CLOSE_SUBMITTED",
        entity: "EnterpriseGamingDailyClose",
        entityId: result.close.id,
        request: req,
        metadata: {
          organizationId,
          businessDate: result.close.businessDate,
          siteId: result.close.siteId,
          timezone: result.close.timezone,
          declarationCount: parsed.data.declarations.length,
          approverUserId: parsed.data.approverUserId,
          idempotent: result.idempotent,
        },
      }),
      writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-daily-close" } }),
    ]);
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return gamingCheckoutErrorResponse(error, req, "GAMING_DAILY_CLOSE_CREATE_FAILED");
  }
}
