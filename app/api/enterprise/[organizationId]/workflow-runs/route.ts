import { publicWorkflowRun } from "@/lib/enterprise/workflows/public-run";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { listReadableWorkflowEntityTypes } from "@/lib/enterprise/workflows/source-access";
import { prisma } from "@/lib/prisma";
import { summarizeWorkflowTiming } from "@/lib/enterprise/workflows/observability";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params; const access = await getEnterpriseWorkflowAccess(session, organizationId); if (!access?.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const permittedEntityTypes = await listReadableWorkflowEntityTypes(session.userId, organizationId);
  const url = new URL(req.url); const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1); const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const status = url.searchParams.get("status")?.trim(); const definitionId = url.searchParams.get("workflow")?.trim(); const entityType = url.searchParams.get("entityType")?.trim(); const startedBy = url.searchParams.get("startedBy")?.trim(); const blocked = url.searchParams.get("blocked") === "true"; const failed = url.searchParams.get("failed") === "true";
  const where: Prisma.EnterpriseWorkflowRunWhereInput = { organizationId, sourceEntityType: { in: permittedEntityTypes }, ...(access.canViewAllRuns ? {} : { OR: [{ startedByUserId: session.userId }, { stepRuns: { some: { assignedUserId: session.userId } } }] }), ...(status ? { status } : {}), ...(definitionId ? { workflowDefinitionId: definitionId } : {}), ...(entityType ? { AND: [{ sourceEntityType: entityType }] } : {}), ...(startedBy ? { startedByUserId: startedBy } : {}), ...(blocked ? { status: "BLOCKED" } : {}), ...(failed ? { status: "FAILED" } : {}) };
  const sampledAt = new Date();
  const sampleLimit = 500;
  const windowDays = 30;
  const observationWhere: Prisma.EnterpriseWorkflowRunWhereInput = { AND: [where, { startedAt: { gte: new Date(sampledAt.getTime() - windowDays * 24 * 60 * 60 * 1000) } }] };
  const [runs, total, metrics, observations] = await Promise.all([
    prisma.enterpriseWorkflowRun.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { definition: { select: { id: true, code: true, name: true } }, version: { select: { versionNumber: true } }, stepRuns: { where: { status: { in: ["RUNNING", "WAITING", "FAILED"] } }, include: { step: { select: { code: true, name: true, stepType: true } } }, take: 1 } } }),
    prisma.enterpriseWorkflowRun.count({ where }),
    prisma.enterpriseWorkflowRun.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.enterpriseWorkflowRun.findMany({ where: observationWhere, orderBy: { startedAt: "desc" }, take: sampleLimit, select: { status: true, startedAt: true, completedAt: true, updatedAt: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "workflow-runs", page, pageSize } });
  const observability = summarizeWorkflowTiming(observations, sampledAt, sampleLimit, windowDays);
  return NextResponse.json({ observability, runs: runs.map((run) => publicWorkflowRun(access.canViewAllRuns || run.startedByUserId === session.userId ? run : { ...run, stepRuns: run.stepRuns.filter((stepRun) => stepRun.assignedUserId === session.userId) })), pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: Object.fromEntries(metrics.map((item) => [item.status, item._count._all])), permissions: access });
}
