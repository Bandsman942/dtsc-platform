import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseGamingTournamentAccess } from "@/lib/enterprise/gaming/access";
import { gamingTournamentErrorResponse } from "@/lib/enterprise/gaming/tournament-http";
import { gamingTournamentCommandSchema, gamingTournamentUpdateSchema } from "@/lib/enterprise/gaming/tournament-schemas";
import { commandGamingTournament, getGamingTournamentDetail, updateGamingTournament } from "@/lib/enterprise/gaming/tournaments";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; tournamentId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, tournamentId } = await params;
  const [access, financeAccess] = await Promise.all([
    getEnterpriseGamingTournamentAccess({ session, organizationId, action: "read" }),
    getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "view" }),
  ]);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await getGamingTournamentDetail(organizationId, tournamentId, { includeFinance: Boolean(financeAccess) });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-tournament-detail", tournamentId } });
    return NextResponse.json({ ...result, canWrite: access.canWrite, canManage: access.canManage, canSeeFinance: Boolean(financeAccess) });
  } catch (error) { return gamingTournamentErrorResponse(error, req); }
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-tournament-mutate:${session.userId}`), 180, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { organizationId, tournamentId } = await params;
  const access = await getEnterpriseGamingTournamentAccess({ session, organizationId, action: body?.action === "ARCHIVE" ? "manage" : "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const isUpdate = body?.action === "UPDATE";
    const result = isUpdate
      ? await updateGamingTournament(organizationId, tournamentId, session.userId, gamingTournamentUpdateSchema.parse({ ...body, action: undefined }))
      : await commandGamingTournament(organizationId, tournamentId, session.userId, gamingTournamentCommandSchema.parse(body));
    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: isUpdate ? "ENTERPRISE_GAMING_TOURNAMENT_UPDATED" : `ENTERPRISE_GAMING_TOURNAMENT_${String(body?.action || "COMMAND")}`, entity: "EnterpriseGamingTournament", entityId: tournamentId, request: req, metadata: { organizationId } }),
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-tournament-detail", tournamentId } }),
    ]);
    return NextResponse.json({ ok: true, result });
  } catch (error) { return gamingTournamentErrorResponse(error, req); }
}
