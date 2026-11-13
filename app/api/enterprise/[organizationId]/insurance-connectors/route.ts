import { NextResponse } from "next/server";
import { z } from "zod";
import { HIRMS_ENVIRONMENTS } from "@/lib/enterprise/health-insurance-connectors/environments";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { getInsuranceConnectorDashboard, saveInsuranceConnector, checkInsuranceConnector, connectorSettingsSchema } from "@/lib/enterprise/health-insurance-connectors/service";
import { InsuranceConnectorError } from "@/lib/enterprise/health-insurance-connectors/registry";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
type Params = { params: Promise<{ organizationId: string }> };
async function authorized(organizationId: string, userId: string) {
  const decision = await resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" });
  if (!decision.allowed) return false;
  const org = await prisma.organization.findFirst({ where: { id: organizationId, sectorCode: { in: ["HEALTH_CARE", "PHARMACY"] }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  return Boolean(org);
}
function failure(error: unknown) {
  const code = error instanceof InsuranceConnectorError ? error.code : error instanceof Error && error.message === "HEALTH_CONNECTOR_ENCRYPTION_NOT_CONFIGURED" ? "HEALTH_CONNECTOR_ENCRYPTION_NOT_CONFIGURED" : "HEALTH_CONNECTOR_OPERATION_FAILED";
  const status = error instanceof InsuranceConnectorError ? error.httpStatus : 503;
  return NextResponse.json({ error: code, message: code === "HEALTH_CONNECTOR_ENCRYPTION_NOT_CONFIGURED" ? "Le coffre des identifiants n'est pas configuré. Contactez DTSC." : "Opération indisponible. Vérifiez les autorisations et les identifiants HSL." }, { status });
}
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session || session.activeContext !== "ORGANIZATION") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (session.activeOrganizationId !== organizationId || !(await authorized(organizationId, session.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const environment = z.enum(HIRMS_ENVIRONMENTS).safeParse(new URL(req.url).searchParams.get("environment") || "UAT");
  if (!environment.success) return NextResponse.json({ error: "HIRMS_ENVIRONMENT_INVALID" }, { status: 400 });
  const data = await getInsuranceConnectorDashboard(organizationId, environment.data);
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "health-insurance-connectors" } });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session || session.activeContext !== "ORGANIZATION") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (session.activeOrganizationId !== organizationId || !(await authorized(organizationId, session.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `health-insurance-connectors:${session.userId}`), 15, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const body: unknown = await req.json().catch(() => null);
  if (body && typeof body === "object" && "action" in body && body.action === "check") {
    try {
      const env = z.enum(HIRMS_ENVIRONMENTS).safeParse("environment" in body ? body.environment : undefined);
      if (!env.success) return NextResponse.json({ error: "HIRMS_ENVIRONMENT_INVALID" }, { status: 400 });
      await checkInsuranceConnector(organizationId, env.data);
      await writeAuditLog({ userId: session.userId, action: "HEALTH_INSURANCE_CONNECTOR_AUTH_CHECKED", entity: "EnterpriseHealthInsuranceConnector", request: req, metadata: { organizationId, adapterCode: "HIRMS_HSL", environment: env.data } });
      return NextResponse.json({ ok: true, message: env.data === "PRODUCTION" ? "Authentification HSL de Production confirmée." : "Authentification HSL UAT confirmée." });
    } catch (error) { return failure(error); }
  }
  const parsed = connectorSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "HEALTH_CONNECTOR_SETTINGS_INVALID", message: "Renseignez un établissement valide et, si nécessaire, les deux identifiants HSL." }, { status: 400 });
  try {
    const data = await saveInsuranceConnector(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "HEALTH_INSURANCE_CONNECTOR_CONFIGURED", entity: "EnterpriseHealthInsuranceConnector", request: req, metadata: { organizationId, adapterCode: "HIRMS_HSL", environment: parsed.data.environment } });
    return NextResponse.json({ ok: true, ...data });
  } catch (error) { return failure(error); }
}
