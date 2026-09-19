import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { submitCashSessionCloseForAssignedValidation } from "@/lib/enterprise/accounting/accounting-operations-approval-orchestration";
import { assignedCashCloseSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string; sessionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, sessionId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "submit", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;

  const parsed = assignedCashCloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Clôture de caisse invalide." },
      { status: 400 },
    );
  }

  try {
    const session = await submitCashSessionCloseForAssignedValidation(organizationId, sessionId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_CASH_SESSION_SUBMITTED",
      entity: "EnterpriseCashSession",
      entityId: sessionId,
      request: req,
      metadata: {
        organizationId,
        financialAccountId: session.financialAccountId,
        expectedClosingAmount: session.expectedClosingAmount?.toFixed(),
        countedClosingAmount: session.countedClosingAmount?.toFixed(),
        discrepancyAmount: session.discrepancyAmount?.toFixed(),
        moduleCode: "MOBILE_MONEY_AGENCY",
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "retail-cash-sessions", action: "close", moduleCode: "MOBILE_MONEY_AGENCY" },
    });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_CASH_SESSION_CLOSE_FAILED");
  }
}
