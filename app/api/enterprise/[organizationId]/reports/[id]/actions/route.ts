import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { transitionEnterpriseReport } from "@/lib/enterprise/finance/report-service";
import { enterpriseReportActionSchema } from "@/lib/enterprise/finance/validators";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const limited = await rateLimit(getRateLimitKey(req, `enterprise-report-action:${session.userId}`), 60, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 }); const { organizationId, id } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "manage" }); if (!access?.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const parsed = enterpriseReportActionSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Action de rapport invalide." }, { status: 400 });
  try { const report = await transitionEnterpriseReport(organizationId, id, session.userId, parsed.data); if (parsed.data.action === "PUBLISH") { const members = await prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { userId: true }, take: 500 }); const userIds = members.map((member) => member.userId).filter((userId) => userId !== session.userId); if (userIds.length) await notifyUsers({ userIds, organizationId, type: "ENTERPRISE_REPORT", title: "Rapport publié", body: "Un nouveau rapport d’entreprise est disponible.", targetUrl: "/enterprise-modules/REPORTS" }); } await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_REPORT_${parsed.data.action}`, entity: "EnterpriseReport", entityId: id, request: req, metadata: { organizationId } }); await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", reportId: id, action: parsed.data.action } }); return NextResponse.json({ ok: true, report }); }
  catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", reportId: id, action: parsed.data.action, error: normalized.code } }); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
