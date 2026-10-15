import { getWorkflowRecoveryMessage } from "@/lib/enterprise/workflows/recovery-messages";
import { Prisma } from "@prisma/client";
import { WORKFLOW_LIMITS } from "@/lib/enterprise/workflows/constants";
import { EnterpriseWorkflowError, safeWorkflowFailureMessage } from "@/lib/enterprise/workflows/errors";
import { requireWorkflowExecution, workflowLeaseLost } from "@/lib/enterprise/workflows/execution-lease";
import { deterministicNotificationId } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type AttemptIdentity = { id: string; attemptNumber: number };

export function workflowActionIdempotencyKey(runId: string, stepId: string, actionType: string) {
  return `workflow:${runId}:${stepId}:${actionType}`;
}

export function workflowReconciliationRequired() {
  return new EnterpriseWorkflowError(getWorkflowRecoveryMessage("WORKFLOW_ACTION_RECONCILIATION_REQUIRED", "fr")!, 409, "WORKFLOW_ACTION_RECONCILIATION_REQUIRED", "BUSINESS");
}

function actionInProgress() {
  return new EnterpriseWorkflowError("Cette action est déjà en cours de traitement.", 409, "WORKFLOW_ACTION_IN_PROGRESS", "TRANSIENT");
}

export async function beginWorkflowActionAttempt({ organizationId, stepRunId, runId, stepId, actionType, executionToken, effectProtocol }: {
  organizationId: string; stepRunId: string; runId: string; stepId: string; actionType: string; executionToken?: string | null; effectProtocol?: "ATOMIC_TASK_V1";
}) {
  if (!executionToken) throw workflowLeaseLost();
  const idempotencyKey = workflowActionIdempotencyKey(runId, stepId, actionType);
  return prisma.$transaction(async (tx) => {
    await requireWorkflowExecution(tx, runId, organizationId, executionToken);
    const existing = await tx.enterpriseWorkflowActionAttempt.findUnique({ where: { idempotencyKey } });
    if (existing && (existing.organizationId !== organizationId || existing.stepRunId !== stepRunId)) throw workflowLeaseLost();
    if (existing?.status === "SUCCEEDED") return { attempt: existing, alreadySucceeded: true };
    if (existing?.status === "UNCERTAIN") throw workflowReconciliationRequired();
    if (existing?.status === "RUNNING") throw actionInProgress();
    if (existing && existing.attemptNumber >= WORKFLOW_LIMITS.maxAttempts) {
      throw new EnterpriseWorkflowError("Le nombre maximal de tentatives est atteint.", 409, "WORKFLOW_MAX_ATTEMPTS_REACHED", "TERMINAL");
    }
    if (existing) {
      const claimed = await tx.enterpriseWorkflowActionAttempt.updateMany({
        where: { id: existing.id, organizationId, status: { in: ["FAILED", "PENDING"] }, attemptNumber: existing.attemptNumber },
        data: { status: "RUNNING", effectProtocol: effectProtocol || null, attemptNumber: { increment: 1 }, startedAt: new Date(), completedAt: null, errorCategory: null, errorCode: null, errorMessage: null },
      });
      if (claimed.count !== 1) throw actionInProgress();
      const attempt = await tx.enterpriseWorkflowActionAttempt.findUniqueOrThrow({ where: { id: existing.id } });
      return { attempt, alreadySucceeded: false };
    }
    const attempt = await tx.enterpriseWorkflowActionAttempt.create({ data: { organizationId, stepRunId, actionType, effectProtocol: effectProtocol || null, idempotencyKey, status: "RUNNING", attemptNumber: 1 } });
    return { attempt, alreadySucceeded: false };
  });
}

export async function completeWorkflowActionAttempt(attempt: AttemptIdentity, result?: { entityType?: string | null; entityId?: string | null }, tx: Prisma.TransactionClient = prisma) {
  const completed = await tx.enterpriseWorkflowActionAttempt.updateMany({
    where: { id: attempt.id, attemptNumber: attempt.attemptNumber, status: { in: ["RUNNING", "UNCERTAIN"] } },
    data: { status: "SUCCEEDED", completedAt: new Date(), resultEntityType: result?.entityType || null, resultEntityId: result?.entityId || null, errorCategory: null, errorCode: null, errorMessage: null },
  });
  if (completed.count !== 1) throw workflowLeaseLost();
}

export async function failWorkflowActionAttempt(attempt: AttemptIdentity, error: unknown, safeToRetry = false) {
  const failure = safeWorkflowFailureMessage(error);
  await prisma.enterpriseWorkflowActionAttempt.updateMany({
    where: { id: attempt.id, attemptNumber: attempt.attemptNumber, status: "RUNNING" },
    data: { status: safeToRetry ? "FAILED" : "UNCERTAIN", completedAt: new Date(), errorCategory: failure.category, errorCode: failure.code, errorMessage: failure.message },
  });
  if (!safeToRetry) throw workflowReconciliationRequired();
  return failure;
}

// Call while holding the run write lock. Only structural, tenant-scoped receipts
// prove completion. A matching business status or name is never such a receipt.
export async function reconcileWorkflowActionAttempts(tx: Prisma.TransactionClient, organizationId: string, stepRunId: string) {
  const attempts = await tx.enterpriseWorkflowActionAttempt.findMany({ where: { organizationId, stepRunId, status: { in: ["RUNNING", "UNCERTAIN"] } } });
  let unresolved = false;
  for (const attempt of attempts) {
    let receipt: { entityType: string; entityId: string } | null = null;
    if (attempt.actionType === "CREATE_APPROVAL") {
      const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, workflowStepRunId: stepRunId }, select: { id: true } });
      if (approval) receipt = { entityType: "EnterpriseApproval", entityId: approval.id };
    } else if (attempt.actionType === "NOTIFICATION") {
      const notification = await tx.notification.findFirst({ where: { id: deterministicNotificationId(attempt.idempotencyKey), organizationId }, select: { id: true } });
      if (notification) receipt = { entityType: "Notification", entityId: notification.id };
    }
    if (receipt) {
      await completeWorkflowActionAttempt(attempt, receipt, tx);
    } else if (attempt.effectProtocol === "ATOMIC_TASK_V1" || attempt.actionType === "NOTIFICATION") {
      // The task and receipt commit together; notification has a unique durable ID.
      // Older task attempts have no protocol and must NOT be replayed automatically.
      await tx.enterpriseWorkflowActionAttempt.updateMany({ where: { id: attempt.id, attemptNumber: attempt.attemptNumber, status: attempt.status }, data: { status: "FAILED", errorCode: "WORKFLOW_SAFE_RECOVERY", completedAt: new Date() } });
    } else {
      unresolved = true;
      await tx.enterpriseWorkflowActionAttempt.updateMany({ where: { id: attempt.id, attemptNumber: attempt.attemptNumber, status: attempt.status }, data: { status: "UNCERTAIN", errorCategory: "BUSINESS", errorCode: "WORKFLOW_ACTION_RECONCILIATION_REQUIRED", errorMessage: workflowReconciliationRequired().message } });
    }
  }
  return !unresolved;
}
