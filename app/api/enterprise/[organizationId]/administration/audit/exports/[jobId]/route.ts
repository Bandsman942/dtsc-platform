import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { AUDIT_EXPORT_EVENT_TYPE } from "@/lib/enterprise/bulk-jobs/constants";
import { enterpriseBulkJobStatus, type AuditExportJobPayload } from "@/lib/enterprise/bulk-jobs/queue";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; jobId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, jobId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const job = await prisma.enterpriseDomainEvent.findFirst({
    where: { id: jobId, organizationId, eventType: AUDIT_EXPORT_EVENT_TYPE },
    select: { id: true, processingStatus: true, attemptCount: true, lastError: true, payloadJson: true, createdAt: true, updatedAt: true, processedAt: true },
  });
  if (!job) return NextResponse.json({ error: "AUDIT_EXPORT_JOB_NOT_FOUND" }, { status: 404 });
  const payload = job.payloadJson as AuditExportJobPayload | null;
  const expiresAt = payload?.artifactExpiresAt || null;
  const artifactAvailable = Boolean(payload?.artifactPath && expiresAt && new Date(expiresAt).getTime() > Date.now() && !payload?.purgedAt);
  return NextResponse.json({
    job: {
      id: job.id,
      status: enterpriseBulkJobStatus(job.processingStatus),
      attemptCount: job.attemptCount,
      errorCode: job.lastError,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      processedAt: job.processedAt,
      rowCount: payload?.rowCount || 0,
      truncated: Boolean(payload?.truncated),
      expiresAt,
      artifactAvailable,
      downloadUrl: artifactAvailable ? `/api/enterprise/${organizationId}/administration/audit/exports/${job.id}/download` : null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
