import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { resolveEnterpriseAssetIncident } from "@/lib/enterprise/projects-assets/assets";
import { assetIncidentResolveSchema } from "@/lib/enterprise/projects-assets/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; incidentId: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-asset-incident-resolve:${session.userId}`), 150, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, incidentId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = assetIncidentResolveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const incident = await resolveEnterpriseAssetIncident(organizationId, incidentId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_ASSET_INCIDENT_RESOLVED", entity: "EnterpriseAssetIncident", entityId: incident.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "asset-incidents", action: "resolve" } });
    return NextResponse.json({ ok: true, incident });
  } catch (error) { return enterpriseDomainErrorResponse(error, "ASSET_INCIDENT_RESOLVE_FAILED"); }
}
