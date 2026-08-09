import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailOfflineSyncSchema } from "@/lib/enterprise/retail/offline-schemas";
import { syncRetailOfflineSale } from "@/lib/enterprise/retail/offline-server";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 180 });
  if (!auth.ok) return auth.response;
  const parsed = retailOfflineSyncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Opération offline invalide." }, { status: 400 });
  try {
    const result = await syncRetailOfflineSale({ organizationId, actorUserId: auth.session.userId, ...parsed.data });
    const status = result.operation.status;
    const statusCode = status === "SYNCED" ? 200 : status === "CONFLICT" ? 409 : status === "REJECTED" ? 422 : 202;
    await writeAuditLog({ userId: auth.session.userId, action: `ENTERPRISE_RETAIL_OFFLINE_${status}`, entity: "EnterpriseRetailOfflineSyncOperation", entityId: result.operation.id, request: req, metadata: { organizationId, operationUuid: parsed.data.operationUuid, snapshotVersion: parsed.data.snapshotVersion, status, conflictCode: result.operation.conflictCode, serverEntityId: result.operation.serverEntityId, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-offline", action: "sync", operationUuid: parsed.data.operationUuid, status, conflictCode: result.operation.conflictCode } });
    return NextResponse.json(result, { status: statusCode, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_OFFLINE_SYNC_FAILED");
  }
}
