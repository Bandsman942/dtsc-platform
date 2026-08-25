import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  KNOWLEDGE_INDEX_ENTITY_TYPE,
  KNOWLEDGE_INDEX_EVENT_TYPE,
  KNOWLEDGE_INDEX_PERSONAL_SCOPE,
} from "@/lib/knowledge-index/constants";

function eventId(documentId: string) {
  return `kix_${createHash("sha256").update(documentId).digest("hex").slice(0, 48)}`;
}

export function buildKnowledgeIndexEventData({ documentId, organizationId }: { documentId: string; organizationId: string | null }) {
  return {
    id: eventId(documentId),
    organizationId: organizationId || KNOWLEDGE_INDEX_PERSONAL_SCOPE,
    eventType: KNOWLEDGE_INDEX_EVENT_TYPE,
    entityType: KNOWLEDGE_INDEX_ENTITY_TYPE,
    entityId: documentId,
    idempotencyKey: `platform:knowledge-index:${documentId}`,
    processingStatus: "PENDING",
    availableAt: new Date(),
  } as const;
}

export async function enqueueKnowledgeIndexJob({ documentId, organizationId }: { documentId: string; organizationId: string | null }) {
  const data = buildKnowledgeIndexEventData({ documentId, organizationId });
  await prisma.enterpriseDomainEvent.upsert({
    where: { id: data.id },
    create: data,
    update: {
      organizationId: data.organizationId,
      entityId: documentId,
      processingStatus: "PENDING",
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      processedAt: null,
      lastError: null,
    },
  });
  return data.id;
}
