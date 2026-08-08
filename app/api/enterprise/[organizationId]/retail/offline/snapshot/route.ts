import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailOfflineSnapshotQuerySchema } from "@/lib/enterprise/retail/offline-schemas";
import { buildRetailOfflineSnapshot } from "@/lib/enterprise/retail/offline-server";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = retailOfflineSnapshotQuerySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Configuration offline invalide." }, { status: 400 });
  try {
    const snapshot = await buildRetailOfflineSnapshot({ organizationId, actorUserId: auth.session.userId, ...parsed.data });
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_OFFLINE_SNAPSHOT_CREATED", entity: "EnterpriseRetailOfflineSnapshot", entityId: snapshot.version, request: req, metadata: { organizationId, siteId: parsed.data.siteId, warehouseId: parsed.data.warehouseId, currencyCode: parsed.data.currencyCode, itemCount: snapshot.catalog.returned, truncated: snapshot.catalog.truncated, saleEnabled: snapshot.policy.saleEnabled } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-offline", action: "snapshot", version: snapshot.version, itemCount: snapshot.catalog.returned } });
    return NextResponse.json(snapshot, { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_OFFLINE_SNAPSHOT_FAILED");
  }
}
