import { NextResponse } from "next/server";
import { z } from "zod";
import { formatEnumLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { normalizePublicSearch, publicSearchIndex, type PublicSearchItem } from "@/lib/public-search";

const querySchema = z.object({
  q: z.string().trim().max(80).default(""),
});

export const dynamic = "force-dynamic";

function searchStaticItems(query: string) {
  const normalizedQuery = normalizePublicSearch(query);
  if (!normalizedQuery) {
    return publicSearchIndex.slice(0, 6);
  }

  return publicSearchIndex
    .filter((item) =>
      normalizePublicSearch(`${item.title} ${item.description} ${item.category}`).includes(normalizedQuery)
    )
    .slice(0, 8);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") || "" });

  if (!parsed.success) {
    return NextResponse.json({ results: [] satisfies PublicSearchItem[] }, { status: 400 });
  }

  const query = parsed.data.q;
  const staticResults = searchStaticItems(query);
  const normalizedQuery = normalizePublicSearch(query);

  if (!normalizedQuery) {
    return NextResponse.json({ results: staticResults });
  }

  try {
    const publications = await prisma.publicPublication.findMany({
      where: {
        published: true,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { excerpt: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { title: true, excerpt: true, slug: true, category: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    const publicationResults = publications.map((publication) => ({
      title: publication.title,
      description: publication.excerpt,
      href: `/ressources/${publication.slug}`,
      category: formatEnumLabel(publication.category),
    }));

    return NextResponse.json({ results: [...staticResults, ...publicationResults].slice(0, 10) });
  } catch {
    return NextResponse.json({ results: staticResults });
  }
}
