import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { c5FinanceErrorResponse } from "@/lib/enterprise/accounting/c5-error-response";
import { yearEndCloseSchema } from "@/lib/enterprise/accounting/closing-operations-schemas";
import { closeFiscalYearWithRetainedEarnings } from "@/lib/enterprise/accounting/closing-operations-service";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CLOSE", "close", { mutation: true, limit: 10 });
  if (!auth.ok) return auth.response;
  const parsed = yearEndCloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const result = await closeFiscalYearWithRetainedEarnings(organizationId, parsed.data.fiscalYearId, auth.session.userId);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_FISCAL_YEAR_CLOSED",
      entity: "EnterpriseFiscalYear",
      entityId: parsed.data.fiscalYearId,
      request: req,
      metadata: {
        organizationId,
        journalEntryId: result.posting.entry.id,
        nextFiscalYearId: result.nextYear?.id || null,
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "year-end-close" } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return c5FinanceErrorResponse(error, "YEAR_END_CLOSE_FAILED");
  }
}
