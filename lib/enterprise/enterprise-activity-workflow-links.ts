import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { getSession } from "@/lib/auth";
import { getEnterpriseWorkflowAccess } from "@/lib/enterprise/workflows/access";
import { listReadableWorkflowEntityTypes } from "@/lib/enterprise/workflows/source-access";

export type EnterpriseActivityRequestWorkflowStatus = {
  canonicalRequestId: string | null;
  canonicalRequestStatus: string | null;
  workflowRunId: string | null;
  workflowRunStatus: string | null;
  workflowCode: string | null;
  workflowState: "NOT_CONFIGURED" | "NOT_STARTED" | "LIMITED_ACCESS" | "STARTED" | null;
  canOpenRequest: boolean;
  canOpenWorkflow: boolean;
};

/**
 * Project existing ERP state into the Activities view: it is NOT a second
 * request or workflow state machine. No writes, side effects or worker calls.
 *
 * A request's canonical status belongs to EnterpriseRequest. A workflow run
 * exists only if a published, active definition actually consumed its outbox
 * event; we must never synthesize a run from the existence of a request.
 */
export async function projectEnterpriseActivityRequestWorkflows({
  organizationId,
  userId,
  activityIds,
}: {
  organizationId: string;
  userId: string;
  activityIds: string[];
}): Promise<Map<string, EnterpriseActivityRequestWorkflowStatus>> {
  const projected = new Map<string, EnterpriseActivityRequestWorkflowStatus>();
  if (!activityIds.length) return projected;

  const session = await getSession();
  const [requestAccess, workflowAccess, canonicalRequests] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "INTERNAL_REQUESTS" }),
    session?.userId === userId ? getEnterpriseWorkflowAccess(session, organizationId) : Promise.resolve(null),
    prisma.enterpriseRequest.findMany({
      where: {
        organizationId,
        sourceModule: "ENTERPRISE_ACTIVITIES",
        sourceEntityType: "EnterpriseActivityRequest",
        sourceEntityId: { in: activityIds },
        archivedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, sourceEntityId: true, status: true, requestedByUserId: true, assignedToUserId: true },
    }),
  ]);
  const canOpenRequest = requestAccess.canRead;
  const canOpenWorkflow = Boolean(workflowAccess?.canRead);
  const readableTypes = canOpenWorkflow ? await listReadableWorkflowEntityTypes(userId, organizationId) : [];
  const sourceReadable = readableTypes.includes("EnterpriseRequest");
  const viewAllRuns = workflowAccess?.canViewAllRuns === true;
  const canonicalIds = canonicalRequests.map((item) => item.id);
  const [definitions, runs] = await Promise.all([
    sourceReadable
      ? prisma.enterpriseWorkflowDefinition.findMany({
          where: {
            organizationId,
            archivedAt: null,
            status: "ACTIVE",
            currentVersionId: { not: null },
            triggerEntityType: "EnterpriseRequest",
            triggerEventType: "ENTERPRISE_REQUEST_SUBMITTED",
          },
          select: { id: true, code: true },
          take: 100,
        })
      : Promise.resolve([]),
    sourceReadable && canonicalIds.length
      ? prisma.enterpriseWorkflowRun.findMany({
          where: { organizationId, sourceEntityType: "EnterpriseRequest", sourceEntityId: { in: canonicalIds },
            ...(viewAllRuns ? {} : { OR: [{ startedByUserId: userId }, { stepRuns: { some: { assignedUserId: userId } } }] }) },
          orderBy: { startedAt: "desc" },
          select: { id: true, sourceEntityId: true, workflowDefinitionId: true, status: true, definition: { select: { code: true } } },
          take: 400,
        })
      : Promise.resolve([]),
  ]);
  const runsByRequest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) if (!runsByRequest.has(run.sourceEntityId)) runsByRequest.set(run.sourceEntityId, run);
  for (const request of canonicalRequests) {
    if (!request.sourceEntityId || projected.has(request.sourceEntityId)) continue;
    const run = sourceReadable ? runsByRequest.get(request.id) : null;
    projected.set(request.sourceEntityId, {
      canonicalRequestId: request.id,
      canonicalRequestStatus: request.status,
      workflowRunId: run?.id || null,
      workflowRunStatus: run?.status || null,
      workflowCode: run?.definition.code || null,
      workflowState: !sourceReadable
        ? null
        : run ? "STARTED" : definitions.length ? (viewAllRuns ? "NOT_STARTED" : "LIMITED_ACCESS") : "NOT_CONFIGURED",
      canOpenRequest,
      canOpenWorkflow: Boolean(canOpenWorkflow && run),
    });
  }
  return projected;
}
