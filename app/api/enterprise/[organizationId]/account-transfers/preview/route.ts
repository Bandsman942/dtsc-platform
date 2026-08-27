import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { previewTreasuryTransfer } from "@/lib/enterprise/accounting/treasury-transfer-service";
import { accountTransferPreviewSchema } from "@/lib/enterprise/accounting/treasury-schemas";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "create", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const parsed = accountTransferPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const preview = await previewTreasuryTransfer(organizationId, parsed.data);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "account-transfers", action: "preview" } });
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNT_TRANSFER_PREVIEW_FAILED");
  }
}
