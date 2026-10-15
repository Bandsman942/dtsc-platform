import type { WorkflowEntityAdapter, WorkflowEntitySnapshot } from "@/lib/enterprise/workflows/adapters/types";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";
import { moduleCodeForEnterpriseEntity } from "@/lib/enterprise/cross-module/deep-links";
import { getCanonicalEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

export function workflowSourceModule(entityType: string) {
  const sourceModule = moduleCodeForEnterpriseEntity(entityType);
  const moduleCode = sourceModule ? getCanonicalEnterpriseModuleCode(sourceModule) : null;
  if (!moduleCode) throw new EnterpriseWorkflowError("Le module source du workflow est inconnu.", 400, "WORKFLOW_SOURCE_MODULE_UNKNOWN", "CONFIGURATION");
  return moduleCode;
}

/**
 * Do not silently replace the actor named when the run was started. Revoking
 * that membership or the source-module entitlement must block future effects.
 * For event runs without a starter, only live, authorized business actors may
 * be selected from the trusted entity snapshot.
 */
export async function resolveWorkflowExecutionUser({ organizationId, startedByUserId, adapter, entity }: {
  organizationId: string;
  startedByUserId?: string | null;
  adapter: WorkflowEntityAdapter;
  entity: WorkflowEntitySnapshot;
}) {
  const candidates = startedByUserId
    ? [startedByUserId]
    : [
        adapter.resolveEntityUser(entity, "ENTITY_REQUESTER"),
        adapter.resolveEntityUser(entity, "ENTITY_CREATOR"),
        adapter.resolveEntityUser(entity, "ENTITY_ASSIGNEE"),
      ].filter((value): value is string => Boolean(value));
  const moduleCode = workflowSourceModule(adapter.entityType);
  for (const candidate of [...new Set(candidates)]) {
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId, userId: candidate, status: "ACTIVE", removedAt: null },
      select: { userId: true },
    });
    if (!membership) {
      if (startedByUserId) break;
      continue;
    }
    const decision = await resolveEnterpriseModuleAccess({ userId: candidate, organizationId, moduleCode, action: "read" });
    if (decision.allowed) return membership.userId;
    if (startedByUserId) break;
  }
  throw new EnterpriseWorkflowError(
    "Le mandat de l’acteur métier n’est plus valide dans cette entreprise.",
    403,
    "WORKFLOW_EXECUTION_MANDATE_REVOKED",
    "BUSINESS",
  );
}
