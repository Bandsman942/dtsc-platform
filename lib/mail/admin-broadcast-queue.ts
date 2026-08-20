import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildWebPushDomainEventData } from "@/lib/push/queue";
import {
  ADMIN_BROADCAST_EMAIL_DELIVERY_ENTITY_TYPE,
  ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE,
  ADMIN_BROADCAST_EMAIL_PAYLOAD_ENTITY_TYPE,
  ADMIN_BROADCAST_EMAIL_PAYLOAD_EVENT_TYPE,
  ADMIN_BROADCAST_PLATFORM_ORGANIZATION_ID,
} from "@/lib/mail/broadcast-constants";

type AdminBroadcastRecipient = {
  id: string;
  email: string;
  name: string;
  notifyBroadcastEnabled: boolean;
};

type AdminBroadcastMailPayload = {
  subject: string;
  message: string;
  htmlMessage?: string;
  heading?: string;
  source?: string;
};

function personalizeUserToken(content: string, name: string) {
  return content.replace(/\{user\}/gi, name);
}

function deterministicNotificationId(broadcastId: string, userId: string) {
  return `ntf_${createHash("sha256").update(`${broadcastId}:${userId}`).digest("hex").slice(0, 48)}`;
}

function deliveryEventId(broadcastId: string, recipientKey: string) {
  return `abe_${createHash("sha256").update(`${broadcastId}:${recipientKey}`).digest("hex").slice(0, 48)}`;
}

export async function enqueueAdminBroadcast({
  recipients,
  title,
  body,
  bodyHtml,
  type,
}: {
  recipients: AdminBroadcastRecipient[];
  title: string;
  body: string;
  bodyHtml?: string | null;
  type: string;
}) {
  const broadcastId = `broadcast_${randomUUID().replaceAll("-", "")}`;
  const hasUserPlaceholder = /\{user\}/i.test(`${body} ${bodyHtml || ""}`);
  if (!recipients.length) {
    return {
      broadcastId,
      recipients: 0,
      notificationsQueued: 0,
      pushJobsQueued: 0,
      emailJobsQueued: 0,
      personalized: hasUserPlaceholder,
    };
  }

  const payloadEventId = `abp_${randomUUID().replaceAll("-", "")}`;
  const notificationRecipients = recipients.filter((recipient) => recipient.notifyBroadcastEnabled);
  const notificationRows = notificationRecipients.map((recipient) => ({
    id: deterministicNotificationId(broadcastId, recipient.id),
    userId: recipient.id,
    organizationId: null,
    title: hasUserPlaceholder ? personalizeUserToken(title, recipient.name) : title,
    body: hasUserPlaceholder ? personalizeUserToken(body, recipient.name) : body,
    type,
    targetUrl: "/notifications",
  }));
  const pushEvents = notificationRows.map((notification) => buildWebPushDomainEventData({
    notificationId: notification.id,
    organizationId: notification.organizationId,
  }));

  const mailPayload: AdminBroadcastMailPayload = {
    subject: title,
    message: body,
    ...(bodyHtml ? { htmlMessage: bodyHtml } : {}),
    heading: "Admin-DTSC",
    source: "admin-broadcast",
  };

  const payloadEvent = {
    id: payloadEventId,
    organizationId: ADMIN_BROADCAST_PLATFORM_ORGANIZATION_ID,
    eventType: ADMIN_BROADCAST_EMAIL_PAYLOAD_EVENT_TYPE,
    entityType: ADMIN_BROADCAST_EMAIL_PAYLOAD_ENTITY_TYPE,
    entityId: broadcastId,
    payloadJson: mailPayload as Prisma.InputJsonValue,
    idempotencyKey: `platform:admin-broadcast-email-payload:${broadcastId}`,
    processingStatus: "PROCESSED",
    availableAt: new Date(),
    processedAt: new Date(),
  };

  const deliveryEvents = hasUserPlaceholder
    ? recipients.map((recipient) => ({
        id: deliveryEventId(broadcastId, recipient.id),
        organizationId: ADMIN_BROADCAST_PLATFORM_ORGANIZATION_ID,
        eventType: ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE,
        entityType: ADMIN_BROADCAST_EMAIL_DELIVERY_ENTITY_TYPE,
        entityId: `${broadcastId}:${recipient.id}`,
        payloadJson: {
          payloadEventId,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          personalized: true,
        } as Prisma.InputJsonValue,
        idempotencyKey: `platform:admin-broadcast-email:${broadcastId}:${recipient.id}`,
        processingStatus: "PENDING",
        availableAt: new Date(),
      }))
    : [{
        id: deliveryEventId(broadcastId, "group"),
        organizationId: ADMIN_BROADCAST_PLATFORM_ORGANIZATION_ID,
        eventType: ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE,
        entityType: ADMIN_BROADCAST_EMAIL_DELIVERY_ENTITY_TYPE,
        entityId: `${broadcastId}:group`,
        payloadJson: {
          payloadEventId,
          recipientEmails: recipients.map((recipient) => recipient.email),
          personalized: false,
        } as Prisma.InputJsonValue,
        idempotencyKey: `platform:admin-broadcast-email:${broadcastId}:group`,
        processingStatus: "PENDING",
        availableAt: new Date(),
      }];

  await prisma.$transaction(async (tx) => {
    if (notificationRows.length) await tx.notification.createMany({ data: notificationRows });
    if (pushEvents.length) await tx.enterpriseDomainEvent.createMany({ data: pushEvents });
    await tx.enterpriseDomainEvent.create({ data: payloadEvent });
    await tx.enterpriseDomainEvent.createMany({ data: deliveryEvents });
  });

  return {
    broadcastId,
    recipients: recipients.length,
    notificationsQueued: notificationRows.length,
    pushJobsQueued: pushEvents.length,
    emailJobsQueued: deliveryEvents.length,
    personalized: hasUserPlaceholder,
  };
}
