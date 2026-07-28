import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWebPushConfig } from "@/lib/push/config";
import { createDtscPushPayload } from "@/lib/push/payload";
import { sendEncryptedWebPush } from "@/lib/push/web-push";

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

    const payload = JSON.stringify(createDtscPushPayload(input));
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
