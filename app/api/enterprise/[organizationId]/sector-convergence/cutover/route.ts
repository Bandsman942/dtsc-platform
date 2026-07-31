import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeSectorConvergenceRequest } from "@/lib/enterprise/sector-convergence/access";
import { asSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import type { SectorConvergenceFlag } from "@/lib/enterprise/sector-convergence/flags";
import { cutoverSchema } from "@/lib/enterprise/sector-convergence/schemas";
import { transitionSectorCutover } from "@/lib/enterprise/sector-convergence/sync-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeSectorConvergenceRequest(req, organizationId, { mutation: true, limit: 12 });
  if (!auth.ok) return auth.response;
  const parsed = cutoverSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const state = await transitionSectorCutover({ organizationId, ...parsed.data, featureFlag: parsed.data.featureFlag as SectorConvergenceFlag, actorUserId: auth.session.userId });
    await writeAuditLog({ userId: auth.session.userId, action: `SECTOR_CUTOVER_${parsed.data.action}`, entity: "EnterpriseSectorCutoverState", entityId: state.id, request: req, metadata: { organizationId, sector: parsed.data.sector, domainCode: parsed.data.domainCode, featureFlag: parsed.data.featureFlag, reason: parsed.data.reason } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-cutover", action: parsed.data.action } });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const mapped = asSectorConvergenceError(error);
    return NextResponse.json({ error: mapped.code, details: mapped.details }, { status: mapped.status });
  }
}
