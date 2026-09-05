import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { AUDIT_EXPORT_EVENT_TYPE } from "@/lib/enterprise/bulk-jobs/constants";
import type { AuditExportJobPayload } from "@/lib/enterprise/bulk-jobs/queue";
import { downloadEnterpriseBulkArtifact } from "@/lib/enterprise/bulk-jobs/storage";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string; jobId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-audit-export-download:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId, jobId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const job = await prisma.enterpriseDomainEvent.findFirst({
    where: { id: jobId, organizationId, eventType: AUDIT_EXPORT_EVENT_TYPE, processingStatus: "PROCESSED" },
    select: { id: true, payloadJson: true },
  });
  if (!job) return NextResponse.json({ error: "AUDIT_EXPORT_NOT_READY" }, { status: 409 });
  const payload = job.payloadJson as AuditExportJobPayload | null;
  if (!payload?.artifactPath || !payload.artifactExpiresAt || payload.purgedAt) return NextResponse.json({ error: "AUDIT_EXPORT_ARTIFACT_UNAVAILABLE" }, { status: 410 });
  if (new Date(payload.artifactExpiresAt).getTime() <= Date.now()) return NextResponse.json({ error: "AUDIT_EXPORT_ARTIFACT_EXPIRED" }, { status: 410 });

  const policy = await prisma.enterpriseOrganizationSecurityPolicy.findUnique({ where: { organizationId }, select: { sensitiveExportApproval: true } });
  if (policy?.sensitiveExportApproval) {
    const approved = payload.approvalId ? await prisma.enterpriseApproval.findFirst({
      where: { id: payload.approvalId, organizationId, status: "APPROVED", targetEntityType: "AuditExport", archivedAt: null },
      select: { id: true },
    }) : null;
    if (!approved) return NextResponse.json({ error: "FORBIDDEN", reasonCode: "AUDIT_EXPORT_APPROVAL_REQUIRED" }, { status: 403 });
  }

  try {
    const blob = await downloadEnterpriseBulkArtifact({ organizationId, path: payload.artifactPath });
    const body = await blob.arrayBuffer();
    await writeAuditLog({
      userId: session.userId,
      organizationId,
      action: "ENTERPRISE_AUDIT_LOG_EXPORT_DOWNLOADED",
      entity: "EnterpriseDomainEvent",
      entityId: job.id,
      request: req,
      reasonCode: "AUDIT_EXPORT_CSV_DURABLE_DOWNLOAD",
      riskLevel: "HIGH",
      metadata: { rowCount: payload.rowCount || 0, expiresAt: payload.artifactExpiresAt },
    });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${payload.artifactFilename || `enterprise-audit-${organizationId}.csv`}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "AUDIT_EXPORT_ARTIFACT_READ_FAILED" }, { status: 500 });
  }
}
