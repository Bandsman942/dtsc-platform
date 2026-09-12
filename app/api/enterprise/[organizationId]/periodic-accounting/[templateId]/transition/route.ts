import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { transitionPeriodicAccountingTemplate } from "@/lib/enterprise/accounting/periodic-accounting-service";
import { periodicAccountingTransitionSchema } from "@/lib/enterprise/accounting/periodic-accounting-schemas";

type Params = { params: Promise<{ organizationId: string; templateId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, templateId } = await params;
  const parsed = periodicAccountingTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  const action = parsed.data.action === "APPROVE" ? "approve" : parsed.data.action === "SUBMIT" ? "submit" : "manage";
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", action, { mutation: true, limit: 80 });
  if (!auth.ok) return auth.response;
  try {
    const template = await transitionPeriodicAccountingTemplate(organizationId, templateId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: `ENTERPRISE_PERIODIC_ACCOUNTING_TEMPLATE_${parsed.data.action}`, entity: "EnterprisePeriodicAccountingTemplate", entityId: templateId, request: req, metadata: { organizationId, code: template.code, version: template.version } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "periodic-accounting", action: parsed.data.action } });
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return financeErrorResponse(error, "PERIODIC_ACCOUNTING_TRANSITION_FAILED");
  }
}
