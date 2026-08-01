import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeSectorConvergenceRequest } from "@/lib/enterprise/sector-convergence/access";
import { asSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { resolveSyncSchema } from "@/lib/enterprise/sector-convergence/schemas";
import { resolveSectorSync } from "@/lib/enterprise/sector-convergence/sync-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeSectorConvergenceRequest(req, organizationId, { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = resolveSyncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const state = await resolveSectorSync({ organizationId, ...parsed.data });
    await writeAuditLog({ userId: auth.session.userId, action: "SECTOR_CONVERGENCE_MANUAL_RESOLUTION_RECORDED", entity: "EnterpriseSectorSyncState", entityId: state.id, request: req, metadata: { organizationId, targetEntityType: parsed.data.targetEntityType, resolutionReason: parsed.data.resolutionReason } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-resolve" } });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const mapped = asSectorConvergenceError(error);
    return NextResponse.json({ error: mapped.code, details: mapped.details }, { status: mapped.status });
  }
}
