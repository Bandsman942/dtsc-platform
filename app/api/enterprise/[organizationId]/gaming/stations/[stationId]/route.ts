import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { gamingStationErrorResponse } from "@/lib/enterprise/gaming/http";
import { gamingStationUpdateSchema } from "@/lib/enterprise/gaming/schemas";
import { updateGamingStation } from "@/lib/enterprise/gaming/stations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; stationId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-station-update:${session.userId}`), 180, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { organizationId, stationId } = await params;
  const parsed = gamingStationUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const requiredAction = parsed.data.action === "ARCHIVE" ? "manage" : "write";
  const [gamingAccess, assetAccess] = await Promise.all([
    getEnterpriseGamingStationAccess({ session, organizationId, action: requiredAction }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" }),
  ]);
  if (!gamingAccess || !assetAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    if (parsed.data.action === "BLOCK" || parsed.data.action === "SET_AVAILABLE") {
      const liveSession = await prisma.enterpriseGamingSession.findFirst({
        where: { organizationId, stationId, archivedAt: null, status: { in: ["ACTIVE", "PAUSED"] } },
        select: { id: true },
      });
      if (liveSession) throw new EnterpriseDomainError("GAMING_STATION_HAS_LIVE_SESSION", 409);
    }

    const station = await updateGamingStation(organizationId, stationId, session.userId, parsed.data);
    await writeAuditLog({
      userId: session.userId,
      action: `ENTERPRISE_GAMING_STATION_${parsed.data.action}`,
      entity: "EnterpriseGamingStationProfile",
      entityId: stationId,
      request: req,
      metadata: { organizationId, action: parsed.data.action },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: session.userId,
      startedAt,
      metadata: { organizationId, stationId, domain: "gaming-stations", action: parsed.data.action },
    });
    return NextResponse.json({ ok: true, station });
  } catch (error) {
    return gamingStationErrorResponse(error, req);
  }
}
