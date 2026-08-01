import { prisma } from "@/lib/prisma";

/**
 * Workflow Engine v2 is the only active source exposed to collaborators.
 * The legacy archive delegate (`prisma.enterpriseWorkflow`) remains available
 * only through protected historical/read-only paths and is never queried here.
 */
export async function getEnterpriseActivityWorkflows(organizationId: string) {
  const definitions = await prisma.enterpriseWorkflowDefinition.findMany({
    where: {
      organizationId,
      status: "PUBLISHED",
      allowManualStart: true,
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

  return definitions.map((definition) => ({
    id: definition.id,
    workflowCode: definition.code,
    labelFr: definition.name,
    labelEn: definition.name,
    descriptionFr: definition.description,
    stepsJson: definition.versions[0]?.steps || [],
    updatedAt: definition.updatedAt,
  }));
}
