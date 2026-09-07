import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseBulkJobStatus, enqueueFinanceReportGeneration } from "@/lib/enterprise/bulk-jobs/queue";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { enterpriseReportGenerateSchema } from "@/lib/enterprise/finance/validators";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-report-generate:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseReportGenerateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Rapport invalide." }, { status: 400 });

  try {
    const job = await enqueueFinanceReportGeneration(organizationId, session.userId, parsed.data);
    const statusUrl = `/api/enterprise/${organizationId}/reports/generations/${job.id}`;
    await writeAuditLog({
      userId: session.userId,
      organizationId,
      action: "ENTERPRISE_REPORT_GENERATION_QUEUED",
      entity: "EnterpriseReportGeneration",
      entityId: job.id,
      request: req,
      reasonCode: "REPORT_DURABLE_GENERATION",
      riskLevel: "LOW",
      metadata: { organizationId, reportType: parsed.data.reportType },
    });
    await writeApiLog({
      request: req,
      statusCode: 202,
      userId: session.userId,
      startedAt,
      metadata: { organizationId, domain: "reports", reportType: parsed.data.reportType, durable: true },
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      job: {
        id: job.id,
        status: enterpriseBulkJobStatus(job.processingStatus),
        statusUrl,
      },
    }, { status: 202 });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "reports", error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
