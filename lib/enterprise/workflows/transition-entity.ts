import type { WorkflowEntityAdapter, WorkflowEntitySnapshot } from "@/lib/enterprise/workflows/adapters/types";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";

export async function loadWorkflowTransitionEntity(adapter: WorkflowEntityAdapter, organizationId: string, entityId: string, before: WorkflowEntitySnapshot, output: unknown) {
  const current = await adapter.loadEntity(organizationId, entityId);
  if (current.organizationId !== organizationId || current.id !== entityId) throw new EnterpriseWorkflowError("L’objet source ne correspond plus à cette exécution.", 409, "WORKFLOW_SOURCE_SCOPE_MISMATCH", "SECURITY");
  const result = output && typeof output === "object" ? output as Record<string, unknown> : {};
  const expectedRevision = Math.max(typeof before.revision === "number" ? before.revision : 0, typeof result.revision === "number" ? result.revision : 0);
  if (expectedRevision > 0 && (typeof current.revision !== "number" || current.revision < expectedRevision)) throw new EnterpriseWorkflowError("L’objet source a changé. Actualisez avant de reprendre le workflow.", 409, "WORKFLOW_SOURCE_REVISION_CONFLICT", "BUSINESS");
  return current;
}
