import { prisma } from "@/lib/prisma";

export async function notifyUser({
  userId,
  title,
  body,
  type = "INFO",
  targetUrl,
}: {
  userId: string;
  title: string;
  body: string;
  type?: string;
  targetUrl?: string;
}) {
  return prisma.notification.create({
    data: { userId, title, body, type, targetUrl },
  });
}

export async function notifyUsers({
  userIds,
  title,
  body,
  type = "INFO",
  targetUrl,
}: {
  userIds: string[];
  title: string;
  body: string;
  type?: string;
  targetUrl?: string;
}) {
  if (!userIds.length) {
    return;
  }

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, title, body, type, targetUrl })),
  });
}
