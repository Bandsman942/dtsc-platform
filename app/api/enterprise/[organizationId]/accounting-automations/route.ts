import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { accountingAutomationCreateSchema } from "@/lib/enterprise/accounting/accounting-automation-schemas";
import { createAccountingAutomationTemplate, listAccountingAutomationTemplates } from "@/lib/enterprise/accounting/accounting-automation-service";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;
  try {
    const items = await listAccountingAutomationTemplates(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "accounting-automations", count: items.length } });
    return NextResponse.json({ items });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNTING_AUTOMATIONS_READ_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = accountingAutomationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const template = await createAccountingAutomationTemplate(organizationId, auth.session.userId, parsed.data);
    await Promise.allSettled([
      writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_ACCOUNTING_AUTOMATION_CREATED", entity: "EnterpriseAccountingAutomationTemplate", entityId: template.id, request: req, metadata: { organizationId, code: template.code, automationType: template.automationType, frequency: template.frequency } }),
      writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "accounting-automations", action: "create" } }),
    ]);
    return NextResponse.json({ ok: true, template }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNTING_AUTOMATION_CREATE_FAILED");
  }
}
