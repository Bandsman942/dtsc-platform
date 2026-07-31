import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseAssetMaintenance } from "@/lib/enterprise/projects-assets/assets";
import { assetMaintenanceCreateSchema } from "@/lib/enterprise/projects-assets/schemas";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; assetId: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-asset-maintenance:${session.userId}`), 150, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, assetId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = assetMaintenanceCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const maintenance = await createEnterpriseAssetMaintenance(organizationId, assetId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_ASSET_MAINTENANCE_CREATED", entity: "EnterpriseAssetMaintenance", entityId: maintenance.id, request: req, metadata: { organizationId, assetId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, assetId, domain: "asset-maintenance" } });
    return NextResponse.json({ ok: true, maintenance }, { status: 201 });
  } catch (error) { return enterpriseDomainErrorResponse(error, "ASSET_MAINTENANCE_CREATE_FAILED"); }
}
