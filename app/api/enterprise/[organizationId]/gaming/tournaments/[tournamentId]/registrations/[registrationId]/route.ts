import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseGamingTournamentAccess } from "@/lib/enterprise/gaming/access";
import { gamingTournamentErrorResponse } from "@/lib/enterprise/gaming/tournament-http";
import { gamingTournamentRegistrationCommandSchema } from "@/lib/enterprise/gaming/tournament-schemas";
import { commandGamingTournamentRegistration } from "@/lib/enterprise/gaming/tournaments";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; tournamentId: string; registrationId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-tournament-registration-command:${session.userId}`), 240, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = gamingTournamentRegistrationCommandSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { organizationId, tournamentId, registrationId } = await params;
  const access = await getEnterpriseGamingTournamentAccess({ session, organizationId, action: parsed.data.action === "DISQUALIFY" ? "manage" : "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const registration = await commandGamingTournamentRegistration(organizationId, tournamentId, registrationId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: `ENTERPRISE_GAMING_TOURNAMENT_REGISTRATION_${parsed.data.action}`, entity: "EnterpriseGamingTournamentRegistration", entityId: registrationId, request: req, metadata: { organizationId, tournamentId } }),
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-tournament-registration", tournamentId } }),
    ]);
    return NextResponse.json({ ok: true, registration });
  } catch (error) { return gamingTournamentErrorResponse(error, req); }
}
