import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const appUrl = process.env.APP_URL || "https://dtsc-platform.com";

const publicRoutes = [
  { path: "/", priority: 1 },
  { path: "/services", priority: 0.92 },
  { path: "/solutions", priority: 0.92 },
  { path: "/secteurs", priority: 0.9 },
  { path: "/projets", priority: 0.84 },
  { path: "/ressources", priority: 0.88 },
  { path: "/a-propos", priority: 0.84 },
  { path: "/contact", priority: 0.9 },
  { path: "/data-afrique", priority: 0.86 },
  { path: "/bi-kpi", priority: 0.86 },
  { path: "/ia-entreprise", priority: 0.86 },
  { path: "/conditions-utilisation", priority: 0.45 },
  { path: "/politique-confidentialite", priority: 0.45 },
  { path: "/politique-cookies", priority: 0.45 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries = publicRoutes.map((route) => ({
    url: new URL(route.path, appUrl).toString(),
    lastModified: now,
    changeFrequency: route.path === "/" ? ("weekly" as const) : ("monthly" as const),
    priority: route.priority,
  }));

  try {
    const publications = await prisma.publicPublication.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return [
      ...staticEntries,
      ...publications.map((publication) => ({
        url: new URL(`/ressources/${publication.slug}`, appUrl).toString(),
        lastModified: publication.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.72,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
