import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { WORKFLOW_DOMAIN_EVENTS, WORKFLOW_LIMITS } from "@/lib/enterprise/workflows/constants";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";

export type WorkflowTransaction = Prisma.TransactionClient;

type DomainEventInput = {
  organizationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  revision?: number | null;
  occurredAt?: Date;
  metadata?: Prisma.InputJsonValue;
  idempotencyKey?: string;
};

function boundedPayload(input: DomainEventInput): Prisma.InputJsonValue {
  const payload = {
    fromStatus: input.fromStatus || null,
    toStatus: input.toStatus || null,
    actorUserId: input.actorUserId || null,
    revision: input.revision ?? null,
    occurredAt: (input.occurredAt || new Date()).toISOString(),
    metadata: input.metadata || null,
  };
  const encoded = JSON.stringify(payload);
  if (Buffer.byteLength(encoded, "utf8") > WORKFLOW_LIMITS.maxPayloadBytes) {
    throw new EnterpriseWorkflowError("Le payload de l’événement métier dépasse la limite autorisée.", 400, "DOMAIN_EVENT_PAYLOAD_TOO_LARGE", "CONFIGURATION");
  }
  return payload;
}

export function buildDomainEventIdempotencyKey(input: DomainEventInput) {
  if (input.idempotencyKey) return input.idempotencyKey;
  const seed = [input.organizationId, input.entityType, input.entityId, input.eventType, input.revision ?? "na", input.fromStatus ?? "na", input.toStatus ?? "na"].join(":");
  return `workflow-event:${createHash("sha256").update(seed).digest("hex")}`;
}

export async function enqueueWorkflowDomainEvent(tx: WorkflowTransaction, input: DomainEventInput) {
  if (!(WORKFLOW_DOMAIN_EVENTS as readonly string[]).includes(input.eventType)) return null;
  const idempotencyKey = buildDomainEventIdempotencyKey(input);
  try {
    return await tx.enterpriseDomainEvent.create({
      data: {
        organizationId: input.organizationId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        payloadJson: boundedPayload(input),
        idempotencyKey,
        occurredAt: input.occurredAt || new Date(),
        processingStatus: "PENDING",
        availableAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return tx.enterpriseDomainEvent.findUnique({ where: { idempotencyKey } });
    }
    throw error;
  }
}

export async function enqueueWorkflowDomainEventAfterCommit(input: DomainEventInput) {
  return prisma.$transaction((tx) => enqueueWorkflowDomainEvent(tx, input));
}
