import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWebPushConfig } from "@/lib/push/config";
import { createDtscPushPayload } from "@/lib/push/payload";
import { sendEncryptedWebPush } from "@/lib/push/web-push";
import { resolvePushNotificationContentMode } from "@/lib/session-preference";

type PushNotificationInput = {
  userId: string;
  notificationId: string;
  type: string;
  targetUrl?: string | null;
};

export async function dispatchPushForNotification(input: PushNotificationInput) {
  const config = getWebPushConfig();
  if (!config) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        status: true,
        pushNotificationsEnabled: true,
        pushSubscriptions: {
          select: { id: true, endpoint: true, p256dh: true, auth: true },
          orderBy: { updatedAt: "desc" },
          take: 12,
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || !user.pushNotificationsEnabled || !user.pushSubscriptions.length) {
      return;
    }

    const [preference, notification] = await Promise.all([
      prisma.userSessionPreference.findUnique({
        where: { userId: input.userId },
        select: { pushNotificationContentMode: true },
      }).catch(() => null),
      prisma.notification.findFirst({
        where: { id: input.notificationId, userId: input.userId },
        select: { title: true, body: true, targetUrl: true, type: true },
      }),
    ]);
    const contentMode = resolvePushNotificationContentMode(preference?.pushNotificationContentMode);
    const payload = JSON.stringify(createDtscPushPayload({
      notificationId: input.notificationId,
      type: notification?.type || input.type,
      targetUrl: notification?.targetUrl || input.targetUrl,
      contentMode,
      detailTitle: notification?.title,
      detailBody: notification?.body,
    }));

    await Promise.allSettled(user.pushSubscriptions.map(async (subscription) => {
      try {
        const result = await sendEncryptedWebPush({ subscription, payload, config });
        if ((result.status === 404 || result.status === 410) && !result.ok) {
          await prisma.pushSubscription.deleteMany({
            where: { id: subscription.id, userId: input.userId },
          });
        }
      } catch {
        // Push is best-effort. Never fail the business transaction that created the DB notification.
      }
    }));
  } catch {
    // Configuration, network or database errors must not cancel the primary DTSC action.
  }
}

export async function dispatchPushForNotifications(inputs: PushNotificationInput[]) {
  if (!inputs.length) return;
  await Promise.allSettled(inputs.map((input) => dispatchPushForNotification(input)));
}
