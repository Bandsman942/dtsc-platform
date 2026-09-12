import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assetDisposalPostingSchema } from "@/lib/enterprise/accounting/closing-operations-schemas";
import { finalizeAssetDisposal } from "@/lib/enterprise/accounting/closing-operations-service";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";

type Params = { params: Promise<{ organizationId: string; profileId: string; disposalId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, profileId, disposalId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ASSETS", "post", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = assetDisposalPostingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const result = await finalizeAssetDisposal(organizationId, profileId, disposalId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_ASSET_DISPOSAL_POSTED",
      entity: "EnterpriseAssetDisposal",
      entityId: disposalId,
      request: req,
      metadata: { organizationId, profileId, journalEntryId: result.entry.id, idempotent: result.idempotent },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "asset-disposal-posting" } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return financeErrorResponse(error, "ASSET_DISPOSAL_POSTING_FAILED");
  }
}
