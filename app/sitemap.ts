import type { MetadataRoute } from "next";

const appUrl = process.env.APP_URL || "https://dtsc-platform.com";

const publicRoutes = [
  { path: "/", priority: 1 },
  { path: "/data-afrique", priority: 0.86 },
  { path: "/bi-kpi", priority: 0.86 },
  { path: "/ia-entreprise", priority: 0.86 },
  { path: "/secteurs", priority: 0.82 },
  { path: "/conditions-utilisation", priority: 0.45 },
  { path: "/politique-confidentialite", priority: 0.45 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return publicRoutes.map((route) => ({
    url: new URL(route.path, appUrl).toString(),
    lastModified: now,
    changeFrequency: route.path === "/" ? "weekly" : "monthly",
    priority: route.priority,
  }));
}
