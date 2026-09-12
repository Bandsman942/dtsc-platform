import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { createPeriodicAccountingTemplateVersion } from "@/lib/enterprise/accounting/periodic-accounting-service";
import { periodicAccountingTemplateVersionSchema } from "@/lib/enterprise/accounting/periodic-accounting-schemas";

type Params = { params: Promise<{ organizationId: string; templateId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, templateId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "create", { mutation: true, limit: 40 });
  if (!auth.ok) return auth.response;
  const parsed = periodicAccountingTemplateVersionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const template = await createPeriodicAccountingTemplateVersion(organizationId, templateId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_PERIODIC_ACCOUNTING_TEMPLATE_VERSION_CREATED", entity: "EnterprisePeriodicAccountingTemplate", entityId: template.id, request: req, metadata: { organizationId, sourceTemplateId: templateId, code: template.code, version: template.version } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "periodic-accounting", action: "version" } });
    return NextResponse.json({ ok: true, template }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "PERIODIC_ACCOUNTING_VERSION_FAILED");
  }
}
