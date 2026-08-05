import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string }> };
function cell(value: unknown) { const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); return `"${text.replaceAll('"', '""')}"`; }

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-audit-export:${session.userId}`), 10, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const policy = await prisma.enterpriseOrganizationSecurityPolicy.findUnique({ where: { organizationId }, select: { sensitiveExportApproval: true } });
  if (policy?.sensitiveExportApproval) {
    const approvalId = new URL(req.url).searchParams.get("approvalId");
    const approved = approvalId ? await prisma.enterpriseApproval.findFirst({ where: { id: approvalId, organizationId, status: "APPROVED", targetEntityType: "AuditExport", archivedAt: null } }) : null;
    if (!approved) return NextResponse.json({ error: "FORBIDDEN", reasonCode: "AUDIT_EXPORT_APPROVAL_REQUIRED", message: "Une approbation valide est requise pour exporter le journal d’audit." }, { status: 403 });
  }
  const where: Prisma.AuditLogWhereInput = { OR: [{ organizationId }, { metadata: { path: ["organizationId"], equals: organizationId } }] };
  const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 5000, select: { createdAt: true, userId: true, action: true, entity: true, entityId: true, result: true, reasonCode: true, riskLevel: true, requestId: true, metadata: true } });
  const headers = ["createdAt", "userId", "action", "entity", "entityId", "result", "reasonCode", "riskLevel", "requestId", "metadata"];
  const csv = [headers.map(cell).join(","), ...rows.map((row) => [row.createdAt.toISOString(), row.userId, row.action, row.entity, row.entityId, row.result, row.reasonCode, row.riskLevel, row.requestId, row.metadata].map(cell).join(","))].join("\n");
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_AUDIT_LOG_EXPORTED", entity: "Organization", entityId: organizationId, request: req, reasonCode: "AUDIT_EXPORT_CSV", riskLevel: "HIGH", metadata: { rowCount: rows.length, truncated: rows.length === 5000 } });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="enterprise-audit-${organizationId}.csv"`, "Cache-Control": "private, no-store" } });
}
