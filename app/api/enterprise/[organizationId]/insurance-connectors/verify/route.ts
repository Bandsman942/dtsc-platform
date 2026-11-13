import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthInsuranceAccess } from "@/lib/health-insurance-access";
import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access";
import { prisma } from "@/lib/prisma";
import { memberVerificationSchema, verifyInsuranceMember } from "@/lib/enterprise/health-insurance-connectors/service";
import { InsuranceConnectorError } from "@/lib/enterprise/health-insurance-connectors/registry";
import { isSameOriginRequest } from "@/lib/request-security";
import { rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session || session.activeContext !== "ORGANIZATION") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (session.activeOrganizationId !== organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, sectorCode: { in: ["HEALTH_CARE", "PHARMACY"] }, status: "ACTIVE", deletedAt: null },
    select: { sectorCode: true },
  });
  if (!organization) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const allowed = organization.sectorCode === "HEALTH_CARE"
    ? Boolean((await getHealthInsuranceAccess({ session, organizationId, action: "write" }))?.canCreate)
    : await canAccessPharmacySales(session.userId, organizationId, "create");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // HSL caps VerifyMembers at 120 per minute per client. Keep tenant/client below it.
  const [organizationLimit, userLimit] = await Promise.all([
    rateLimit(`hirms-verify-org:${organizationId}`, 100, 60000, { failureMode: "closed" }),
    rateLimit(`hirms-verify-user:${session.userId}`, 30, 60000, { failureMode: "closed" }),
  ]);
  if (!organizationLimit.ok || !userLimit.ok) return NextResponse.json({ error: "HIRMS_LOCAL_RATE_LIMIT", message: "Trop de vérifications. Réessayez dans une minute." }, { status: 429 });
  const parsed = memberVerificationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "HIRMS_VERIFICATION_INPUT_INVALID", message: "Renseignez le numéro MSO, la référence exacte de la carte et, si nécessaire, la prestation." }, { status: 400 });
  try {
    const result = await verifyInsuranceMember(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "HEALTH_INSURANCE_MEMBER_VERIFIED", entity: "EnterpriseHealthInsuranceVerification", request: req,
      metadata: { organizationId, adapterCode: "HIRMS_HSL", environment: parsed.data.environment, verified: result.verified, serviceStatus: result.service, coverStatus: result.cover } });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "health-insurance-connectors", action: "verify", environment: parsed.data.environment } });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof InsuranceConnectorError ? error.code : "HIRMS_VERIFICATION_FAILED";
    const status = error instanceof InsuranceConnectorError ? error.httpStatus : 503;
    const retryAfter = error instanceof InsuranceConnectorError ? error.retryAfter : undefined;
    await writeApiLog({ request: req, startedAt, statusCode: status, userId: session.userId, metadata: { organizationId, domain: "health-insurance-connectors", action: "verify", environment: parsed.data.environment, errorCode: code } });
    return NextResponse.json({ error: code, message: code === "HIRMS_RATE_LIMITED" ? "Le service MSO a atteint sa limite temporaire." :
        code === "HIRMS_ACTION_NOT_GRANTED" ? "Ce compte HSL n'est pas autorisé à vérifier les adhérents." :
        code === "HEALTH_CONNECTOR_NOT_READY" ? "Connectez et testez d’abord le service HIRMS pour cet environnement dans Administration entreprise." :
        code === "HIRMS_PRODUCTION_NOT_ENABLED" ? "Les opérations HIRMS de Production doivent d’abord être habilitées par DTSC." :
        "Vérification indisponible. Contrôlez la connexion et réessayez." },
      { status, headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });
  }
}
