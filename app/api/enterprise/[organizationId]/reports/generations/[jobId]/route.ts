import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { FINANCE_REPORT_GENERATION_EVENT_TYPE } from "@/lib/enterprise/bulk-jobs/constants";
import { enterpriseBulkJobStatus } from "@/lib/enterprise/bulk-jobs/queue";
import { enterpriseReportVisibilityWhere, getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; jobId: string }> };

type ReportGenerationPayload = {
  actorUserId?: string;
  requestedAt?: string;
  resultReportId?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
};

function payloadObject(value: unknown): ReportGenerationPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ReportGenerationPayload : {};
}

function failureMessage(code: string | null) {
  if (!code) return null;
  if (code === "FINANCE_REPORT_GENERATION_ACCESS_REVOKED" || code === "REPORT_FINANCE_SOURCE_FORBIDDEN" || code === "REPORT_PROCUREMENT_SOURCE_FORBIDDEN") {
    return "Les autorisations nécessaires à ce rapport ne sont plus disponibles.";
  }
  if (code === "INVALID_REPORT_BUDGET" || code === "REPORT_CURRENCY_MISMATCH" || code === "FINANCE_REPORT_GENERATION_INPUT_INVALID") {
    return "Les paramètres ou la source de ce rapport ne sont plus valides.";
  }
  return "La génération du rapport n’a pas pu être terminée. Vous pouvez réessayer avec les mêmes paramètres.";
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, jobId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const job = await prisma.enterpriseDomainEvent.findFirst({
    where: { id: jobId, organizationId, eventType: FINANCE_REPORT_GENERATION_EVENT_TYPE },
    select: {
      id: true,
      payloadJson: true,
      processingStatus: true,
      attemptCount: true,
      availableAt: true,
      processedAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const payload = payloadObject(job.payloadJson);
  if (!payload.actorUserId || (payload.actorUserId !== session.userId && !access.canSeeAll)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const visibility = enterpriseReportVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll });
  const report = payload.resultReportId ? await prisma.enterpriseReport.findFirst({
    where: { AND: [visibility, { id: payload.resultReportId }] },
    select: { id: true, reference: true, title: true, reportType: true, status: true, generatedAt: true, freshnessAt: true },
  }) : null;
  const status = enterpriseBulkJobStatus(job.processingStatus);

  return NextResponse.json({
    job: {
      id: job.id,
      status,
      attempts: job.attemptCount,
      requestedAt: payload.requestedAt || job.createdAt.toISOString(),
      retryAt: job.processingStatus === "FAILED" ? job.availableAt.toISOString() : null,
      processedAt: job.processedAt?.toISOString() || payload.completedAt || null,
      updatedAt: job.updatedAt.toISOString(),
      durationMs: typeof payload.durationMs === "number" ? payload.durationMs : null,
      message: status === "FAILED" || status === "DEAD" ? failureMessage(job.lastError) : null,
      report: status === "COMPLETED" ? report : null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
