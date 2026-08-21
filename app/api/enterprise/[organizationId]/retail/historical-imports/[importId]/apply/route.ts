import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { historicalImportApplySchema } from "@/lib/enterprise/retail/historical-import-schemas";
import { applyHistoricalImport } from "@/lib/enterprise/retail/historical-import-service";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string; importId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, importId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "manage", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = historicalImportApplySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "RETAIL_HISTORY_INVALID_INPUT", message: "Actualisez la reprise avant de l'appliquer." }, { status: 400 });
  }
  try {
    const result = await applyHistoricalImport(organizationId, importId, auth.session.userId, parsed.data.revision);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_HISTORY_APPLIED",
      entity: "EnterpriseRetailHistoricalImport",
      entityId: result.historicalImport.id,
      request: req,
      metadata: {
        organizationId,
        reference: result.historicalImport.reference,
        status: result.historicalImport.status,
        idempotent: result.idempotent,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "retail-history", action: "apply", idempotent: result.idempotent },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_HISTORY_APPLY_FAILED");
  }
}
