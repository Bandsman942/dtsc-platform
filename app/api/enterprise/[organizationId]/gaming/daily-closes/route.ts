import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingDailyCloseAccess } from "@/lib/enterprise/gaming/access";
import { createGamingDailyClose, listGamingDailyCloses } from "@/lib/enterprise/gaming/checkout";
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
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-daily-close", page: result.pagination.page } });
    return NextResponse.json({ ...result, canWrite: gamingAccess.canWrite, canManage: gamingAccess.canManage });
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
  const parsed = gamingDailyCloseCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
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
