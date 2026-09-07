import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { approveAndPostEnterpriseAssetDisposal } from "@/lib/enterprise/accounting/asset-accounting-service";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { assetDisposalApproveSchema } from "@/lib/enterprise/accounting/treasury-schemas";

type Params = { params: Promise<{ organizationId: string; disposalId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, disposalId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ASSETS", "approve", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = assetDisposalApproveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const disposal = await approveAndPostEnterpriseAssetDisposal(organizationId, disposalId, auth.session.userId, parsed.data.revision);
    await Promise.allSettled([
      writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_ASSET_DISPOSAL_POSTED", entity: "EnterpriseAssetDisposal", entityId: disposal.id, request: req, metadata: { organizationId, journalEntryId: disposal.journalEntryId, gainLoss: disposal.gainLoss.toFixed(), currency: disposal.currencyCode } }),
      writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "asset-disposals", action: "approve-post" } }),
    ]);
    return NextResponse.json({ ok: true, disposal });
  } catch (error) {
    return financeErrorResponse(error, "ASSET_DISPOSAL_APPROVE_FAILED");
  }
}
