import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { regulatoryStatementRequestSchema } from "@/lib/enterprise/accounting/accounting-program-schemas";
import { generateRegulatoryStatement, getRegulatoryStatementSupport } from "@/lib/enterprise/accounting/regulatory-statements-service";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_STATEMENTS", "view");
  if (!auth.ok) return auth.response;
  try {
    const support = await getRegulatoryStatementSupport(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "regulatory-statements" } });
    return NextResponse.json({ support });
  } catch (error) {
    return financeErrorResponse(error, "REGULATORY_STATEMENT_SUPPORT_READ_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_STATEMENTS", "view", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = regulatoryStatementRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const statement = await generateRegulatoryStatement(organizationId, parsed.data);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "regulatory-statements", statementType: parsed.data.statementType } });
    return NextResponse.json({ statement });
  } catch (error) {
    return financeErrorResponse(error, "REGULATORY_STATEMENT_GENERATION_FAILED");
  }
}
