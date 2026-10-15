import { getWorkflowRecoveryMessage } from "@/lib/enterprise/workflows/recovery-messages";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { WORKFLOW_LIMITS } from "@/lib/enterprise/workflows/constants";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";

export function workflowLeaseLost() {
  return new EnterpriseWorkflowError(getWorkflowRecoveryMessage("WORKFLOW_EXECUTION_LEASE_LOST", "fr")!, 409, "WORKFLOW_EXECUTION_LEASE_LOST", "BUSINESS");
}

export async function acquireWorkflowExecution(runId: string) {
  const now = new Date();
  const token = randomUUID();
  const claimed = await prisma.enterpriseWorkflowRun.updateMany({
    where: {
      id: runId,
      AND: [
        { OR: [{ status: { in: ["QUEUED", "RUNNING"] } }, { status: "WAITING_TIME", resumeAt: { lte: now } }] },
        { OR: [{ executionLeaseUntil: null }, { executionLeaseUntil: { lte: now } }] },
      ],
    },
    data: { executionToken: token, executionLeaseUntil: new Date(now.getTime() + WORKFLOW_LIMITS.workerLeaseSeconds * 1000) },
  });
  return claimed.count === 1 ? token : null;
}

// A short write lock fences cancellation, another owner, and an expired owner.
// Never hold this transaction open while awaiting an external service.
export async function requireWorkflowExecution(tx: Prisma.TransactionClient, runId: string, organizationId: string, token: string) {
  const now = new Date();
  const owned = await tx.enterpriseWorkflowRun.updateMany({
    where: { id: runId, organizationId, executionToken: token, executionLeaseUntil: { gt: now }, status: { in: ["QUEUED", "RUNNING", "WAITING_TIME"] } },
    data: { executionLeaseUntil: new Date(now.getTime() + WORKFLOW_LIMITS.workerLeaseSeconds * 1000) },
  });
  if (owned.count !== 1) throw workflowLeaseLost();
}

export async function releaseWorkflowExecution(runId: string, token: string) {
  await prisma.enterpriseWorkflowRun.updateMany({ where: { id: runId, executionToken: token }, data: { executionToken: null, executionLeaseUntil: null } });
}
