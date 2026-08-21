import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { historicalImportDraftSchema } from "@/lib/enterprise/retail/historical-import-schemas";
import { previewHistoricalImport } from "@/lib/enterprise/retail/historical-import-service";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_DAILY_CLOSE", "manage", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = historicalImportDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: "RETAIL_HISTORY_INVALID_INPUT",
      message: parsed.error.issues[0]?.message || "Les données de reprise sont incomplètes.",
    }, { status: 400 });
  }
  try {
    const preview = await previewHistoricalImport(organizationId, parsed.data);
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: {
        organizationId,
        domain: "retail-history",
        action: "preview",
        lineCount: preview.lineCount,
        accountCount: preview.accounts.length,
      },
    });
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_HISTORY_PREVIEW_FAILED");
  }
}
