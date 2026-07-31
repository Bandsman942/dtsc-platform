import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { disposeEnterpriseAsset } from "@/lib/enterprise/accounting/asset-accounting-service";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { assetDisposalSchema } from "@/lib/enterprise/accounting/treasury-schemas";

type Params = { params: Promise<{ organizationId: string; profileId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, profileId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ASSETS", "update", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;

  const parsed = assetDisposalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const disposal = await disposeEnterpriseAsset(organizationId, profileId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_ASSET_DISPOSAL_PREPARED",
      entity: "EnterpriseAssetDisposal",
      entityId: disposal.id,
      request: req,
      metadata: {
        organizationId,
        profileId,
        netBookValue: disposal.netBookValue.toFixed(),
        proceeds: disposal.proceeds.toFixed(),
        gainLoss: disposal.gainLoss.toFixed(),
        currency: disposal.currencyCode,
      },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "asset-disposals" } });
    return NextResponse.json({ ok: true, disposal }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "ASSET_DISPOSAL_FAILED");
  }
}
