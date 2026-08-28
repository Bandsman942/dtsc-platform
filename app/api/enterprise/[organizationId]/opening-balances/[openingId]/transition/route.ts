import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assignedDocumentTransitionSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import {
  decideOpeningBalanceAssignedApproval,
  submitOpeningBalanceForAssignedApproval,
} from "@/lib/enterprise/accounting/accounting-document-approval-orchestration";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";

type Params = { params: Promise<{ organizationId: string; openingId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, openingId } = await params;
  const parsed = assignedDocumentTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  const permissionAction = parsed.data.action === "SUBMIT" ? "submit" : "approve";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", permissionAction, { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  try {
    const opening = parsed.data.action === "SUBMIT"
      ? await submitOpeningBalanceForAssignedApproval(organizationId, openingId, auth.session.userId, parsed.data)
      : await decideOpeningBalanceAssignedApproval(organizationId, openingId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_OPENING_BALANCE_${parsed.data.action}`,
      entity: "EnterpriseOpeningBalanceImport",
      entityId: openingId,
      request: req,
      metadata: { organizationId, approverUserId: parsed.data.action === "SUBMIT" ? parsed.data.approverUserId : undefined, reason: parsed.data.reason },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "opening-balances", action: parsed.data.action } });
    return NextResponse.json({ ok: true, opening });
  } catch (error) {
    return financeErrorResponse(error, "OPENING_BALANCE_TRANSITION_FAILED");
  }
}
