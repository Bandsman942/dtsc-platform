import { prisma } from "@/lib/prisma";

export async function getConsoleSupportDataset({ loadActivityDetails }: { loadActivityDetails: boolean }) {
  const [conversations, tickets] = await Promise.all([
    loadActivityDetails ? prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: { user: true, _count: { select: { messages: true } } },
      take: 200,
    }) : Promise.resolve([]),
    loadActivityDetails ? prisma.supportTicket.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: true },
      take: 200,
    }) : Promise.resolve([]),
  ]);

  return { conversations, tickets };
}
