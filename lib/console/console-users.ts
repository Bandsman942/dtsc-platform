import { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getConsoleUsersDataset({ loadUserDetails, roleFilter }: { loadUserDetails: boolean; roleFilter?: UserRole }) {
  const [users, userCount, activeUserCount, conversationCount, messageCount, usageLogs] = await Promise.all([
    loadUserDetails ? prisma.user.findMany({
      where: roleFilter ? { role: roleFilter } : undefined,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { conversations: true } } },
      take: 200,
    }) : Promise.resolve([]),
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.usageLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  return {
    users,
    userCount,
    activeUserCount,
    conversationCount,
    messageCount,
    usageLogs,
  };
}
