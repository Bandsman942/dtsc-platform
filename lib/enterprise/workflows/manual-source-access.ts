import { findWorkflowManualSources } from "@/lib/enterprise/workflows/manual-source-options";

/**
 * POST must recheck EXACTLY the same tenant, ownership, canonical ERP
 * sub-type and status predicates that were used to render picker options.
 * This check never substitutes for module entitlement or workflow RBAC.
 */
export async function isWorkflowManualSourceSelectable({
  organizationId, userId, entityType, entityId, allowAll,
}: { organizationId: string; userId: string; entityType: string; entityId: string; allowAll: boolean }) {
  const sources = await findWorkflowManualSources({
    organizationId, userId, entityType, sourceEntityId: entityId, allowAll,
  });
  return Boolean(sources?.some((source) => source.id === entityId));
}
