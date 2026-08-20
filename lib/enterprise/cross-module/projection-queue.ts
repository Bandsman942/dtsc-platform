import { crossModuleDefinitionsFor } from "@/lib/enterprise/cross-module/event-catalog";
import { prisma } from "@/lib/prisma";

export const CROSS_MODULE_PROJECTION_LIMITS = {
  workerBatchSize: 20,
  staleProcessingSeconds: 300,
} as const;

export type CrossModuleProjectionQueueSnapshot = {
  available: boolean;
  ready: number | null;
  processing: number | null;
  dead: number | null;
  oldestReadyAgeMs: number | null;
  sampledAt: string;
};

export async function enqueueCrossModuleProjections(domainEventId: string) {
  const event = await prisma.enterpriseDomainEvent.findUnique({ where: { id: domainEventId } });
  if (!event) return { eventId: domainEventId, queued: 0 };

  const definitions = crossModuleDefinitionsFor(event.eventType);
  for (const definition of definitions) {
    await prisma.enterpriseCrossModuleProjection.upsert({
      where: {
        organizationId_domainEventId_consumerCode: {
          organizationId: event.organizationId,
          domainEventId: event.id,
          consumerCode: definition.consumerCode,
        },
      },
      update: {},
      create: {
        organizationId: event.organizationId,
        domainEventId: event.id,
        eventType: event.eventType,
        sourceEntityType: event.entityType,
        sourceEntityId: event.entityId,
        consumerCode: definition.consumerCode,
        targetModule: definition.targetModule,
        metadataJson: {
          canonicalEventType: definition.canonicalEventType,
          sourceModule: definition.sourceModule,
          confidential: Boolean(definition.confidential),
        },
      },
    });
  }

  return { eventId: event.id, queued: definitions.length };
}

export async function getCrossModuleProjectionQueueSnapshot(): Promise<CrossModuleProjectionQueueSnapshot> {
  const sampledAt = new Date();
  const staleProcessingBefore = new Date(sampledAt.getTime() - CROSS_MODULE_PROJECTION_LIMITS.staleProcessingSeconds * 1000);
  const readyWhere = { status: { in: ["PENDING", "FAILED"] }, availableAt: { lte: sampledAt } };

  try {
    const [ready, processing, dead, oldestReady] = await Promise.all([
      prisma.enterpriseCrossModuleProjection.count({ where: readyWhere }),
      prisma.enterpriseCrossModuleProjection.count({ where: { status: "PROCESSING", startedAt: { gte: staleProcessingBefore } } }),
      prisma.enterpriseCrossModuleProjection.count({ where: { status: "DEAD" } }),
      prisma.enterpriseCrossModuleProjection.findFirst({ where: readyWhere, orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }], select: { availableAt: true } }),
    ]);

    return {
      available: true,
      ready,
      processing,
      dead,
      oldestReadyAgeMs: oldestReady ? Math.max(0, sampledAt.getTime() - oldestReady.availableAt.getTime()) : null,
      sampledAt: sampledAt.toISOString(),
    };
  } catch {
    return {
      available: false,
      ready: null,
      processing: null,
      dead: null,
      oldestReadyAgeMs: null,
      sampledAt: sampledAt.toISOString(),
    };
  }
}
