import type { WorkflowEntityAdapter, WorkflowEntitySnapshot } from "@/lib/enterprise/workflows/adapters/types";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";

const SOURCE_MODULE_BY_ENTITY: Record<string, string> = {
  EnterpriseTask: "TASKS_OPERATIONS",
  EnterpriseRequest: "INTERNAL_REQUESTS",
  EnterpriseMeeting: "MEETINGS",
  EnterprisePurchase: "SUPPLIERS_PURCHASES",
  EnterpriseBudget: "FINANCE_BUDGETS",
  EnterpriseExpense: "FINANCE_BUDGETS",
  EnterpriseReport: "REPORTS",
};

export function workflowSourceModule(entityType: string) {
  const moduleCode = SOURCE_MODULE_BY_ENTITY[entityType];
  if (!moduleCode) throw new EnterpriseWorkflowError("Le module source du workflow est inconnu.", 400, "WORKFLOW_SOURCE_MODULE_UNKNOWN", "CONFIGURATION");
  return moduleCode;
}

export async function resolveWorkflowExecutionUser({ organizationId, startedByUserId, adapter, entity }: { organizationId: string; startedByUserId?: string | null; adapter: WorkflowEntityAdapter; entity: WorkflowEntitySnapshot }) {
  const candidates = [startedByUserId, adapter.resolveEntityUser(entity, "ENTITY_REQUESTER"), adapter.resolveEntityUser(entity, "ENTITY_CREATOR"), adapter.resolveEntityUser(entity, "ENTITY_ASSIGNEE")].filter((value): value is string => Boolean(value));
  for (const candidate of [...new Set(candidates)]) {
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId: candidate, status: "ACTIVE", removedAt: null }, select: { userId: true } });
    if (member) return member.userId;
  }
  throw new EnterpriseWorkflowError("Aucun acteur métier actif ne peut exécuter cette étape.", 409, "WORKFLOW_EXECUTION_ACTOR_NOT_FOUND", "CONFIGURATION");
}
