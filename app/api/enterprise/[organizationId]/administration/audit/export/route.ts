import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { AUDIT_EXPORT_EVENT_TYPE, ENTERPRISE_BULK_LIMITS } from "@/lib/enterprise/bulk-jobs/constants";
import { enqueueAuditExport, enterpriseBulkJobStatus } from "@/lib/enterprise/bulk-jobs/queue";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string }> };

function cell(value: unknown) {
  let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+@]/.test(text) || /^-[^\d.,]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-audit-export:${session.userId}`), 10, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const url = new URL(req.url);
  const policy = await prisma.enterpriseOrganizationSecurityPolicy.findUnique({ where: { organizationId }, select: { sensitiveExportApproval: true } });
  const approvalId = url.searchParams.get("approvalId")?.trim() || null;
  if (policy?.sensitiveExportApproval) {
    const approved = approvalId ? await prisma.enterpriseApproval.findFirst({ where: { id: approvalId, organizationId, status: "APPROVED", targetEntityType: "AuditExport", archivedAt: null } }) : null;
    if (!approved) return NextResponse.json({ error: "FORBIDDEN", reasonCode: "AUDIT_EXPORT_APPROVAL_REQUIRED", message: "Une approbation valide est requise pour exporter le journal d’audit." }, { status: 403 });
  }
  const where: Prisma.AuditLogWhereInput = { OR: [{ organizationId }, { metadata: { path: ["organizationId"], equals: organizationId } }] };
  const total = await prisma.auditLog.count({ where });

  if (total > ENTERPRISE_BULK_LIMITS.auditExportSyncMaxRows) {
    try {
      const job = await enqueueAuditExport({
        organizationId,
        actorUserId: session.userId,
        approvalId,
        requestId: url.searchParams.get("requestId")?.trim() || null,
      });
      await writeAuditLog({
        userId: session.userId,
        organizationId,
        action: "ENTERPRISE_AUDIT_LOG_EXPORT_QUEUED",
        entity: "EnterpriseDomainEvent",
        entityId: job.id,
        request: req,
        reasonCode: "AUDIT_EXPORT_CSV_DURABLE",
        riskLevel: "HIGH",
        metadata: { rowCount: total, syncThreshold: ENTERPRISE_BULK_LIMITS.auditExportSyncMaxRows, maxRows: ENTERPRISE_BULK_LIMITS.auditExportMaxRows },
      });
      return NextResponse.json({
        ok: true,
        queued: true,
        mode: "durable",
        job: {
          id: job.id,
          status: enterpriseBulkJobStatus(job.processingStatus),
          statusUrl: `/api/enterprise/${organizationId}/administration/audit/exports/${job.id}`,
          downloadUrl: `/api/enterprise/${organizationId}/administration/audit/exports/${job.id}/download`,
        },
      }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":", 1)[0] : "AUDIT_EXPORT_QUEUE_FAILED";
      return NextResponse.json({ error: code, message: "L’export volumineux ne peut pas être préparé pour le moment." }, { status: code === "ENTERPRISE_BULK_STORAGE_NOT_CONFIGURED" ? 503 : 500 });
    }
  }

  const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: ENTERPRISE_BULK_LIMITS.auditExportSyncMaxRows, select: { createdAt: true, userId: true, action: true, entity: true, entityId: true, result: true, reasonCode: true, riskLevel: true, requestId: true, metadata: true } });
  const headers = ["createdAt", "userId", "action", "entity", "entityId", "result", "reasonCode", "riskLevel", "requestId", "metadata"];
  const csv = [headers.map(cell).join(","), ...rows.map((row) => [row.createdAt.toISOString(), row.userId, row.action, row.entity, row.entityId, row.result, row.reasonCode, row.riskLevel, row.requestId, row.metadata].map(cell).join(","))].join("\n");
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_AUDIT_LOG_EXPORTED", entity: "Organization", entityId: organizationId, request: req, reasonCode: "AUDIT_EXPORT_CSV", riskLevel: "HIGH", metadata: { rowCount: rows.length, truncated: false, mode: "synchronous" } });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="enterprise-audit-${organizationId}.csv"`, "Cache-Control": "private, no-store", "X-DTSC-Export-Mode": "synchronous", "X-DTSC-Bulk-Event": AUDIT_EXPORT_EVENT_TYPE } });
}
