import { Prisma } from "@prisma/client";
import type { WorkflowErrorCategory } from "@/lib/enterprise/workflows/constants";

export class EnterpriseWorkflowError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly category: WorkflowErrorCategory = "BUSINESS"
  ) {
    super(message);
    this.name = "EnterpriseWorkflowError";
  }
}

export function normalizeWorkflowError(error: unknown) {
  if (error instanceof EnterpriseWorkflowError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return new EnterpriseWorkflowError("Cette action a déjà été traitée.", 409, "WORKFLOW_IDEMPOTENCY_CONFLICT", "BUSINESS");
    if (error.code === "P2034") return new EnterpriseWorkflowError("Conflit transactionnel temporaire. Réessayez.", 503, "WORKFLOW_TRANSACTION_RETRY", "TRANSIENT");
  }
  return new EnterpriseWorkflowError("Le moteur de workflow n’a pas pu terminer cette action.", 500, "WORKFLOW_INTERNAL_ERROR", "TERMINAL");
}

export function safeWorkflowFailureMessage(error: unknown) {
  const normalized = normalizeWorkflowError(error);
  return { category: normalized.category, code: normalized.code, message: normalized.message, status: normalized.status };
}
