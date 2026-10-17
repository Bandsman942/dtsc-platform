import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { listReadableWorkflowEntityTypes } from "@/lib/enterprise/workflows/source-access";

/**
 * Workflow Engine v2 is the only active source exposed to collaborators.
 * The legacy archive delegate (`prisma.enterpriseWorkflow`) remains available
 * only through protected historical/read-only paths and is never queried here.
 */
export async function getEnterpriseActivityWorkflows(organizationId: string, userId: string) {
  const capabilities = await resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "WORKFLOWS" });
  if (!capabilities.canRead) return [];
  const readableTypes = new Set(await listReadableWorkflowEntityTypes(userId, organizationId));
  const definitions = await prisma.enterpriseWorkflowDefinition.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      OR: [
        { allowManualStart: true },
        { triggerEntityType: "EnterpriseRequest", triggerEventType: "ENTERPRISE_REQUEST_SUBMITTED" },
      ],
      currentVersionId: { not: null },
      archivedAt: null,
      versions: { some: { status: "PUBLISHED" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      updatedAt: true,
      triggerEntityType: true,
      triggerEventType: true,
      allowManualStart: true,
      versions: {
        where: { status: "PUBLISHED" },
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          versionNumber: true,
          steps: {
            orderBy: { position: "asc" },
            select: {
              code: true,
              name: true,
              description: true,
              stepType: true,
              position: true,
            },
          },
        },
      },
    },
  });

  return definitions.filter((definition) => definition.allowManualStart || (definition.triggerEntityType && readableTypes.has(definition.triggerEntityType as "EnterpriseRequest"))).map((definition) => ({
    id: definition.id,
    workflowCode: definition.code,
    labelFr: definition.name,
    labelEn: definition.name,
    descriptionFr: definition.description,
    stepsJson: definition.versions[0]?.steps || [],
    updatedAt: definition.updatedAt,
    triggerEntityType: definition.triggerEntityType,
    triggerEventType: definition.triggerEventType,
  }));
}
