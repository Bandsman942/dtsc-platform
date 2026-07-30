import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { generateEnterpriseReport } from "@/lib/enterprise/finance/report-service";
import { enterpriseReportGenerateSchema } from "@/lib/enterprise/finance/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const limited = await rateLimit(getRateLimitKey(req, `enterprise-report-generate:${session.userId}`), 30, 60 * 60 * 1000); if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 }); const { organizationId } = await params; const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "write" }); if (!access?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const parsed = enterpriseReportGenerateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Rapport invalide." }, { status: 400 });
  try { const report = await generateEnterpriseReport(organizationId, session.userId, parsed.data); await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_REPORT_GENERATED", entity: "EnterpriseReport", entityId: report.id, request: req, metadata: { organizationId, reportType: report.reportType, schemaVersion: report.schemaVersion } }); await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", reportType: report.reportType } }); return NextResponse.json({ ok: true, report }, { status: 201 }); }
  catch (error) { const normalized = normalizeEnterpriseCoreV2Error(error); await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", error: normalized.code } }); return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status }); }
}
