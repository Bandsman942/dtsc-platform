import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { normalizeNotificationTarget } from "@/lib/notification-targets";
import { prisma } from "@/lib/prisma";
import { dispatchPushForNotification, dispatchPushForNotifications } from "@/lib/push/sender";

function notificationPreferenceField(type: string) {
  if (type === "SUPPORT") return "notifySupportEnabled" as const;
  if (type === "BROADCAST" || type === "ANNOUNCEMENT") return "notifyBroadcastEnabled" as const;
  if (type === "USAGE") return "notifyUsageEnabled" as const;
  return null;
}

function acceptsNotification(
  user: {
    notifySupportEnabled: boolean;
    notifyUsageEnabled: boolean;
    notifyBroadcastEnabled: boolean;
  },
  type: string,
) {
  const preferenceField = notificationPreferenceField(type);
  return preferenceField ? user[preferenceField] : true;
}

function deterministicNotificationId(idempotencyKey: string) {
  return `wf_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 48)}`;
}

export async function notifyUser({
  userId,
  title,
  body,
  type = "INFO",
  targetUrl,
  organizationId = null,
  idempotencyKey,
}: {
  userId: string;
  title: string;
  body: string;
  type?: string;
  targetUrl?: string;
  organizationId?: string | null;
  idempotencyKey?: string;
}) {
  if (notificationPreferenceField(type)) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        notifySupportEnabled: true,
        notifyUsageEnabled: true,
        notifyBroadcastEnabled: true,
      },
    });
    if (!user || !acceptsNotification(user, type)) return null;
  }

  const resolvedTargetUrl = normalizeNotificationTarget(targetUrl, "/notifications");
  let notification;
  try {
    notification = await prisma.notification.create({
      data: {
        ...(idempotencyKey ? { id: deterministicNotificationId(idempotencyKey) } : {}),
        userId,
        organizationId,
        title,
        body,
        type,
        targetUrl: resolvedTargetUrl,
      },
    });
  } catch (error) {
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.notification.findUnique({ where: { id: deterministicNotificationId(idempotencyKey) } });
    }
    throw error;
  }
  await dispatchPushForNotification({
    userId,
    notificationId: notification.id,
    type,
    targetUrl: resolvedTargetUrl,
  });
  return notification;
}

export async function notifyUsers({
  userIds,
  title,
  body,
  type = "INFO",
  targetUrl,
  organizationId = null,
}: {
  userIds: string[];
  title: string;
  body: string;
  type?: string;
  targetUrl?: string;
  organizationId?: string | null;
}) {
  if (!userIds.length) return;

  const allowedUserIds = notificationPreferenceField(type)
    ? (
        await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            notifySupportEnabled: true,
            notifyUsageEnabled: true,
            notifyBroadcastEnabled: true,
          },
        })
      )
        .filter((user) => acceptsNotification(user, type))
        .map((user) => user.id)
    : userIds;

  if (!allowedUserIds.length) return;

  const resolvedTargetUrl = normalizeNotificationTarget(targetUrl, "/notifications");
  await prisma.notification.createMany({
    data: allowedUserIds.map((userId) => ({ userId, organizationId, title, body, type, targetUrl: resolvedTargetUrl })),
  });
  const eventId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await dispatchPushForNotifications(allowedUserIds.map((userId) => ({
    userId,
    notificationId: `${eventId}-${userId}`,
    type,
    targetUrl: resolvedTargetUrl,
  })));
}
