import type { EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import { listNavigableEnterpriseModules, resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { WORKFLOW_ENTITY_TYPES } from "@/lib/enterprise/workflows/constants";
import { workflowSourceModule } from "@/lib/enterprise/workflows/runtime-utils";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";

/** Reuse the canonical ERP register and commercial entitlements; never infer rights from workflow membership alone. */
export async function requireWorkflowSourceAccess(input: {
  userId: string;
  organizationId: string;
  sourceEntityType: string;
  action?: EnterpriseModuleAction;
}) {
  const moduleCode = workflowSourceModule(input.sourceEntityType);
  const decision = await resolveEnterpriseModuleAccess({
    userId: input.userId,
    organizationId: input.organizationId,
    moduleCode,
    action: input.action || "read",
  });
  if (!decision.allowed) {
    throw new EnterpriseWorkflowError(
      "Votre fonction ou votre abonnement ne permet pas cette opération sur le module métier.",
      403,
      "WORKFLOW_SOURCE_MODULE_ACCESS_DENIED",
      "SECURITY",
    );
  }
  return decision;
}

/** One entitlement snapshot, not a DB query per workflow run or source type. */
export async function listReadableWorkflowEntityTypes(userId: string, organizationId: string) {
  const modules = await listNavigableEnterpriseModules({ userId, organizationId, action: "read" });
  const allowed = new Set(modules.map((entry) => entry.canonicalCode));
  return WORKFLOW_ENTITY_TYPES.filter((entityType) => allowed.has(workflowSourceModule(entityType)));
}

/** Check the persisted source type, never a client-supplied substitute. */
export async function requireWorkflowDefinitionSourceAccess(input: {
  userId: string;
  organizationId: string;
  definitionId: string;
}) {
  const definition = await prisma.enterpriseWorkflowDefinition.findFirst({
    where: { id: input.definitionId, organizationId: input.organizationId, archivedAt: null },
    select: { triggerEntityType: true },
  });
  if (!definition) throw new EnterpriseWorkflowError("Workflow introuvable.", 404, "WORKFLOW_DEFINITION_NOT_FOUND", "BUSINESS");
  if (definition.triggerEntityType) {
    await requireWorkflowSourceAccess({
      userId: input.userId, organizationId: input.organizationId,
      sourceEntityType: definition.triggerEntityType, action: "read",
    });
  }
  return definition;
}
