import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") || 30) || 30));
  const action = url.searchParams.get("action")?.trim();
  const actor = url.searchParams.get("actor")?.trim();
  const entity = url.searchParams.get("entity")?.trim();
  const result = url.searchParams.get("result")?.trim();
  const risk = url.searchParams.get("risk")?.trim();
  const reasonCode = url.searchParams.get("reasonCode")?.trim();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const tenantScope: Prisma.AuditLogWhereInput = { OR: [{ organizationId }, { metadata: { path: ["organizationId"], equals: organizationId } }] };
  const where: Prisma.AuditLogWhereInput = {
    AND: [tenantScope, ...(action ? [{ action: { contains: action, mode: "insensitive" as const } }] : []), ...(actor ? [{ userId: actor }] : []), ...(entity ? [{ entity }] : []), ...(result ? [{ result }] : []), ...(risk ? [{ riskLevel: risk }] : []), ...(reasonCode ? [{ reasonCode }] : []), ...(from || to ? [{ createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }] : [])],
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, userId: true, action: true, entity: true, entityId: true, result: true, reasonCode: true, riskLevel: true, requestId: true, beforeJson: true, afterJson: true, metadata: true, createdAt: true, ipAddress: true } }),
    prisma.auditLog.count({ where }),
  ]);
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_AUDIT_LOGS_VIEWED", entity: "Organization", entityId: organizationId, request: req, reasonCode: "AUDIT_LOG_VIEW", riskLevel: "MEDIUM", metadata: { page, pageSize, filters: { action, actor, entity, result, risk, reasonCode, from, to } } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "enterprise-audit" } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}
