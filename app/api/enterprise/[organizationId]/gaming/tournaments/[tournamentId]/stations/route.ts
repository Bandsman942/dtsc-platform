import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingStationAccess, getEnterpriseGamingTournamentAccess } from "@/lib/enterprise/gaming/access";
import { gamingTournamentErrorResponse } from "@/lib/enterprise/gaming/tournament-http";
import { gamingTournamentStationSchema } from "@/lib/enterprise/gaming/tournament-schemas";
import { assignGamingTournamentStation } from "@/lib/enterprise/gaming/tournaments";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; tournamentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-tournament-station:${session.userId}`), 180, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = gamingTournamentStationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { organizationId, tournamentId } = await params;
  const [access, stationAccess, assetAccess] = await Promise.all([
    getEnterpriseGamingTournamentAccess({ session, organizationId, action: "write" }),
    getEnterpriseGamingStationAccess({ session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" }),
  ]);
  if (!access || !stationAccess || !assetAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await assignGamingTournamentStation(organizationId, tournamentId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: result.idempotent ? "ENTERPRISE_GAMING_TOURNAMENT_STATION_REPLAYED" : "ENTERPRISE_GAMING_TOURNAMENT_STATION_ASSIGNED", entity: "EnterpriseGamingTournamentStation", entityId: result.assignment.id, request: req, metadata: { organizationId, tournamentId, stationId: result.assignment.stationId, idempotent: result.idempotent } }),
      writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-tournament-station", tournamentId } }),
    ]);
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) { return gamingTournamentErrorResponse(error, req); }
}
