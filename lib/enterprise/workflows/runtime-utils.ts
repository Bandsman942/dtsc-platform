import type { WorkflowEntityAdapter, WorkflowEntitySnapshot } from "@/lib/enterprise/workflows/adapters/types";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";
import { moduleCodeForEnterpriseEntity } from "@/lib/enterprise/cross-module/deep-links";
import { getCanonicalEnterpriseModuleCode } from "@/lib/enterprise/module-registry";

export function workflowSourceModule(entityType: string) {
  const sourceModule = moduleCodeForEnterpriseEntity(entityType);
  const moduleCode = sourceModule ? getCanonicalEnterpriseModuleCode(sourceModule) : null;
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
