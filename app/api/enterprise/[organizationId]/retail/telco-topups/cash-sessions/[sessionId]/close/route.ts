import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { submitCashSessionClose } from "@/lib/enterprise/accounting/treasury-service";
import { cashCloseSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

type Params = { params: Promise<{ organizationId: string; sessionId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, sessionId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "submit", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = cashCloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Clôture de caisse invalide." }, { status: 400 });
  try {
    const session = await submitCashSessionClose(organizationId, sessionId, auth.session.userId, parsed.data);
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
        moduleCode: "TELCO_TOPUPS",
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-cash-sessions", action: "close", moduleCode: "TELCO_TOPUPS" } });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_CASH_SESSION_CLOSE_FAILED");
  }
}
