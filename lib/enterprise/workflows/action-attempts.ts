import { Prisma } from "@prisma/client";
import { WORKFLOW_LIMITS } from "@/lib/enterprise/workflows/constants";
import { EnterpriseWorkflowError, safeWorkflowFailureMessage } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";

export function workflowActionIdempotencyKey(runId: string, stepId: string, actionType: string) {
  return `workflow:${runId}:${stepId}:${actionType}`;
}

function actionInProgress() {
  return new EnterpriseWorkflowError("Cette action est déjà en cours de traitement.", 409, "WORKFLOW_ACTION_IN_PROGRESS", "TRANSIENT");
}

export async function beginWorkflowActionAttempt({ organizationId, stepRunId, runId, stepId, actionType }: { organizationId: string; stepRunId: string; runId: string; stepId: string; actionType: string }) {
  const idempotencyKey = workflowActionIdempotencyKey(runId, stepId, actionType);
  const existing = await prisma.enterpriseWorkflowActionAttempt.findUnique({ where: { idempotencyKey } });
  if (existing?.status === "SUCCEEDED") return { attempt: existing, alreadySucceeded: true };
  if (existing?.status === "RUNNING") throw actionInProgress();
  if (existing && existing.attemptNumber >= WORKFLOW_LIMITS.maxAttempts && existing.status === "FAILED") {
    throw new EnterpriseWorkflowError("Le nombre maximal de tentatives est atteint.", 409, "WORKFLOW_MAX_ATTEMPTS_REACHED", "TERMINAL");
  }
  if (existing) {
    const claimed = await prisma.enterpriseWorkflowActionAttempt.updateMany({
      where: { id: existing.id, status: { in: ["FAILED", "PENDING"] }, attemptNumber: existing.attemptNumber },
      data: { status: "RUNNING", attemptNumber: { increment: 1 }, startedAt: new Date(), completedAt: null, errorCategory: null, errorCode: null, errorMessage: null },
    });
    if (claimed.count !== 1) {
      const current = await prisma.enterpriseWorkflowActionAttempt.findUnique({ where: { idempotencyKey } });
      if (current?.status === "SUCCEEDED") return { attempt: current, alreadySucceeded: true };
      throw actionInProgress();
    }
    const attempt = await prisma.enterpriseWorkflowActionAttempt.findUnique({ where: { id: existing.id } });
    if (!attempt) throw new EnterpriseWorkflowError("La tentative d’action est introuvable après son claim.", 409, "WORKFLOW_ACTION_ATTEMPT_MISSING", "TERMINAL");
    return { attempt, alreadySucceeded: false };
  }
  try {
    const attempt = await prisma.enterpriseWorkflowActionAttempt.create({ data: { organizationId, stepRunId, actionType, idempotencyKey, status: "RUNNING", attemptNumber: 1 } });
    return { attempt, alreadySucceeded: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await prisma.enterpriseWorkflowActionAttempt.findUnique({ where: { idempotencyKey } });
      if (concurrent?.status === "SUCCEEDED") return { attempt: concurrent, alreadySucceeded: true };
      throw actionInProgress();
    }
    throw error;
  }
}

export async function completeWorkflowActionAttempt(attemptId: string, result?: { entityType?: string | null; entityId?: string | null }) {
  return prisma.enterpriseWorkflowActionAttempt.update({ where: { id: attemptId }, data: { status: "SUCCEEDED", completedAt: new Date(), resultEntityType: result?.entityType || null, resultEntityId: result?.entityId || null, errorCategory: null, errorCode: null, errorMessage: null } });
}

export async function failWorkflowActionAttempt(attemptId: string, error: unknown) {
  const failure = safeWorkflowFailureMessage(error);
  await prisma.enterpriseWorkflowActionAttempt.updateMany({ where: { id: attemptId, status: "RUNNING" }, data: { status: "FAILED", completedAt: new Date(), errorCategory: failure.category, errorCode: failure.code, errorMessage: failure.message } });
  return failure;
}
