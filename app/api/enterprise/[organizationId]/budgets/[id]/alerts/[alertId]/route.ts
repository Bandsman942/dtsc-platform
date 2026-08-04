import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { transitionEnterpriseBudgetAlert } from "@/lib/enterprise/finance/budget-service";
import { enterpriseBudgetAlertActionSchema } from "@/lib/enterprise/finance/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string; alertId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-budget-alert-action:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId, id, alertId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "write" });
  if (!access?.canManage) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = enterpriseBudgetAlertActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Action invalide." }, { status: 400 });
  try {
    const alert = await transitionEnterpriseBudgetAlert(organizationId, id, alertId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_BUDGET_ALERT_STATUS_CHANGED", entity: "EnterpriseBudgetAlert", entityId: alertId, request: req, reasonCode: "BUDGET_ALERT_STATUS_CHANGED", metadata: { budgetId: id, status: alert.status } });
    return NextResponse.json({ ok: true, alert });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
