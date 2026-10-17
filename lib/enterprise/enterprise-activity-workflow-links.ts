import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";

export type EnterpriseActivityRequestWorkflowStatus = {
  canonicalRequestId: string | null;
  canonicalRequestStatus: string | null;
  workflowRunId: string | null;
  workflowRunStatus: string | null;
  workflowCode: string | null;
  workflowState: "NOT_CONFIGURED" | "NOT_STARTED" | "STARTED" | null;
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

  const [requestAccess, workflowAccess, canonicalRequests] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "INTERNAL_REQUESTS" }),
    resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "WORKFLOWS" }),
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
  const canOpenWorkflow = workflowAccess.canRead;
  const canonicalIds = canonicalRequests.map((item) => item.id);
  const [definitions, runs] = await Promise.all([
    canOpenWorkflow
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
    canOpenWorkflow && canonicalIds.length
      ? prisma.enterpriseWorkflowRun.findMany({
          where: { organizationId, sourceEntityType: "EnterpriseRequest", sourceEntityId: { in: canonicalIds } },
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
    const run = canOpenWorkflow ? runsByRequest.get(request.id) : null;
    projected.set(request.sourceEntityId, {
      canonicalRequestId: request.id,
      canonicalRequestStatus: request.status,
      workflowRunId: run?.id || null,
      workflowRunStatus: run?.status || null,
      workflowCode: run?.definition.code || null,
      workflowState: !canOpenWorkflow
        ? null
        : run ? "STARTED" : definitions.length ? "NOT_STARTED" : "NOT_CONFIGURED",
      canOpenRequest,
      canOpenWorkflow,
    });
  }
  return projected;
}
