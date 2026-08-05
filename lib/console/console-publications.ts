import { Prisma } from "@prisma/client";
import { buildConsolePagination, normalizeConsoleSearch, parseConsolePagination } from "@/lib/console/console-pagination";
import { prisma } from "@/lib/prisma";

export async function getConsolePublicationsDataset(input: {
  page?: string | number | null;
  pageSize?: string | number | null;
  search?: string | null;
  published?: boolean | null;
  category?: string | null;
} = {}) {
  const paging = parseConsolePagination({ page: input.page, pageSize: input.pageSize, defaultPageSize: 20, maxPageSize: 100 });
  const search = normalizeConsoleSearch(input.search);
  const where: Prisma.PublicPublicationWhereInput = {
    ...(typeof input.published === "boolean" ? { published: input.published } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(search
      ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }, { excerpt: { contains: search, mode: "insensitive" } }] }
      : {}),
  };

  const [publicPublications, total, categories, publishedCount, draftCount] = await Promise.all([
    prisma.publicPublication.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { author: { select: { name: true, email: true } }, _count: { select: { versions: true, comments: true, reactions: true } } },
      skip: paging.skip,
      take: paging.take,
    }),
    prisma.publicPublication.count({ where }),
    prisma.publicPublication.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
    prisma.publicPublication.count({ where: { published: true } }),
    prisma.publicPublication.count({ where: { published: false } }),
  ]);

  return {
    publicPublications,
    categories: categories.map((item) => item.category),
    summary: { published: publishedCount, drafts: draftCount },
    pagination: buildConsolePagination(total, paging.page, paging.pageSize),
    filters: { search, published: typeof input.published === "boolean" ? input.published : null, category: input.category || null },
    freshness: new Date().toISOString(),
  };
}
