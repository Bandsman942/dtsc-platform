import { prisma } from "@/lib/prisma";

export async function getConsolePublicationsDataset({ loadPublicationDetails }: { loadPublicationDetails: boolean }) {
  const publicPublications = loadPublicationDetails ? await prisma.publicPublication.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, email: true } } },
    take: 40,
  }) : [];

  return { publicPublications };
}
