import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { classifyAndPostExpense } from "@/lib/enterprise/accounting/payroll-expense-accounting-service";
import { expensePostingSchema } from "@/lib/enterprise/accounting/treasury-schemas";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, id } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_PAYABLES", "post", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;

  const parsed = expensePostingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const result = await classifyAndPostExpense(organizationId, id, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_EXPENSE_POSTED",
      entity: "EnterpriseExpense",
      entityId: id,
      request: req,
      metadata: { organizationId, accountingTreatment: parsed.data.accountingTreatment, journalEntryId: result.posting.entry.id },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "expenses", action: "post" } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return financeErrorResponse(error, "EXPENSE_POST_FAILED");
  }
}
