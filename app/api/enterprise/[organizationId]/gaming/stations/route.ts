import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingStationAccess } from "@/lib/enterprise/gaming/access";
import { gamingStationErrorResponse } from "@/lib/enterprise/gaming/http";
import { gamingStationCreateSchema } from "@/lib/enterprise/gaming/schemas";
import { createGamingStation, listGamingStations } from "@/lib/enterprise/gaming/stations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const [gamingAccess, assetAccess, incidentAccess] = await Promise.all([
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "submit" }),
  ]);
  if (!gamingAccess || !assetAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("pageSize") || 20);
  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const result = await listGamingStations({ organizationId, page, pageSize, search, status });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, domain: "gaming-stations", page: result.pagination.page },
  });
  return NextResponse.json({
    ...result,
    canWrite: gamingAccess.canWrite,
    canManage: gamingAccess.canManage,
    canReportIncident: Boolean(incidentAccess),
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-station-create:${session.userId}`), 100, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { organizationId } = await params;
  const [gamingAccess, assetAccess] = await Promise.all([
    getEnterpriseGamingStationAccess({ session, organizationId, action: "submit" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" }),
  ]);
  if (!gamingAccess || !assetAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = gamingStationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    const station = await createGamingStation(organizationId, session.userId, parsed.data);
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_GAMING_STATION_CREATED",
      entity: "EnterpriseGamingStationProfile",
      entityId: station.id,
      request: req,
      metadata: { organizationId, assetId: station.assetId, stationCode: station.stationCode },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-stations" } });
    return NextResponse.json({ ok: true, station }, { status: 201 });
  } catch (error) {
    return gamingStationErrorResponse(error, req);
  }
}
