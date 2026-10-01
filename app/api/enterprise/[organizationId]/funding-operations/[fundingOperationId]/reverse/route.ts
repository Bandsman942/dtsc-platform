import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { reverseFundingOperation } from "@/lib/enterprise/accounting/funding-service";
import { fundingOperationReverseSchema } from "@/lib/enterprise/accounting/treasury-schemas";

type Params = { params: Promise<{ organizationId: string; fundingOperationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, fundingOperationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "reverse", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = fundingOperationReverseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "FUNDING_OPERATION_REVERSAL_INPUT_INVALID");
  try {
    const funding = await reverseFundingOperation(organizationId, fundingOperationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_FUNDING_OPERATION_REVERSED",
      entity: "EnterpriseFundingOperation",
      entityId: fundingOperationId,
      request: req,
      metadata: { organizationId, reason: parsed.data.reason, cashSessionId: parsed.data.cashSessionId || null },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "funding-operations", action: "REVERSE" } });
    return NextResponse.json({ ok: true, funding });
  } catch (error) {
    return financeErrorResponse(error, "FUNDING_OPERATION_REVERSAL_FAILED");
  }
}
