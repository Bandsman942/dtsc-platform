import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { normalizeNotificationTarget } from "@/lib/notification-targets";
import { prisma } from "@/lib/prisma";
import { buildWebPushDomainEventData, enqueueWebPushNotification } from "@/lib/push/queue";

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

function generatedNotificationId() {
  return `ntf_${randomUUID().replaceAll("-", "")}`;
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
  try {
    return await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
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
      await enqueueWebPushNotification(tx, {
        notificationId: notification.id,
        organizationId,
      });
      return notification;
    });
  } catch (error) {
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.notification.findUnique({ where: { id: deterministicNotificationId(idempotencyKey) } });
    }
    throw error;
  }
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
  const notifications = allowedUserIds.map((userId) => ({
    id: generatedNotificationId(),
    userId,
    organizationId,
    title,
    body,
    type,
    targetUrl: resolvedTargetUrl,
  }));

  await prisma.$transaction([
    prisma.notification.createMany({ data: notifications }),
    prisma.enterpriseDomainEvent.createMany({
      data: notifications.map((notification) => buildWebPushDomainEventData({
        notificationId: notification.id,
        organizationId: notification.organizationId,
      })),
    }),
  ]);
}
