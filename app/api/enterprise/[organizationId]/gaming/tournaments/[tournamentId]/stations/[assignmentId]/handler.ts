import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseGamingTournamentAccess } from "@/lib/enterprise/gaming/access";
import { gamingTournamentErrorResponse } from "@/lib/enterprise/gaming/tournament-http";
import { gamingTournamentStationReleaseSchema } from "@/lib/enterprise/gaming/tournament-schemas";
import { releaseGamingTournamentStation } from "@/lib/enterprise/gaming/tournaments";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; tournamentId: string; assignmentId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-tournament-station-release:${session.userId}`), 180, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = gamingTournamentStationReleaseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { organizationId, tournamentId, assignmentId } = await params;
  const access = await getEnterpriseGamingTournamentAccess({ session, organizationId, action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await releaseGamingTournamentStation(organizationId, tournamentId, assignmentId, session.userId, parsed.data.revision);
    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: "ENTERPRISE_GAMING_TOURNAMENT_STATION_RELEASED", entity: "EnterpriseGamingTournamentStation", entityId: assignmentId, request: req, metadata: { organizationId, tournamentId, idempotent: result.idempotent } }),
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-tournament-station", tournamentId } }),
    ]);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return gamingTournamentErrorResponse(error, req); }
}
