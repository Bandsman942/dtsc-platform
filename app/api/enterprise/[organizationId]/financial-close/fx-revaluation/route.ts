import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { c5FinanceErrorResponse } from "@/lib/enterprise/accounting/c5-error-response";
import { closingFxRevaluationSchema } from "@/lib/enterprise/accounting/closing-operations-schemas";
import { runClosingFxRevaluation } from "@/lib/enterprise/accounting/closing-operations-service";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CLOSE", "close", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = closingFxRevaluationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const result = await runClosingFxRevaluation(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CLOSING_FX_REVALUATION_POSTED",
      entity: "EnterpriseFxRevaluation",
      entityId: `${parsed.data.fiscalPeriodId}:${parsed.data.currencyCode}`,
      request: req,
      metadata: {
        organizationId,
        fiscalPeriodId: parsed.data.fiscalPeriodId,
        currencyCode: parsed.data.currencyCode,
        journalEntryId: result.posting.entry.id,
        reversalEntryId: result.reversal.id,
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "closing-fx-revaluation" } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return c5FinanceErrorResponse(error, "FX_REVALUATION_FAILED");
  }
}
