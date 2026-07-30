import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { transitionEnterpriseExpense } from "@/lib/enterprise/finance/expense-service";
import { enterpriseExpenseActionSchema } from "@/lib/enterprise/finance/validators";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const limited = await rateLimit(getRateLimitKey(req, `enterprise-expense-action:${session.userId}`), 120, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 }); const { organizationId, id } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "submit" }); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const current = await prisma.enterpriseExpense.findFirst({ where: { id, organizationId, archivedAt: null } }); if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 }); if (!access.canManage && current.createdByUserId !== session.userId && current.requestedByUserId !== session.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const parsed = enterpriseExpenseActionSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Action de dépense invalide." }, { status: 400 });
  try { const result = await transitionEnterpriseExpense(organizationId, id, session.userId, parsed.data); if (parsed.data.action === "SUBMIT" && parsed.data.approverUserId) await notifyUser({ userId: parsed.data.approverUserId, organizationId, type: "ENTERPRISE_APPROVAL", title: "Dépense à valider", body: "Une dépense nécessite votre décision.", targetUrl: "/enterprise-modules/VALIDATIONS" }); await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_EXPENSE_${parsed.data.action}`, entity: "EnterpriseExpense", entityId: id, request: req, metadata: { organizationId, fromStatus: current.status } }); await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "expenses", expenseId: id, action: parsed.data.action } }); return NextResponse.json({ ok: true, result }); }
  catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "expenses", expenseId: id, action: parsed.data.action, error: normalized.code } }); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
