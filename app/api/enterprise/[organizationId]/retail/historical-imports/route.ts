import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { historicalImportDraftSchema } from "@/lib/enterprise/retail/historical-import-schemas";
import { createHistoricalImportDraft, getHistoricalImportWorkspace } from "@/lib/enterprise/retail/historical-import-service";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "read");
  if (!auth.ok) return auth.response;
  try {
    const workspace = await getHistoricalImportWorkspace(organizationId, auth.session.userId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-history", action: "list" } });
    return NextResponse.json(workspace);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_HISTORY_LIST_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = historicalImportDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: "RETAIL_HISTORY_INVALID_INPUT",
      message: parsed.error.issues[0]?.message || "Les données de reprise sont incomplètes.",
    }, { status: 400 });
  }
  try {
    const result = await createHistoricalImportDraft(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_HISTORY_DRAFTED",
      entity: "EnterpriseRetailHistoricalImport",
      entityId: result.historicalImport.id,
      request: req,
      metadata: {
        organizationId,
        reference: result.historicalImport.reference,
        sourceLabel: result.historicalImport.sourceLabel,
        lineCount: parsed.data.lines.length,
        baselineCount: parsed.data.baselines.length,
        idempotent: result.idempotent,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: result.idempotent ? 200 : 201,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "retail-history", action: "draft", idempotent: result.idempotent },
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_HISTORY_DRAFT_FAILED");
  }
}
