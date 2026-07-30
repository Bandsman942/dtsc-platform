import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url); const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1); const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const status = url.searchParams.get("status")?.trim(); const definitionId = url.searchParams.get("workflow")?.trim(); const entityType = url.searchParams.get("entityType")?.trim(); const startedBy = url.searchParams.get("startedBy")?.trim(); const blocked = url.searchParams.get("blocked") === "true"; const failed = url.searchParams.get("failed") === "true";
  const where: Prisma.EnterpriseWorkflowRunWhereInput = { organizationId, ...(access.canViewAllRuns ? {} : { OR: [{ startedByUserId: session.userId }, { stepRuns: { some: { assignedUserId: session.userId } } }] }), ...(status ? { status } : {}), ...(definitionId ? { workflowDefinitionId: definitionId } : {}), ...(entityType ? { sourceEntityType: entityType } : {}), ...(startedBy ? { startedByUserId: startedBy } : {}), ...(blocked ? { status: "BLOCKED" } : {}), ...(failed ? { status: "FAILED" } : {}) };
  const [runs, total, metrics] = await Promise.all([
    prisma.enterpriseWorkflowRun.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { definition: { select: { id: true, code: true, name: true } }, version: { select: { versionNumber: true } }, stepRuns: { where: { status: { in: ["RUNNING", "WAITING", "FAILED"] } }, include: { step: { select: { code: true, name: true, stepType: true } } }, take: 1 } } }),
    prisma.enterpriseWorkflowRun.count({ where }),
    prisma.enterpriseWorkflowRun.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-runs", page, pageSize } });
  return NextResponse.json({ runs, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: Object.fromEntries(metrics.map((item) => [item.status, item._count._all])), permissions: access });
}
