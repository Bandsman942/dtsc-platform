import type { Prisma } from "@prisma/client";
import {
  WEB_PUSH_DOMAIN_ENTITY_TYPE,
  WEB_PUSH_DOMAIN_EVENT_TYPE,
  webPushQueueOrganizationId,
} from "@/lib/push/constants";

export type WebPushQueueTransaction = Prisma.TransactionClient;

export function buildWebPushDomainEventData({
  notificationId,
  organizationId,
}: {
  notificationId: string;
  organizationId?: string | null;
}) {
  return {
    organizationId: webPushQueueOrganizationId(organizationId),
    eventType: WEB_PUSH_DOMAIN_EVENT_TYPE,
    entityType: WEB_PUSH_DOMAIN_ENTITY_TYPE,
    entityId: notificationId,
    idempotencyKey: `platform:web-push:${notificationId}`,
    processingStatus: "PENDING",
    availableAt: new Date(),
  };
}

export async function enqueueWebPushNotification(
  tx: WebPushQueueTransaction,
  input: { notificationId: string; organizationId?: string | null },
) {
  return tx.enterpriseDomainEvent.create({
    data: buildWebPushDomainEventData(input),
  });
}
