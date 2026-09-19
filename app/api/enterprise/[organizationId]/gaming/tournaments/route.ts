import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingTournamentAccess } from "@/lib/enterprise/gaming/access";
import { gamingTournamentErrorResponse } from "@/lib/enterprise/gaming/tournament-http";
import { gamingTournamentCreateSchema } from "@/lib/enterprise/gaming/tournament-schemas";
import { createGamingTournament, listGamingTournaments } from "@/lib/enterprise/gaming/tournaments";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseGamingTournamentAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  try {
    const result = await listGamingTournaments(organizationId, { page: Number(url.searchParams.get("page") || 1), pageSize: Number(url.searchParams.get("pageSize") || 20), status: url.searchParams.get("status")?.trim() || undefined, search: url.searchParams.get("search")?.trim() || undefined });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-tournaments", page: result.pagination.page } });
    return NextResponse.json({ ...result, canWrite: access.canWrite, canManage: access.canManage });
  } catch (error) { return gamingTournamentErrorResponse(error, req); }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-tournament-create:${session.userId}`), 60, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = gamingTournamentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { organizationId } = await params;
  const [access, siteAccess, catalogAccess] = await Promise.all([
    getEnterpriseGamingTournamentAccess({ session, organizationId, action: "submit" }),
    parsed.data.siteId ? getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "read" }) : Promise.resolve(true),
    parsed.data.entryCatalogItemId ? getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" }) : Promise.resolve(true),
  ]);
  if (!access || !siteAccess || !catalogAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await createGamingTournament(organizationId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: result.idempotent ? "ENTERPRISE_GAMING_TOURNAMENT_REPLAYED" : "ENTERPRISE_GAMING_TOURNAMENT_CREATED", entity: "EnterpriseGamingTournament", entityId: result.tournament.id, request: req, metadata: { organizationId, reference: result.tournament.reference, idempotent: result.idempotent } }),
      writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-tournaments" } }),
    ]);
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) { return gamingTournamentErrorResponse(error, req); }
}
