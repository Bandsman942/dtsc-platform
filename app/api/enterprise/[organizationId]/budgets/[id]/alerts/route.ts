import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { createEnterpriseBudgetAlert, evaluateEnterpriseBudgetAlerts } from "@/lib/enterprise/finance/budget-service";
import { enterpriseBudgetAlertSchema } from "@/lib/enterprise/finance/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" });
  if (!access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const alerts = await prisma.enterpriseBudgetAlert.findMany({ where: { organizationId, budgetId: id }, orderBy: [{ status: "asc" }, { severity: "desc" }, { triggeredAt: "desc" }] });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "budget-alerts", budgetId: id } });
  return NextResponse.json({ alerts, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-budget-alert:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "write" });
  if (!access?.canManage) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const payload = await req.json().catch(() => null);
  if (payload?.action === "EVALUATE") {
    try {
      const alerts = await evaluateEnterpriseBudgetAlerts(organizationId, id, session.userId);
      await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_BUDGET_ALERTS_EVALUATED", entity: "EnterpriseBudget", entityId: id, request: req, reasonCode: "BUDGET_ALERT_EVALUATION", metadata: { alertCount: alerts.length } });
      return NextResponse.json({ ok: true, alerts });
    } catch (error) {
      const normalized = normalizeEnterpriseCoreV2Error(error);
      return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
    }
  }
  const parsed = enterpriseBudgetAlertSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Alerte invalide." }, { status: 400 });
  try {
    const alert = await createEnterpriseBudgetAlert(organizationId, id, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_BUDGET_ALERT_CONFIGURED", entity: "EnterpriseBudgetAlert", entityId: alert.id, request: req, reasonCode: "BUDGET_ALERT_CONFIGURED", metadata: { budgetId: id, ruleCode: alert.ruleCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "budget-alerts", budgetId: id } });
    return NextResponse.json({ ok: true, alert }, { status: 201 });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
