import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getEnterpriseGamingTournamentAccess } from "@/lib/enterprise/gaming/access";
import { gamingTournamentErrorResponse } from "@/lib/enterprise/gaming/tournament-http";
import { gamingTournamentRegistrationSchema } from "@/lib/enterprise/gaming/tournament-schemas";
import { registerGamingTournamentParticipant } from "@/lib/enterprise/gaming/tournaments";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; tournamentId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-tournament-register:${session.userId}`), 240, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = gamingTournamentRegistrationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { organizationId, tournamentId } = await params;
  const tournament = await prisma.enterpriseGamingTournament.findFirst({ where: { id: tournamentId, organizationId, archivedAt: null }, select: { entryCatalogItemId: true } });
  if (!tournament) return NextResponse.json({ error: "GAMING_TOURNAMENT_NOT_FOUND" }, { status: 404 });
  const [access, crmAccess, catalogAccess, receivableCreate, receivableSubmit] = await Promise.all([
    getEnterpriseGamingTournamentAccess({ session, organizationId, action: "submit" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_CUSTOMERS", action: "read" }),
    tournament.entryCatalogItemId ? getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" }) : Promise.resolve(true),
    tournament.entryCatalogItemId ? getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "create" }) : Promise.resolve(true),
    tournament.entryCatalogItemId ? getEnterpriseAccountingAccess({ session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "submit" }) : Promise.resolve(true),
  ]);
  if (!access || !crmAccess || !catalogAccess || !receivableCreate || !receivableSubmit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await registerGamingTournamentParticipant(organizationId, tournamentId, session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: result.idempotent ? "ENTERPRISE_GAMING_TOURNAMENT_REGISTRATION_REPLAYED" : "ENTERPRISE_GAMING_TOURNAMENT_REGISTERED", entity: "EnterpriseGamingTournamentRegistration", entityId: result.registration.id, request: req, metadata: { organizationId, tournamentId, businessPartyId: result.registration.businessPartyId, salesInvoiceId: result.registration.salesInvoiceId, idempotent: result.idempotent } }),
      writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-tournament-registration", tournamentId } }),
    ]);
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) { return gamingTournamentErrorResponse(error, req); }
}
