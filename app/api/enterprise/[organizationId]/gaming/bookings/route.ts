import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingBookingAccess, getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { createGamingBooking, listGamingBookings } from "@/lib/enterprise/gaming/bookings";
import { gamingBookingErrorResponse } from "@/lib/enterprise/gaming/http";
import { gamingBookingCreateSchema } from "@/lib/enterprise/gaming/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [bookingAccess, stationAccess, crmAccess] = await Promise.all([
    getEnterpriseGamingBookingAccess({ session, organizationId, action: "read" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_CUSTOMERS", action: "read" }),
  ]);
  if (!bookingAccess || !stationAccess || !crmAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const result = await listGamingBookings({
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
    metadata: { organizationId, domain: "gaming-bookings", page: result.pagination.page },
  });
  return NextResponse.json({ ...result, canWrite: bookingAccess.canWrite, canManage: bookingAccess.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-booking-create:${session.userId}`), 240, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = gamingBookingCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const { organizationId } = await params;
  const [bookingAccess, stationAccess, crmAccess] = await Promise.all([
    getEnterpriseGamingBookingAccess({ session, organizationId, action: "submit" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_CUSTOMERS", action: "read" }),
  ]);
  if (!bookingAccess || !stationAccess || !crmAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await createGamingBooking(organizationId, session.userId, parsed.data);
    await writeAuditLog({
      userId: session.userId,
      action: result.idempotent ? "ENTERPRISE_GAMING_BOOKING_CREATE_REPLAYED" : "ENTERPRISE_GAMING_BOOKING_CREATED",
      entity: "EnterpriseGamingBooking",
      entityId: result.booking.id,
      request: req,
      metadata: { organizationId, stationId: result.booking.stationId, status: result.booking.status, idempotent: result.idempotent },
    });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-bookings" } });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return gamingBookingErrorResponse(error, req);
  }
}
