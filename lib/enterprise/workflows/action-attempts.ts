import { Prisma } from "@prisma/client";
import { WORKFLOW_LIMITS } from "@/lib/enterprise/workflows/constants";
import { EnterpriseWorkflowError, safeWorkflowFailureMessage } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";

export function workflowActionIdempotencyKey(runId: string, stepId: string, actionType: string) {
  return `workflow:${runId}:${stepId}:${actionType}`;
}

export async function beginWorkflowActionAttempt({ organizationId, stepRunId, runId, stepId, actionType }: { organizationId: string; stepRunId: string; runId: string; stepId: string; actionType: string }) {
  const idempotencyKey = workflowActionIdempotencyKey(runId, stepId, actionType);
  const existing = await prisma.enterpriseWorkflowActionAttempt.findUnique({ where: { idempotencyKey } });
  if (existing?.status === "SUCCEEDED") return { attempt: existing, alreadySucceeded: true };
  if (existing && existing.attemptNumber >= WORKFLOW_LIMITS.maxAttempts && existing.status === "FAILED") {
    throw new EnterpriseWorkflowError("Le nombre maximal de tentatives est atteint.", 409, "WORKFLOW_MAX_ATTEMPTS_REACHED", "TERMINAL");
  }
  if (existing) {
    const attempt = await prisma.enterpriseWorkflowActionAttempt.update({ where: { id: existing.id }, data: { status: "RUNNING", attemptNumber: { increment: 1 }, startedAt: new Date(), completedAt: null, errorCategory: null, errorCode: null, errorMessage: null } });
    return { attempt, alreadySucceeded: false };
  }
  try {
    const attempt = await prisma.enterpriseWorkflowActionAttempt.create({ data: { organizationId, stepRunId, actionType, idempotencyKey, status: "RUNNING", attemptNumber: 1 } });
    return { attempt, alreadySucceeded: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await prisma.enterpriseWorkflowActionAttempt.findUnique({ where: { idempotencyKey } });
      if (concurrent) return { attempt: concurrent, alreadySucceeded: concurrent.status === "SUCCEEDED" };
    }
    throw error;
  }
}

export async function completeWorkflowActionAttempt(attemptId: string, result?: { entityType?: string | null; entityId?: string | null }) {
  return prisma.enterpriseWorkflowActionAttempt.update({ where: { id: attemptId }, data: { status: "SUCCEEDED", completedAt: new Date(), resultEntityType: result?.entityType || null, resultEntityId: result?.entityId || null, errorCategory: null, errorCode: null, errorMessage: null } });
}

export async function failWorkflowActionAttempt(attemptId: string, error: unknown) {
  const failure = safeWorkflowFailureMessage(error);
  await prisma.enterpriseWorkflowActionAttempt.update({ where: { id: attemptId }, data: { status: "FAILED", completedAt: new Date(), errorCategory: failure.category, errorCode: failure.code, errorMessage: failure.message } });
  return failure;
}
