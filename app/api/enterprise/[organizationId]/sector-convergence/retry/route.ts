import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeSectorConvergenceRequest } from "@/lib/enterprise/sector-convergence/access";
import { asSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { retrySyncSchema } from "@/lib/enterprise/sector-convergence/schemas";
import { retrySectorSync } from "@/lib/enterprise/sector-convergence/sync-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeSectorConvergenceRequest(req, organizationId, { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = retrySyncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const state = await retrySectorSync(organizationId, parsed.data.syncStateId, parsed.data.expectedStatus);
    await writeAuditLog({ userId: auth.session.userId, action: "SECTOR_CONVERGENCE_RETRY_QUEUED", entity: "EnterpriseSectorSyncState", entityId: state.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-retry" } });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const mapped = asSectorConvergenceError(error);
    return NextResponse.json({ error: mapped.code, details: mapped.details }, { status: mapped.status });
  }
}
