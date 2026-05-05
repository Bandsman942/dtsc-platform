import { prisma } from "@/lib/prisma";

export async function notifyUser({
  userId,
  title,
  body,
  type = "INFO",
}: {
  userId: string;
  title: string;
  body: string;
  type?: string;
}) {
  return prisma.notification.create({
    data: { userId, title, body, type },
  });
}

export async function notifyUsers({
  userIds,
  title,
  body,
  type = "INFO",
}: {
  userIds: string[];
  title: string;
  body: string;
  type?: string;
}) {
  if (!userIds.length) {
    return;
  }

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, title, body, type })),
  });
}
