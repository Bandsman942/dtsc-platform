import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { approveAssignedFundingOperation, confirmFundingOperation, rejectAssignedFundingOperation } from "@/lib/enterprise/accounting/funding-service";
import { fundingOperationTransitionSchema } from "@/lib/enterprise/accounting/treasury-schemas";

type Params = { params: Promise<{ organizationId: string; fundingOperationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, fundingOperationId } = await params;
  const parsed = fundingOperationTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "FUNDING_OPERATION_TRANSITION_INPUT_INVALID");
  const permissionAction = parsed.data.action === "CONFIRM" ? "pay" : "approve";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", permissionAction, { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;

  try {
    const funding = parsed.data.action === "APPROVE"
      ? await approveAssignedFundingOperation(organizationId, fundingOperationId, auth.session.userId, parsed.data.revision)
      : parsed.data.action === "REJECT"
        ? await rejectAssignedFundingOperation(organizationId, fundingOperationId, auth.session.userId, parsed.data.revision, parsed.data.reason)
        : await confirmFundingOperation(organizationId, fundingOperationId, auth.session.userId, parsed.data.revision);
    await writeAuditLog({
      userId: auth.session.userId,
      action: `ENTERPRISE_FUNDING_OPERATION_${parsed.data.action}`,
      entity: "EnterpriseFundingOperation",
      entityId: fundingOperationId,
      request: req,
      metadata: { organizationId, reason: parsed.data.action === "REJECT" ? parsed.data.reason : undefined },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "funding-operations", action: parsed.data.action } });
    return NextResponse.json({ ok: true, funding });
  } catch (error) {
    return financeErrorResponse(error, "FUNDING_OPERATION_TRANSITION_FAILED");
  }
}
