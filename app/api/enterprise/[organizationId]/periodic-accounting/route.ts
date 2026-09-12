import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createPeriodicAccountingTemplate, listPeriodicAccountingTemplates } from "@/lib/enterprise/accounting/periodic-accounting-service";
import { periodicAccountingTemplateCreateSchema } from "@/lib/enterprise/accounting/periodic-accounting-schemas";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;
  try {
    const result = await listPeriodicAccountingTemplates(organizationId, financeListParams(req));
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "periodic-accounting" } });
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error, "PERIODIC_ACCOUNTING_LIST_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "create", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = periodicAccountingTemplateCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const template = await createPeriodicAccountingTemplate(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_PERIODIC_ACCOUNTING_TEMPLATE_CREATED", entity: "EnterprisePeriodicAccountingTemplate", entityId: template.id, request: req, metadata: { organizationId, code: template.code, version: template.version, operationType: template.operationType } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "periodic-accounting" } });
    return NextResponse.json({ ok: true, template }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "PERIODIC_ACCOUNTING_CREATE_FAILED");
  }
}
