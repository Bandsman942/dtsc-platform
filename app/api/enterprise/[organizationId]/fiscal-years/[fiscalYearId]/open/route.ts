import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { openFiscalYear } from "@/lib/enterprise/accounting/master-service";
import { revisionSchema } from "@/lib/enterprise/accounting/schemas";

const fiscalYearOpenSchema = z.object({ revision: revisionSchema });

type Params = { params: Promise<{ organizationId: string; fiscalYearId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, fiscalYearId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = fiscalYearOpenSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "FISCAL_YEAR_OPEN_INPUT_INVALID", message: "Vérifiez la version de l’exercice puis réessayez." }, { status: 400 });
  }
  try {
    const year = await openFiscalYear(organizationId, fiscalYearId, auth.session.userId, parsed.data.revision);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_FISCAL_YEAR_OPENED",
      entity: "EnterpriseFiscalYear",
      entityId: year.id,
      request: req,
      metadata: { organizationId, fiscalYearId: year.id, code: year.code },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "fiscal-years", action: "OPEN" } });
    return NextResponse.json({ ok: true, year });
  } catch (error) {
    return financeErrorResponse(error, "FISCAL_YEAR_OPEN_FAILED");
  }
}
