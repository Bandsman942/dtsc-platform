import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { approveAssignedAccountTransfer, rejectAssignedAccountTransfer } from "@/lib/enterprise/accounting/treasury-approval-service";
import { confirmTreasuryTransfer } from "@/lib/enterprise/accounting/treasury-transfer-service";
import { transferTransitionSchema } from "@/lib/enterprise/accounting/treasury-schemas";

type Params = { params: Promise<{ organizationId: string; transferId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, transferId } = await params;
  const parsed = transferTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  const permissionAction = parsed.data.action === "CONFIRM" ? "pay" : "approve";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", permissionAction, { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  try {
    const transfer = parsed.data.action === "APPROVE"
      ? await approveAssignedAccountTransfer(organizationId, transferId, auth.session.userId, parsed.data.revision)
      : parsed.data.action === "REJECT"
        ? await rejectAssignedAccountTransfer(organizationId, transferId, auth.session.userId, parsed.data.revision, parsed.data.reason)
        : await confirmTreasuryTransfer(organizationId, transferId, auth.session.userId, parsed.data.revision);
    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_ACCOUNT_TRANSFER_${parsed.data.action}`,
      entity: "EnterpriseAccountTransfer",
      entityId: transferId,
      request: req,
      metadata: { organizationId, reason: parsed.data.action === "REJECT" ? parsed.data.reason : undefined },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "account-transfers", action: parsed.data.action } });
    return NextResponse.json({ ok: true, transfer });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNT_TRANSFER_TRANSITION_FAILED");
  }
}
