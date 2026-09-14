import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingBookingAccess, getEnterpriseGamingSessionAccess, getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { transitionGamingBooking } from "@/lib/enterprise/gaming/bookings";
import { gamingBookingErrorResponse } from "@/lib/enterprise/gaming/http";
import { gamingBookingTransitionSchema } from "@/lib/enterprise/gaming/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; bookingId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-booking-update:${session.userId}`), 360, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = gamingBookingTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  const { organizationId, bookingId } = await params;
  const [bookingAccess, stationAccess, crmAccess, sessionAccess] = await Promise.all([
    getEnterpriseGamingBookingAccess({ session, organizationId, action: "write" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_CUSTOMERS", action: "read" }),
    parsed.data.action === "CONVERT"
      ? getEnterpriseGamingSessionAccess({ session, organizationId, action: "submit" })
      : Promise.resolve(true),
  ]);
  if (!bookingAccess || !stationAccess || !crmAccess || !sessionAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await transitionGamingBooking(organizationId, bookingId, session.userId, parsed.data);
    await writeAuditLog({
      userId: session.userId,
      action: result.idempotent ? "ENTERPRISE_GAMING_BOOKING_COMMAND_REPLAYED" : `ENTERPRISE_GAMING_BOOKING_${parsed.data.action}`,
      entity: "EnterpriseGamingBooking",
      entityId: bookingId,
      request: req,
      metadata: { organizationId, action: parsed.data.action, status: result.booking.status, idempotent: result.idempotent, sessionId: result.booking.session?.id || null },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-bookings", action: parsed.data.action } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return gamingBookingErrorResponse(error, req);
  }
}
