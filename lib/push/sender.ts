import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWebPushConfigurationState } from "@/lib/push/config";
import { webPushQueueOrganizationId } from "@/lib/push/constants";
import { createDtscPushPayload } from "@/lib/push/payload";
import { sendEncryptedWebPush } from "@/lib/push/web-push";
import { resolvePushNotificationContentMode } from "@/lib/session-preference";

export class WebPushDispatchError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "WebPushDispatchError";
  }
}

export type WebPushDispatchSummary = {
  outcome: "DELIVERED" | "SKIPPED";
  delivered: number;
  staleRemoved: number;
  permanentFailures: number;
};

function isRetryablePushStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function dispatchStoredPushNotification({
  notificationId,
  expectedQueueOrganizationId,
}: {
  notificationId: string;
  expectedQueueOrganizationId: string;
}): Promise<WebPushDispatchSummary> {
  const configuration = getWebPushConfigurationState();
  if (!configuration.configured || !configuration.config) {
    throw new WebPushDispatchError("WEB_PUSH_CONFIGURATION_UNAVAILABLE", true);
  }
  const config = configuration.config;

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      title: true,
      body: true,
      type: true,
      targetUrl: true,
      user: {
        select: {
          status: true,
          pushNotificationsEnabled: true,
          pushSubscriptions: {
            select: { id: true, endpoint: true, p256dh: true, auth: true },
            orderBy: { updatedAt: "desc" },
            take: 12,
          },
        },
      },
    },
  });

  if (!notification) {
    return { outcome: "SKIPPED", delivered: 0, staleRemoved: 0, permanentFailures: 0 };
  }

  if (webPushQueueOrganizationId(notification.organizationId) !== expectedQueueOrganizationId) {
    throw new WebPushDispatchError("WEB_PUSH_QUEUE_SCOPE_MISMATCH", false);
  }

  const user = notification.user;
  if (user.status !== UserStatus.ACTIVE || !user.pushNotificationsEnabled || !user.pushSubscriptions.length) {
    return { outcome: "SKIPPED", delivered: 0, staleRemoved: 0, permanentFailures: 0 };
  }

  const preference = await prisma.userSessionPreference.findUnique({
    where: { userId: notification.userId },
    select: { pushNotificationContentMode: true },
  }).catch(() => null);
  const contentMode = resolvePushNotificationContentMode(preference?.pushNotificationContentMode);
  const payload = JSON.stringify(createDtscPushPayload({
    notificationId: notification.id,
    type: notification.type,
    targetUrl: notification.targetUrl,
    contentMode,
    detailTitle: notification.title,
    detailBody: notification.body,
  }));

  const deliveries = await Promise.allSettled(user.pushSubscriptions.map(async (subscription) => {
    const result = await sendEncryptedWebPush({ subscription, payload, config });
    return { subscriptionId: subscription.id, result };
  }));

  let delivered = 0;
  let staleRemoved = 0;
  let permanentFailures = 0;
  let retryableFailures = 0;

  for (const delivery of deliveries) {
    if (delivery.status === "rejected") {
      retryableFailures += 1;
      continue;
    }
    const { subscriptionId, result } = delivery.value;
    if (result.ok) {
      delivered += 1;
      continue;
    }
    if (result.status === 404 || result.status === 410) {
      staleRemoved += 1;
      await prisma.pushSubscription.deleteMany({
        where: { id: subscriptionId, userId: notification.userId },
      });
      continue;
    }
    if (isRetryablePushStatus(result.status)) {
      retryableFailures += 1;
      continue;
    }
    permanentFailures += 1;
  }

  if (retryableFailures > 0) {
    throw new WebPushDispatchError("WEB_PUSH_TRANSIENT_FAILURE", true);
  }

  return {
    outcome: delivered > 0 ? "DELIVERED" : "SKIPPED",
    delivered,
    staleRemoved,
    permanentFailures,
  };
}
